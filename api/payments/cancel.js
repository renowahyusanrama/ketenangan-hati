const { admin, getDb } = require("../_lib/admin");
const { cancelTripayTransaction, mapStatus } = require("../_lib/tripay");

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

async function findOrder(db, value) {
  if (!value) return null;
  // 1) coba langsung doc id
  const direct = await db.collection("orders").doc(value).get();
  if (direct.exists) return { id: direct.id, snap: direct };

  // 2) cari berdasarkan reference
  try {
    const byRef = await db.collection("orders").where("reference", "==", value).limit(1).get();
    if (!byRef.empty) {
      const doc = byRef.docs[0];
      return { id: doc.id, snap: doc };
    }
  } catch (err) {
    console.warn("findOrder by reference error:", err?.message || err);
  }

  // 3) cari berdasarkan merchantRef
  try {
    const byMerchant = await db.collection("orders").where("merchantRef", "==", value).limit(1).get();
    if (!byMerchant.empty) {
      const doc = byMerchant.docs[0];
      return { id: doc.id, snap: doc };
    }
  } catch (err) {
    console.warn("findOrder by merchantRef error:", err?.message || err);
  }

  return null;
}

module.exports = async (req, res) => {
  // Preflight
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const refValue = body.reference || body.merchantRef || body.orderId || body.order_id;

  if (!refValue) {
    return send(res, 400, { error: "reference atau merchantRef wajib diisi." });
  }

  const db = getDb();
  let found = await findOrder(db, refValue);
  if (!found && body.orderId) found = await findOrder(db, body.orderId);
  if (!found && body.merchantRef) found = await findOrder(db, body.merchantRef);

  if (!found) {
    return send(res, 404, { error: "Pesanan tidak ditemukan." });
  }

  const order = found.snap.data() || {};
  const orderId = found.id;
  const currentStatus = (order.status || "").toLowerCase();

  if (currentStatus === "paid") {
    return send(res, 400, { error: "Pesanan sudah dibayar, tidak bisa dibatalkan." });
  }

  if (["failed", "expired", "canceled", "refunded"].includes(currentStatus)) {
    return send(res, 200, { success: true, status: currentStatus, orderId });
  }

  const normalizedProvider = (order.provider || "").toLowerCase();
  if (normalizedProvider !== "tripay") {
    return send(res, 400, { error: "Pesanan ini bukan transaksi Tripay." });
  }

  const tripayReference =
    body.reference ||
    order.reference ||
    order.reference_id ||
    order.referenceId ||
    refValue ||
    orderId;
  const merchantRef = body.merchantRef || order.merchantRef || orderId;

  let cancelResult;
  let cancelError = null;
  try {
    cancelResult = await cancelTripayTransaction({
      reference: tripayReference,
      merchantRef,
    });
    if (cancelResult?.success === false) {
      throw new Error(cancelResult?.message || "Cancel Tripay gagal.");
    }
  } catch (err) {
    cancelError = err;
    console.error("Tripay cancel error (marking locally):", err.response?.data || err.message || err);
  }

  const tripayStatus = cancelResult?.data?.status || cancelResult?.status;
  let newStatus = mapStatus(tripayStatus);
  if (!newStatus || newStatus === "pending") newStatus = cancelError ? "canceled" : "failed";

  const docRef = db.collection("orders").doc(orderId);
  const updatePayload = {
    status: newStatus,
    reference: tripayReference,
    tripayCancel: cancelResult || null,
    tripayCancelError: cancelError
      ? {
          message: cancelError.message || "Tripay cancel failed",
          response: cancelError.response?.data || null,
        }
      : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    canceledAt: admin.firestore.FieldValue.serverTimestamp(),
    canceledBy: body.requestedBy || "user",
  };
  if (order.reserved) updatePayload.reserved = false;

  try {
    await docRef.set(updatePayload, { merge: true });
  } catch (err) {
    console.error("Gagal update order setelah cancel:", err?.message || err);
    return send(res, 500, { error: "Pesanan dibatalkan di Tripay, tapi gagal update database." });
  }

  return send(res, 200, {
    success: true,
    status: newStatus,
    reference: tripayReference,
    orderId,
    tripayWarning: cancelError
      ? "Gagal membatalkan di Tripay, pesanan ditandai dibatalkan di sistem."
      : undefined,
  });
};
