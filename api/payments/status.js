const { getDb } = require("../_lib/admin");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

async function findOrder(db, value) {
  if (!value) return null;
  const direct = await db.collection("orders").doc(value).get();
  if (direct.exists) return { id: direct.id, data: direct.data() };

  try {
    const byRef = await db.collection("orders").where("reference", "==", value).limit(1).get();
    if (!byRef.empty) {
      const doc = byRef.docs[0];
      return { id: doc.id, data: doc.data() };
    }
  } catch (err) {
    console.warn("findOrder by reference error (status):", err?.message || err);
  }

  try {
    const byMerchant = await db.collection("orders").where("merchantRef", "==", value).limit(1).get();
    if (!byMerchant.empty) {
      const doc = byMerchant.docs[0];
      return { id: doc.id, data: doc.data() };
    }
  } catch (err) {
    console.warn("findOrder by merchantRef error (status):", err?.message || err);
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (!["GET", "POST"].includes(req.method)) {
    return send(res, 405, { error: "Method not allowed" });
  }

  const body = req.method === "POST" ? parseBody(req) : {};
  const value =
    req.query.value ||
    req.query.reference ||
    req.query.merchantRef ||
    req.query.orderId ||
    body?.value ||
    body?.reference ||
    body?.merchantRef ||
    body?.orderId;

  if (!value) {
    return send(res, 400, { error: "reference atau merchantRef wajib diisi." });
  }

  const db = getDb();
  const found = await findOrder(db, value);
  if (!found) {
    return send(res, 404, { error: "Pesanan tidak ditemukan." });
  }

  const order = found.data || {};
  const status = (order.status || "pending").toLowerCase();
  const responsePayload = {
    success: true,
    orderId: found.id,
    status,
    reference: order.reference || order.merchantRef || found.id,
    merchantRef: order.merchantRef || found.id,
    paymentType: order.paymentType || order.method || "-",
    amount: order.amount ?? null,
    ticketEmailStatus: order.ticketEmail?.status || null,
    ticketEmailRecipient: order.ticketEmail?.recipient || order.customer?.email || null,
    ticketEmail: order.ticketEmail || null,
    provider: order.provider || null,
    updatedAt: order.updatedAt || null,
    createdAt: order.createdAt || null,
  };

  return send(res, 200, responsePayload);
};
