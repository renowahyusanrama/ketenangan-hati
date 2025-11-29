const { admin, getDb } = require("../_lib/admin");
const {
  TRIPAY_API_KEY,
  TRIPAY_PRIVATE_KEY,
  TRIPAY_MERCHANT_CODE,
  TRIPAY_MODE,
  TRIPAY_CALLBACK_URL,
  TRIPAY_RETURN_URL,
  createTripaySignature,
  resolveTripayMethod,
  createTripayTransaction,
  normalizeTripayResponse,
  mapStatus,
} = require("../_lib/tripay");
const { sendTicketEmail } = require("../_lib/email");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Fallback jika Firestore belum terisi
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

function computeFees(paymentType, bank, baseAmount) {
  const base = Number(baseAmount) || 0;
  const platformTax = Math.ceil(base * 0.01); // 1% dari harga tiket

  let tripayFee = 0;
  if (paymentType === "bank_transfer") {
    const normalizedBank = (bank || "").toLowerCase();
    tripayFee = normalizedBank === "bca" ? 5500 : 4250;
  } else if (paymentType === "qris") {
    tripayFee = Math.ceil(750 + base * 0.007); // 750 + 0.70%
  }

  const amountForTripay = Math.max(0, Math.ceil(base + platformTax));
  const totalCustomer = Math.max(0, amountForTripay + tripayFee);

  return { platformTax, tripayFee, amountForTripay, totalCustomer, baseAmount: base };
}

function send(res, status, body) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(body);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return {};
    }
  }
  return {};
}

async function fetchEvent(db, eventId) {
  if (!eventId) return null;
  try {
    const snap = await db.collection("events").doc(eventId).get();
    if (snap.exists) {
      const data = snap.data();
      if (data.status && data.status !== "published") return null;
      return { id: snap.id, ...data };
    }
  } catch (err) {
    console.error("Fetch event error:", err?.message || err);
  }
  const fallback = eventsMap[eventId];
  return fallback ? { id: eventId, ...fallback } : null;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const { eventId, paymentType, bank, customer } = body || {};

  const db = getDb();
  const event = await fetchEvent(db, eventId);

  if (!event) {
    return send(res, 400, { error: "Event tidak dikenal." });
  }

  const eventAmount = Number(event.amount) || 0;
  const isFree = eventAmount <= 0;

  // 🔹 1) EVENT GRATIS
  if (isFree) {
    const merchantRef = `${eventId}-${Date.now()}`;
    const freeOrder = {
      provider: "free",
      eventId,
      eventTitle: event.title,
      amount: 0,
      paymentType: "free",
      bank: null,
      method: "free",
      merchantRef,
      reference: merchantRef,
      customer: {
        name: customer?.name || "Peserta",
        email: customer?.email || body.email || "peserta@example.com",
        phone: customer?.phone || body.phone || "",
      },
      status: "paid",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("orders").doc(merchantRef).set(freeOrder);

    // ⬇⬇⬇ WAJIB di-await supaya Resend benar2 terpanggil sebelum function selesai
    try {
      await sendTicketEmail({
        ...freeOrder,
        payCode: "GRATIS",
        vaNumber: "GRATIS",
      });
    } catch (err) {
      console.error("Email send error (free):", err?.message || err);
    }

    return send(res, 200, {
      ...freeOrder,
      free: true,
    });
  }

  // 🔹 2) EVENT BERBAYAR → Tripay

  if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
    return send(res, 500, { error: "Tripay belum dikonfigurasi." });
  }

  if (!["bank_transfer", "qris"].includes(paymentType)) {
    return send(res, 400, { error: "paymentType harus bank_transfer atau qris." });
  }

  const method = resolveTripayMethod(paymentType, bank);
  const merchantRef = `${eventId}-${Date.now()}`;
  const { platformTax, tripayFee, amountForTripay, totalCustomer, baseAmount } = computeFees(
    paymentType,
    bank,
    eventAmount,
  );

  const callbackUrl =
    TRIPAY_CALLBACK_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/payments/webhook` : "");

  const payload = {
    method,
    merchant_ref: merchantRef,
    amount: amountForTripay,
    customer_name: customer?.name || "Peserta",
    customer_email: customer?.email || "peserta@example.com",
    customer_phone: customer?.phone || "",
    order_items: [
      {
        sku: eventId,
        name: event.title,
        price: amountForTripay,
        quantity: 1,
        subtotal: amountForTripay,
      },
    ],
    signature: createTripaySignature(merchantRef, amountForTripay),
    expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };

  if (callbackUrl) payload.callback_url = callbackUrl;
  if (TRIPAY_RETURN_URL) payload.return_url = TRIPAY_RETURN_URL;

  try {
    const tripayResponse = await createTripayTransaction(payload);
    if (tripayResponse?.success === false) {
      return send(res, 400, { error: tripayResponse.message || "Gagal membuat pembayaran." });
    }

    const tripayData = tripayResponse?.data || tripayResponse;
    const normalized = normalizeTripayResponse(tripayData, {
      eventId,
      eventTitle: event.title,
      paymentType,
      bank,
      method,
      merchantRef,
      amount: totalCustomer,
      baseAmount,
      platformTax,
      tripayFee,
      totalAmount: totalCustomer,
      amountForTripay,
    });

    await db
      .collection("orders")
      .doc(merchantRef)
      .set({
        provider: "tripay",
        eventId,
        eventTitle: event.title,
        amount: totalCustomer,
        baseAmount,
        platformTax,
        tripayFee,
        totalAmount: totalCustomer,
        amountForTripay,
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

    return send(res, 200, normalized);
  } catch (error) {
    console.error("Tripay charge error:", error.response?.data || error.message || error);
    return send(res, 500, {
      error: "Gagal membuat pembayaran.",
      details: error.response?.data || error.message,
    });
  }
};
