const { admin } = require("./admin");

const REFERRAL_LIMIT = 5;

function normalizeReferralCode(value) {
  return (value || "").toString().trim().toUpperCase();
}

function resolveReferralPrice(data, type) {
  if (!data) return null;
  const appliesTo = (data.appliesTo || "").toString().toLowerCase();
  if (appliesTo && appliesTo !== "both" && appliesTo !== type) return null;
  const raw = type === "vip" ? data.vipPriceAfter : data.regularPriceAfter;
  const candidate = Number(raw);
  if (!Number.isFinite(candidate) || candidate < 0) return null;
  return candidate;
}

function getReferralUsageDocId(userId, referralCode) {
  const safeUser = encodeURIComponent(userId || "");
  const safeCode = encodeURIComponent(referralCode || "");
  return `${safeUser}__${safeCode}`;
}

async function getReferralUsageCount(db, userId, referralCode) {
  if (!userId || !referralCode) return 0;
  const docId = getReferralUsageDocId(userId, referralCode);
  const snap = await db.collection("referral_usages").doc(docId).get();
  return Number(snap.data()?.count || 0);
}

async function reserveReferralUsage(db, { userId, referralCode, orderId, eventId }) {
  if (!userId || !referralCode) return 0;
  const usageRef = db.collection("referral_usages").doc(getReferralUsageDocId(userId, referralCode));
  const referralRef = db.collection("referrals").doc(referralCode);
  let nextCount = 0;

  await db.runTransaction(async (tx) => {
    const usageSnap = await tx.get(usageRef);
    const current = Number(usageSnap.data()?.count || 0);
    if (current >= REFERRAL_LIMIT) {
      const err = new Error("Referral usage limit reached.");
      err.code = "REFERRAL_LIMIT";
      throw err;
    }
    nextCount = current + 1;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const payload = {
      userId,
      referralCode,
      count: nextCount,
      lastUsedAt: now,
      updatedAt: now,
      lastOrderId: orderId || null,
      lastEventId: eventId || null,
    };
    if (!usageSnap.exists) payload.createdAt = now;
    tx.set(usageRef, payload, { merge: true });
    tx.set(
      referralRef,
      {
        usedCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      },
      { merge: true },
    );
  });

  return nextCount;
}

async function rollbackReferralUsage(db, { userId, referralCode }) {
  if (!userId || !referralCode) return;
  const usageRef = db.collection("referral_usages").doc(getReferralUsageDocId(userId, referralCode));
  const referralRef = db.collection("referrals").doc(referralCode);

  await db.runTransaction(async (tx) => {
    const usageSnap = await tx.get(usageRef);
    const current = Number(usageSnap.data()?.count || 0);
    if (!current) return;
    const nextCount = current - 1;
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (nextCount <= 0) {
      tx.delete(usageRef);
    } else {
      tx.set(
        usageRef,
        { count: nextCount, updatedAt: now, lastRolledBackAt: now },
        { merge: true },
      );
    }
    tx.set(
      referralRef,
      {
        usedCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: now,
      },
      { merge: true },
    );
  });
}

module.exports = {
  REFERRAL_LIMIT,
  normalizeReferralCode,
  resolveReferralPrice,
  getReferralUsageDocId,
  getReferralUsageCount,
  reserveReferralUsage,
  rollbackReferralUsage,
};
