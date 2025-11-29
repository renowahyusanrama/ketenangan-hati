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

async function releaseSeatIfNeeded(db, eventId) {
  if (!eventId) return;
  const eventRef = db.collection("events").doc(eventId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const used = Number(data.seatsUsed) || 0;
    const next = used > 0 ? used - 1 : 0;
    tx.set(eventRef, { seatsUsed: next }, { merge: true });
  });
}

// Baca raw body persis seperti yang dikirim Tripay
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = async (req, res) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  let rawBody = "";
  let payload = {};

  // 1. Baca RAW body dari Tripay
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error("Gagal membaca raw body:", err);
    return send(res, 400, { error: "Failed to read body" });
  }

  // 2. Parse JSON payload
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("Gagal parse JSON Tripay:", err, rawBody);
    return send(res, 400, { error: "Invalid JSON body" });
  }

  const merchantRef =
    payload.merchant_ref || payload.merchantRef || payload.reference;

  if (!merchantRef) {
    console.error("merchant_ref tidak ditemukan di payload:", payload);
    return send(res, 400, { error: "merchant_ref tidak ditemukan." });
  }

  // 3. Verifikasi signature Tripay dengan rawBody asli
  const valid = verifyTripayCallback(payload, req.headers, rawBody);
  if (!valid) {
    console.warn("Signature Tripay tidak valid untuk order", merchantRef);
    return send(res, 403, { success: false, error: "Invalid signature" });
  }

  // 4. Update Firestore & kirim email (kalau perlu)
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

    const releaseStatuses = ["expired", "failed", "canceled", "refunded"];
    const shouldRelease =
      previous &&
      previous.reserved &&
      previous.eventId &&
      releaseStatuses.includes(newStatus) &&
      previous.status !== "paid";

    if (shouldRelease) {
      await releaseSeatIfNeeded(db, previous.eventId);
      await docRef.set({ reserved: false }, { merge: true });
    }

    const wasPaid = previous && previous.status === "paid";
    const nowPaid = newStatus === "paid";

    if (!wasPaid && nowPaid && previous) {
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

      // kirim email async, kalau error cukup di-log
      sendTicketEmail(orderForEmail).catch((err) => {
        console.error("Email send error (webhook):", err?.message || err);
      });
    }

    // 5. BALAS KE TRIPAY DENGAN FORMAT YANG DIMINTA
    return send(res, 200, { success: true });
  } catch (error) {
    console.error("Webhook error:", error.message || error);
    return send(res, 500, { error: "Webhook error" });
  }
};

// WAJIB: matikan bodyParser supaya raw body tidak diutak-atik Next/Vercel
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
