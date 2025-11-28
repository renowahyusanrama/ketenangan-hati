const { admin, getDb } = require("../_lib/admin");
const { verifyTripayCallback, mapStatus } = require("../_lib/tripay");

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
    return res.status(200).set(CORS_HEADERS).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const payload = parseBody(req);
  const merchantRef = payload.merchant_ref || payload.merchantRef || payload.reference;
  if (!merchantRef) {
    return send(res, 400, { error: "merchant_ref tidak ditemukan." });
  }

  if (!verifyTripayCallback(payload)) {
    console.warn("Signature Tripay tidak valid untuk order", merchantRef);
    return send(res, 403, { error: "Invalid signature" });
  }

  try {
    const db = getDb();
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

    return send(res, 200, { received: true });
  } catch (error) {
    console.error("Webhook error:", error.message || error);
    return send(res, 500, { error: "Webhook error" });
  }
};
