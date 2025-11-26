const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const MIDTRANS_SERVER_KEY = functions.config().midtrans?.server_key;
const MIDTRANS_CLIENT_KEY = functions.config().midtrans?.client_key || "";
const MIDTRANS_BASE_URL = "https://api.sandbox.midtrans.com";

if (!MIDTRANS_SERVER_KEY) {
  console.warn("Midtrans server key belum di-set. Jalankan:");
  console.warn(
    'firebase functions:config:set midtrans.server_key="<SERVER_KEY>" midtrans.client_key="<CLIENT_KEY>"',
  );
}

// Daftar event contoh: ganti sesuai kebutuhanmu / ambil dari Firestore kalau perlu
const eventsMap = {
  "kajian-tafsir-al-baqarah": {
    title: "Kajian Tafsir Al-Quran Surat Al-Baqarah",
    amount: 0,
  },
  "fiqih-muamalat-modern": {
    title: "Seminar Fiqih Muamalat dalam Kehidupan Modern",
    amount: 50000,
  },
  "hadits-arbain": {
    title: "Kajian Hadits Arbain An-Nawawi",
    amount: 70000,
  },
  "workshop-tahsin-tajwid": {
    title: "Workshop Tahsin dan Tajwid Al-Quran",
    amount: 100000,
  },
  "sirah-nabawiyah-mekkah": {
    title: "Kajian Sirah Nabawiyah: Periode Mekkah",
    amount: 120000,
  },
  "seminar-parenting-islami": {
    title: "Seminar Parenting Islami",
    amount: 150000,
  },
};

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function basicAuthHeader() {
  const auth = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");
  return `Basic ${auth}`;
}

async function chargeMidtrans(payload) {
  const { data } = await axios.post(`${MIDTRANS_BASE_URL}/v2/charge`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(),
    },
  });
  return data;
}

app.get("/ping", (_req, res) => {
  res.json({ status: "ok", clientKey: MIDTRANS_CLIENT_KEY ? "set" : "missing" });
});

app.post("/payments/create", async (req, res) => {
  try {
    if (!MIDTRANS_SERVER_KEY) {
      return res.status(500).json({ error: "Midtrans belum dikonfigurasi." });
    }

    const { eventId, paymentType, bank, customer } = req.body || {};
    const event = eventsMap[eventId];

    if (!event) {
      return res.status(400).json({ error: "Event tidak dikenal." });
    }
    if (!["bank_transfer", "qris"].includes(paymentType)) {
      return res
        .status(400)
        .json({ error: "paymentType harus bank_transfer atau qris." });
    }

    const orderId = `${eventId}-${Date.now()}`;

    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: event.amount,
      },
      customer_details: {
        first_name: customer?.name || "Peserta",
        email: customer?.email || "peserta@example.com",
        phone: customer?.phone || "",
      },
      item_details: [
        {
          id: eventId,
          price: event.amount,
          quantity: 1,
          name: event.title,
        },
      ],
    };

    if (paymentType === "bank_transfer") {
      payload.payment_type = "bank_transfer";
      payload.bank_transfer = { bank: (bank || "bca").toLowerCase() };
    } else {
      payload.payment_type = "qris";
    }

    const chargeResponse = await chargeMidtrans(payload);

    await db.collection("orders").doc(orderId).set({
      eventId,
      eventTitle: event.title,
      amount: event.amount,
      paymentType,
      bank: bank || null,
      customer: payload.customer_details,
      midtrans: chargeResponse,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const responsePayload = {
      orderId,
      eventId,
      eventTitle: event.title,
      amount: event.amount,
      paymentType,
      midtrans: chargeResponse,
    };

    if (paymentType === "bank_transfer") {
      const vaInfo = (chargeResponse && chargeResponse.va_numbers && chargeResponse.va_numbers[0]) || {};
      responsePayload.bank = vaInfo.bank || bank || "bca";
      responsePayload.vaNumber =
        vaInfo.va_number || chargeResponse.permata_va_number || null;
      responsePayload.pdfUrl =
        chargeResponse.pdf_url ||
        (Array.isArray(chargeResponse.actions)
          ? chargeResponse.actions.find((a) => a.name === "pdf")?.url
          : undefined);
    } else {
      responsePayload.qrString = chargeResponse.qr_string || "";
      responsePayload.qrUrl =
        chargeResponse.qr_url ||
        (Array.isArray(chargeResponse.actions)
          ? chargeResponse.actions.find((a) => a.name === "qr_code")?.url
          : undefined);
    }

    res.json(responsePayload);
  } catch (error) {
    // Log detail error midtrans jika ada
    // eslint-disable-next-line no-console
    console.error("Midtrans charge error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Gagal membuat pembayaran.",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/payments/webhook", async (req, res) => {
  try {
    const {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
    } = req.body || {};

    const expectedSignature = crypto
      .createHash("sha512")
      .update(`${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`)
      .digest("hex");

    if (signatureKey !== expectedSignature) {
      // eslint-disable-next-line no-console
      console.warn("Signature Midtrans tidak valid untuk order", orderId);
      return res.status(403).send("Invalid signature");
    }

    const statusMap = {
      capture: fraudStatus === "challenge" ? "challenge" : "paid",
      settlement: "paid",
      pending: "pending",
      deny: "deny",
      expire: "expired",
      cancel: "canceled",
    };

    await db
      .collection("orders")
      .doc(orderId)
      .set(
        {
          status: statusMap[transactionStatus] || transactionStatus,
          midtrans: req.body,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    res.json({ received: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Webhook error:", error.message);
    res.status(500).send("Webhook error");
  }
});

exports.api = functions.https.onRequest(app);
