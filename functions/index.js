const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

const TRIPAY_API_KEY = functions.config().trippay?.api_key || "";
const TRIPAY_PRIVATE_KEY = functions.config().trippay?.private_key || "";
const TRIPAY_MERCHANT_CODE = functions.config().trippay?.merchant_code || "";
const TRIPAY_MODE = functions.config().trippay?.mode || "sandbox";
const TRIPAY_BASE_URL =
  TRIPAY_MODE === "production" ? "https://tripay.co.id/api" : "https://tripay.co.id/api-sandbox";

if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
  console.warn("Tripay credential belum lengkap. Jalankan:");
  console.warn(
    'firebase functions:config:set trippay.api_key="<API_KEY>" trippay.private_key="<PRIVATE_KEY>" trippay.merchant_code="<MERCHANT_CODE>" [trippay.mode="production|sandbox"] [trippay.callback_url="https://.../api/payments/webhook"] [trippay.return_url="https://..."]',
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

const projectId = process.env.GCLOUD_PROJECT || "pengajian-online";
const defaultCallbackUrl = `https://us-central1-${projectId}.cloudfunctions.net/api/payments/webhook`;
const callbackUrl = functions.config().trippay?.callback_url || defaultCallbackUrl;
const returnUrl = functions.config().trippay?.return_url || "";

function createTripaySignature(merchantRef, amount) {
  if (!TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) return "";
  return crypto
    .createHmac("sha256", TRIPAY_PRIVATE_KEY)
    .update(`${TRIPAY_MERCHANT_CODE}${merchantRef}${Number(amount)}`)
    .digest("hex");
}

function resolveTripayMethod(paymentType, bank) {
  if (paymentType === "qris") return "QRIS";
  const normalized = (bank || "bca").toLowerCase();
  const map = {
    bca: "BCAVA",
    bni: "BNIVA",
    bri: "BRIVA",
    mandiri: "MANDIRIVA",
    permata: "PERMATAVA",
  };
  return map[normalized] || "BCAVA";
}

async function createTripayTransaction(payload) {
  const { data } = await axios.post(`${TRIPAY_BASE_URL}/transaction/create`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIPAY_API_KEY}`,
    },
  });
  return data;
}

async function cancelTripayTransaction({ reference, merchantRef }) {
  const ref = reference || merchantRef;
  if (!ref) throw new Error("reference atau merchantRef wajib untuk cancel Tripay");

  const payload = { reference: ref };
  if (merchantRef && !payload.merchant_ref) payload.merchant_ref = merchantRef;

  const { data } = await axios.post(`${TRIPAY_BASE_URL}/transaction/cancel`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIPAY_API_KEY}`,
    },
  });
  return data;
}

function normalizeTripayResponse(
  trx,
  { eventId, eventTitle, paymentType, bank, method, merchantRef, amount },
) {
  const payCode = trx?.pay_code || trx?.va_number || trx?.payment_code || null;
  return {
    provider: "tripay",
    orderId: merchantRef,
    reference: trx?.reference || trx?.reference_id,
    eventId,
    eventTitle,
    amount,
    paymentType,
    bank: bank || null,
    method,
    paymentName: trx?.payment_name || trx?.payment_method || method,
    vaNumber: paymentType === "bank_transfer" ? payCode : null,
    payCode,
    checkoutUrl: trx?.checkout_url || trx?.pay_url,
    qrUrl: trx?.qr_url || "",
    qrString: trx?.qr_string || "",
    instructions: trx?.instructions || [],
    expiresAt: trx?.expired_time
      ? new Date(Number(trx.expired_time) * 1000).toISOString()
      : null,
    status: trx?.status || "UNPAID",
  };
}

function verifyTripayCallback(body = {}) {
  if (!TRIPAY_PRIVATE_KEY) return false;
  const signature = body.signature || body.sign;
  if (!signature) return false;
  const merchantRef = body.merchant_ref || body.merchantRef || body.reference;
  const amount = body.total_amount ?? body.amount ?? body.amount_total;
  const status = body.status || "";
  const basePayload = `${merchantRef}${TRIPAY_MERCHANT_CODE}${amount}${status}`;
  const altPayload = `${TRIPAY_MERCHANT_CODE}${merchantRef}${amount}`;
  const expected = crypto.createHmac("sha256", TRIPAY_PRIVATE_KEY).update(basePayload).digest("hex");
  const altExpected = crypto.createHmac("sha256", TRIPAY_PRIVATE_KEY).update(altPayload).digest("hex");
  return signature === expected || signature === altExpected;
}

function mapStatus(status = "") {
  const normalized = status.toUpperCase();
  const statusMap = {
    PAID: "paid",
    PENDING: "pending",
    UNPAID: "pending",
    EXPIRED: "expired",
    FAILED: "failed",
    REFUND: "refunded",
    CANCEL: "canceled",
    CANCELED: "canceled",
  };
  return statusMap[normalized] || normalized.toLowerCase() || "pending";
}

app.get("/ping", (_req, res) => {
  res.json({
    status: "ok",
    provider: "tripay",
    mode: TRIPAY_MODE,
    config: TRIPAY_API_KEY && TRIPAY_PRIVATE_KEY && TRIPAY_MERCHANT_CODE ? "ready" : "missing",
  });
});

app.post("/payments/create", async (req, res) => {
  try {
    if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
      return res.status(500).json({ error: "Tripay belum dikonfigurasi." });
    }

    const { eventId, paymentType, bank, customer } = req.body || {};
    const event = eventsMap[eventId];

    if (!event) {
      return res.status(400).json({ error: "Event tidak dikenal." });
    }
    if (!event.amount || Number(event.amount) <= 0) {
      return res.status(400).json({ error: "Event ini gratis, tidak perlu pembayaran." });
    }
    if (!["bank_transfer", "qris"].includes(paymentType)) {
      return res
        .status(400)
        .json({ error: "paymentType harus bank_transfer atau qris." });
    }

    const method = resolveTripayMethod(paymentType, bank);
    const merchantRef = `${eventId}-${Date.now()}`;

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount: Number(event.amount),
      customer_name: customer?.name || "Peserta",
      customer_email: customer?.email || "peserta@example.com",
      customer_phone: customer?.phone || "",
      order_items: [
        {
          sku: eventId,
          name: event.title,
          price: Number(event.amount),
          quantity: 1,
          subtotal: Number(event.amount),
        },
      ],
      signature: createTripaySignature(merchantRef, event.amount),
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };

    if (callbackUrl) payload.callback_url = callbackUrl;
    if (returnUrl) payload.return_url = returnUrl;

    const tripayResponse = await createTripayTransaction(payload);
    if (tripayResponse?.success === false) {
      return res
        .status(400)
        .json({ error: tripayResponse.message || "Gagal membuat pembayaran." });
    }

    const tripayData = tripayResponse?.data || tripayResponse;

    const normalized = normalizeTripayResponse(tripayData, {
      eventId,
      eventTitle: event.title,
      paymentType,
      bank,
      method,
      merchantRef,
      amount: Number(event.amount),
    });

    await db.collection("orders").doc(merchantRef).set({
      provider: "tripay",
      eventId,
      eventTitle: event.title,
      amount: Number(event.amount),
      paymentType,
      bank: bank || null,
      method,
      merchantRef,
      reference: normalized.reference,
      customer: {
        name: customer?.name || "Peserta",
        email: customer?.email || "peserta@example.com",
        phone: customer?.phone || "",
      },
      tripay: tripayResponse,
      status: mapStatus(tripayData?.status || tripayResponse?.status),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json(normalized);
  } catch (error) {
    console.error("Tripay charge error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Gagal membuat pembayaran.",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/payments/cancel", async (req, res) => {
  try {
    const { reference, merchantRef, orderId } = req.body || {};
    const refValue = reference || merchantRef || orderId;
    if (!refValue) {
      return res.status(400).json({ error: "reference atau merchantRef wajib diisi." });
    }

    const docRef = db.collection("orders").doc(refValue);
    let snap = await docRef.get();

    if (!snap.exists) {
      const byRef = await db.collection("orders").where("reference", "==", refValue).limit(1).get();
      if (!byRef.empty) {
        snap = byRef.docs[0];
      }
    }

    if (!snap || !snap.exists) {
      return res.status(404).json({ error: "Pesanan tidak ditemukan." });
    }

    const order = snap.data() || {};
    const currentStatus = (order.status || "").toLowerCase();
    if (currentStatus === "paid") {
      return res.status(400).json({ error: "Pesanan sudah dibayar, tidak bisa dibatalkan." });
    }
    if (["failed", "expired", "canceled", "refunded"].includes(currentStatus)) {
      return res.json({ success: true, status: currentStatus, reference: order.reference || refValue });
    }
    if ((order.provider || "").toLowerCase() !== "tripay") {
      return res.status(400).json({ error: "Pesanan ini bukan transaksi Tripay." });
    }

    const tripayReference = reference || order.reference || order.reference_id || refValue;
    const merchant = merchantRef || order.merchantRef || refValue;

    const cancelResult = await cancelTripayTransaction({ reference: tripayReference, merchantRef: merchant });
    if (cancelResult?.success === false) {
      return res.status(502).json({ error: cancelResult?.message || "Gagal membatalkan di Tripay." });
    }

    const tripayStatus = cancelResult?.data?.status || cancelResult?.status;
    let newStatus = mapStatus(tripayStatus);
    if (!newStatus || newStatus === "pending") newStatus = "failed";

    await db
      .collection("orders")
      .doc(snap.id)
      .set(
        {
          status: newStatus,
          reference: tripayReference,
          tripayCancel: cancelResult,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    res.json({ success: true, status: newStatus, reference: tripayReference });
  } catch (error) {
    console.error("Cancel error:", error.response?.data || error.message || error);
    res.status(500).json({ error: "Gagal membatalkan pesanan.", details: error.response?.data || error.message });
  }
});

app.post("/payments/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    const merchantRef = payload.merchant_ref || payload.merchantRef || payload.reference;
    if (!merchantRef) {
      return res.status(400).json({ error: "merchant_ref tidak ditemukan." });
    }

    if (!verifyTripayCallback(payload)) {
      console.warn("Signature Tripay tidak valid untuk order", merchantRef);
      return res.status(403).send("Invalid signature");
    }

    await db
      .collection("orders")
      .doc(merchantRef)
      .set(
        {
          status: mapStatus(payload.status),
          tripay: payload,
          reference: payload.reference || payload.reference_id || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(500).send("Webhook error");
  }
});

exports.api = functions.https.onRequest(app);
