const { admin } = require("./admin");

const REFERRAL_LIMIT = 5;

function normalizeReferralCode(value) {
  return (value || "").toString().trim().toUpperCase();
}

function normalizeEmail(value) {
  return (value || "").toString().trim().toLowerCase();
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

function getReferralUseId(email) {
  return encodeURIComponent(email || "");
}

async function getReferralUsageCount(db, referralCode, email) {
  if (!referralCode || !email) return 0;
  const useRef = db.collection("referrals").doc(referralCode).collection("uses").doc(getReferralUseId(email));
  const snap = await useRef.get();
  return Number(snap.data()?.count || 0);
}

async function applyReferralUsage(db, referralCode, email, orderRef, referralMeta) {
  if (!referralCode || !email || !orderRef) return;
  const referralRef = db.collection("referrals").doc(referralCode);
  const useRef = referralRef.collection("uses").doc(getReferralUseId(email));
  await db.runTransaction(async (tx) => {
    const useSnap = await tx.get(useRef);
    const count = Number(useSnap.data()?.count || 0);
    if (count >= REFERRAL_LIMIT) {
      tx.set(
        orderRef,
        {
          referral: {
            ...referralMeta,
            usageApplied: false,
            usageError: "limit",
            usageCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return;
    }
    tx.set(
      useRef,
      {
        code: referralCode,
        email,
        count: count + 1,
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      referralRef,
      {
        usedCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      orderRef,
      {
        referral: {
          ...referralMeta,
          usageApplied: true,
          usageAppliedAt: admin.firestore.FieldValue.serverTimestamp(),
          usageCount: count + 1,
        },
      },
      { merge: true },
    );
  });
}

module.exports = {
  REFERRAL_LIMIT,
  normalizeReferralCode,
  normalizeEmail,
  resolveReferralPrice,
  getReferralUsageCount,
  applyReferralUsage,
};
