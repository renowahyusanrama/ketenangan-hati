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
    priceRegular: 0,
  },
  "fiqih-muamalat-modern": {
    title: "Seminar Fiqih Muamalat dalam Kehidupan Modern",
    priceRegular: 50000,
    priceVip: 100000,
  },
  "hadits-arbain": {
    title: "Kajian Hadits Arbain An-Nawawi",
    priceRegular: 70000,
    priceVip: 120000,
  },
  "workshop-tahsin-tajwid": {
    title: "Workshop Tahsin dan Tajwid Al-Quran",
    priceRegular: 100000,
    priceVip: 150000,
  },
  "sirah-nabawiyah-mekkah": {
    title: "Kajian Sirah Nabawiyah: Periode Mekkah",
    priceRegular: 120000,
  },
  "seminar-parenting-islami": {
    title: "Seminar Parenting Islami",
    priceRegular: 150000,
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

async function reserveSeatAndSaveOrder(db, eventDocId, orderDocId, orderData) {
  const eventRef = db.collection("events").doc(eventDocId);
  const orderRef = db.collection("orders").doc(orderDocId);

  await db.runTransaction(async (tx) => {
    const evSnap = await tx.get(eventRef);
    const evData = evSnap.exists ? evSnap.data() || {} : {};
    const capacity = Number(evData.capacity) || 0;
    const used = Number(evData.seatsUsed) || 0;
    if (capacity > 0 && used >= capacity) {
      throw new Error("Kuota event sudah penuh.");
    }

    if (evSnap.exists) {
      tx.update(eventRef, { seatsUsed: admin.firestore.FieldValue.increment(1) });
    } else {
      tx.set(eventRef, { seatsUsed: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }

    tx.set(orderRef, orderData);
  });
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
  const { eventId, paymentType, bank, customer, ticketType } = body || {};

  const db = getDb();
  const event = await fetchEvent(db, eventId);

  if (!event) {
    return send(res, 400, { error: "Event tidak dikenal." });
  }

  const type = (ticketType || "regular").toLowerCase() === "vip" ? "vip" : "regular";
  const priceRegular = Number(event.priceRegular ?? event.amount ?? 0) || 0;
  const priceVip = event.priceVip != null ? Number(event.priceVip) : null;
  let selectedAmount = type === "vip" ? priceVip || priceRegular : priceRegular;
  if (selectedAmount < 0) selectedAmount = 0;
  const isFree = selectedAmount <= 0;
  const merchantRef = `${eventId}-${type}-${Date.now()}`;

  // 1) EVENT GRATIS
  if (isFree) {
    const ticketEmailMeta = {
      status: "pending",
      recipient: customer?.email || null,
    };
    const freeOrder = {
      provider: "free",
      eventId,
      eventTitle: event.title,
      eventDate: event.schedule || event.date || null,
      eventTime: event.time || null,
      eventLocation: event.location || event.address || null,
      speaker: event.speaker || null,
      amount: 0,
      baseAmount: 0,
      platformTax: 0,
      tripayFee: 0,
      totalAmount: 0,
      amountForTripay: 0,
      paymentType: "free",
      ticketType: type,
      bank: null,
      method: "free",
      merchantRef,
      reference: merchantRef,
      reserved: true,
      customer: {
        name: customer?.name || "Peserta",
        email: customer?.email || "peserta@example.com",
        phone: customer?.phone || "",
      },
      status: "paid",
      ticketEmail: { ...ticketEmailMeta },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await reserveSeatAndSaveOrder(db, event.id, merchantRef, freeOrder);
    } catch (err) {
      return send(res, 400, { error: err?.message || "Kuota event sudah penuh." });
    }

    const orderRef = db.collection("orders").doc(merchantRef);
    const responseData = { ...freeOrder, free: true, ticketEmailStatus: ticketEmailMeta.status, ticketEmailRecipient: ticketEmailMeta.recipient };

    try {
      await sendTicketEmail({
        ...freeOrder,
        payCode: "GRATIS",
        vaNumber: "GRATIS",
      });
      const successMeta = {
        status: "sent",
        recipient: ticketEmailMeta.recipient,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await orderRef.set({ ticketEmail: successMeta }, { merge: true });
      responseData.ticketEmailStatus = successMeta.status;
      responseData.ticketEmailRecipient = successMeta.recipient;
    } catch (err) {
      console.error("Email send error (free):", err?.message || err);
      const errorMeta = {
        status: "error",
        recipient: ticketEmailMeta.recipient,
        error: err?.message || "Email gagal dikirim",
        attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await orderRef.set({ ticketEmail: errorMeta }, { merge: true });
      responseData.ticketEmailStatus = errorMeta.status;
    }

    return send(res, 200, responseData);
  }

  // 2) EVENT BERBAYAR (Tripay)
  if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
    return send(res, 500, { error: "Tripay belum dikonfigurasi." });
  }

  if (!["bank_transfer", "qris"].includes(paymentType)) {
    return send(res, 400, { error: "paymentType harus bank_transfer atau qris." });
  }

  const method = resolveTripayMethod(paymentType, bank);
  const { platformTax, tripayFee, amountForTripay, totalCustomer, baseAmount } = computeFees(
    paymentType,
    bank,
    selectedAmount,
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
        name: `${event.title || eventId} - ${type.toUpperCase()}`,
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
      ticketType: type,
    });

    const ticketEmailMeta = {
      status: "pending",
      recipient: customer?.email || null,
    };

    const orderDoc = {
      provider: "tripay",
      eventId,
      eventTitle: event.title,
      eventDate: event.schedule || event.date || null,
      eventTime: event.time || null,
      eventLocation: event.location || event.address || null,
      speaker: event.speaker || null,
      amount: totalCustomer,
      baseAmount,
      platformTax,
      tripayFee,
      totalAmount: totalCustomer,
      amountForTripay,
      paymentType,
      ticketType: type,
      bank: bank || null,
      method,
      merchantRef,
      reference: normalized.reference,
      customer: {
        name: customer?.name || "Peserta",
        email: customer?.email || "peserta@example.com",
        phone: customer?.phone || "",
      },
      ticketEmail: { ...ticketEmailMeta },
      tripay: tripayResponse,
      status: mapStatus(tripayData?.status || tripayResponse?.status),
      reserved: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await reserveSeatAndSaveOrder(db, event.id, merchantRef, orderDoc);
    } catch (err) {
      return send(res, 400, { error: err?.message || "Kuota event sudah penuh." });
    }

    const responsePayload = {
      ...normalized,
      ticketEmailStatus: ticketEmailMeta.status,
      ticketEmailRecipient: ticketEmailMeta.recipient,
    };
    return send(res, 200, responsePayload);
  } catch (error) {
    console.error("Tripay charge error:", error.response?.data || error.message || error);
    return send(res, 500, {
      error: "Gagal membuat pembayaran.",
      details: error.response?.data || error.message,
    });
  }
};
