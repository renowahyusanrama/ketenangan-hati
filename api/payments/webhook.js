const { admin, getDb } = require("../_lib/admin");
const { verifyTripayCallback, mapStatus } = require("../_lib/tripay");
const { sendTicketEmail } = require("../_lib/email");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const payload = parseBody(req);
  const merchantRef = payload.merchant_ref || payload.merchantRef || payload.reference;
  if (!merchantRef) {
    return send(res, 400, { error: "merchant_ref tidak ditemukan." });
  }

  if (!verifyTripayCallback(payload, req.headers)) {
    console.warn("Signature Tripay tidak valid untuk order", merchantRef);
    return send(res, 403, { error: "Invalid signature" });
  }

  try {
    const db = getDb();
    const docRef = db.collection("orders").doc(merchantRef);
    const snap = await docRef.get();
    const previous = snap.exists ? snap.data() : null;

    const newStatus = mapStatus(payload.status);
    await docRef.set(
      {
        status: newStatus,
        tripay: payload,
        reference: payload.reference || payload.reference_id || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const wasPaid = previous && previous.status === "paid";
    const nowPaid = newStatus === "paid";

    if (!wasPaid && nowPaid && previous) {
      // Ambil kode bayar dari payload sebagai backup
      const payCode =
        payload.pay_code ||
        payload.payment_code ||
        payload.va_number ||
        (Array.isArray(payload.va_numbers) && payload.va_numbers[0]?.va_number) ||
        previous.vaNumber ||
        previous.payCode;

      const orderForEmail = {
        ...previous,
        status: newStatus,
        reference: payload.reference || previous.reference,
        payCode,
        vaNumber: payCode,
      };

      sendTicketEmail(orderForEmail).catch((err) => {
        console.error("Email send error (webhook):", err?.message || err);
      });
    }

    return send(res, 200, { received: true });
  } catch (error) {
    console.error("Webhook error:", error.message || error);
    return send(res, 500, { error: "Webhook error" });
  }
};
