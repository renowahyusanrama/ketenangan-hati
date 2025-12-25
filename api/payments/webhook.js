const { admin, getDb } = require("../_lib/admin");
const { verifyTripayCallback, mapStatus } = require("../_lib/tripay");
const { applyReferralUsage } = require("../_lib/referral");
const { sendTicketEmail } = require("../_lib/email");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function normalizeEmail(value) {
  return (value || "").toString().trim().toLowerCase();
}

function send(res, status, body) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).json(body);
}

async function releaseSeatIfNeeded(db, eventId, ticketType) {
  if (!eventId) return;
  const eventRef = db.collection("events").doc(eventId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const used = Number(data.seatsUsed) || 0;
    const usedReg = Number(data.seatsUsedRegular) || 0;
    const usedVip = Number(data.seatsUsedVip) || 0;
    const isVip = (ticketType || "").toLowerCase() === "vip";
    const updates = {
      seatsUsed: used > 0 ? used - 1 : 0,
    };
    if (isVip) {
      updates.seatsUsedVip = usedVip > 0 ? usedVip - 1 : 0;
    } else {
      updates.seatsUsedRegular = usedReg > 0 ? usedReg - 1 : 0;
    }
    tx.set(eventRef, updates, { merge: true });
  });
}

async function addSeatIfNeeded(db, eventId, ticketType) {
  if (!eventId) return;
  const eventRef = db.collection("events").doc(eventId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    const capacity = Number(data.capacity) || 0;
    const used = Number(data.seatsUsed) || 0;
    const usedReg = Number(data.seatsUsedRegular) || 0;
    const usedVip = Number(data.seatsUsedVip) || 0;
    const quotaRegular = Number(data.quotaRegular) || 0;
    const quotaVip = Number(data.quotaVip) || 0;
    const isVip = (ticketType || "").toLowerCase() === "vip";

    if (capacity > 0 && used >= capacity) {
      throw new Error("Kuota total penuh.");
    }
    if (!isVip && quotaRegular > 0 && usedReg >= quotaRegular) {
      throw new Error("Kuota reguler penuh.");
    }
    if (isVip && quotaVip > 0 && usedVip >= quotaVip) {
      throw new Error("Kuota VIP penuh.");
    }

    const inc = admin.firestore.FieldValue.increment(1);
    const updates = { seatsUsed: inc };
    if (isVip) {
      updates.seatsUsedVip = inc;
    } else {
      updates.seatsUsedRegular = inc;
    }
    tx.set(eventRef, updates, { merge: true });
  });
}
async function findOrderDoc(db, merchantRef, reference) {
  if (merchantRef) {
    const direct = await db.collection('orders').doc(merchantRef).get();
    if (direct.exists) return { id: direct.id, data: direct.data() };
  }
  if (reference) {
    try {
      const byRef = await db.collection('orders').where('reference', '==', reference).limit(1).get();
      if (!byRef.empty) {
        const doc = byRef.docs[0];
        return { id: doc.id, data: doc.data() };
      }
    } catch (err) {
      console.warn('findOrderDoc by reference error:', err?.message || err);
    }
  }
  return null;
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

  const merchantRef = payload.merchant_ref || payload.merchantRef || payload.reference;
  const referenceFromPayload = payload.reference || payload.reference_id;

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
    const found = await findOrderDoc(db, merchantRef, referenceFromPayload);
    const docRef = found ? db.collection('orders').doc(found.id) : db.collection('orders').doc(merchantRef);
    const previous = found?.data || null;

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
    const wasPaid = previous && previous.status === "paid";
    const nowPaid = newStatus === "paid";
    if (nowPaid && !wasPaid && previous?.eventId) {
      try {
        await addSeatIfNeeded(db, previous.eventId, previous.ticketType);
      } catch (err) {
        console.warn("Tambah kuota gagal saat paid:", err?.message || err);
      }
    }
    const shouldRelease =
      previous &&
      previous.eventId &&
      releaseStatuses.includes(newStatus) &&
      previous.status !== "paid";

    if (shouldRelease) {
      await releaseSeatIfNeeded(db, previous.eventId, previous.ticketType);
    }
    const emailAlreadySent = previous?.ticketEmail?.status === "sent";

    if (nowPaid && !emailAlreadySent && previous) {
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

      const emailMeta = {
        status: "pending",
        recipient: orderForEmail.customer?.email || previous.customer?.email || null,
        reference: orderForEmail.reference,
      };
      try {
        await sendTicketEmail(orderForEmail);
        await docRef.set(
          {
            ticketEmail: {
              ...emailMeta,
              status: "sent",
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
      } catch (err) {
        console.error("Email send error (webhook):", err?.message || err);
        await docRef.set(
          {
            ticketEmail: {
              ...emailMeta,
              status: "error",
              error: err?.message || "Email gagal dikirim",
              attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
      }
    }

    const referralInfo = previous?.referral || null;
    const referralCode = referralInfo?.code || null;
    if (nowPaid && referralCode && !referralInfo?.usageApplied && previous) {
      const email = normalizeEmail(previous.customer?.email || referralInfo?.email);
      if (email) {
        try {
          await applyReferralUsage(db, referralCode, email, docRef, referralInfo);
        } catch (err) {
          console.error("Referral usage error (webhook):", err?.message || err);
        }
      }
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
