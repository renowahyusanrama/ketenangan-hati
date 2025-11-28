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
    return res.status(200).set(CORS_HEADERS).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
    return send(res, 500, { error: "Tripay belum dikonfigurasi." });
  }

  const body = parseBody(req);
  const { eventId, paymentType, bank, customer } = body || {};

  const db = getDb();
  const event = await fetchEvent(db, eventId);

  if (!event) {
    return send(res, 400, { error: "Event tidak dikenal." });
  }
  if (!event.amount || Number(event.amount) <= 0) {
    return send(res, 400, { error: "Event ini gratis, tidak perlu pembayaran." });
  }
  if (!["bank_transfer", "qris"].includes(paymentType)) {
    return send(res, 400, { error: "paymentType harus bank_transfer atau qris." });
  }

  const method = resolveTripayMethod(paymentType, bank);
  const merchantRef = `${eventId}-${Date.now()}`;

  const callbackUrl =
    TRIPAY_CALLBACK_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/payments/webhook` : "");
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
      amount: Number(event.amount),
    });

    await db
      .collection("orders")
      .doc(merchantRef)
      .set({
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

    return send(res, 200, normalized);
  } catch (error) {
    console.error("Tripay charge error:", error.response?.data || error.message || error);
    return send(res, 500, {
      error: "Gagal membuat pembayaran.",
      details: error.response?.data || error.message,
    });
  }
};
