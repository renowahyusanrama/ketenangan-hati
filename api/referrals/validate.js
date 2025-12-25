const { getDb } = require("../_lib/admin");
const { getUserFromAuthHeader } = require("../_lib/auth");
const {
  REFERRAL_LIMIT,
  normalizeReferralCode,
  resolveReferralPrice,
  getReferralUsageCount,
} = require("../_lib/referral");

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

  const body = parseBody(req);
  const referralCode = normalizeReferralCode(body?.referralCode);
  const eventId = (body?.eventId || "").toString();
  const ticketType = (body?.ticketType || "regular").toString().toLowerCase() === "vip" ? "vip" : "regular";

  if (!referralCode) {
    return send(res, 400, { error: "Kode referral wajib diisi." });
  }

  const authUser = await getUserFromAuthHeader(req);
  const userId = authUser?.uid || null;
  if (!userId) {
    return send(res, 401, { error: "Login diperlukan untuk menggunakan kode referral." });
  }

  const db = getDb();
  const referralRef = db.collection("referrals").doc(referralCode);
  const referralSnap = await referralRef.get();
  if (!referralSnap.exists) {
    return send(res, 400, { error: "Kode referral tidak valid." });
  }
  const referralData = referralSnap.data() || {};
  if (!referralData.active) {
    return send(res, 400, { error: "Kode referral tidak aktif." });
  }
  const referralEventId = (referralData.eventId || "").toString();
  if (referralEventId && eventId && referralEventId !== eventId) {
    return send(res, 400, { error: "Kode referral tidak berlaku untuk event ini." });
  }

  const priceAfter = resolveReferralPrice(referralData, ticketType);
  if (priceAfter == null) {
    return send(res, 400, { error: "Kode referral tidak berlaku untuk tiket ini." });
  }

  const usageCount = await getReferralUsageCount(db, userId, referralCode);
  if (usageCount >= REFERRAL_LIMIT) {
    return send(res, 400, {
      error: `Kode referral sudah mencapai batas pemakaian untuk akun ini (maks ${REFERRAL_LIMIT}x).`,
    });
  }

  return send(res, 200, {
    valid: true,
    uses: usageCount,
    limit: REFERRAL_LIMIT,
    priceAfter,
    referral: {
      code: referralCode,
      active: true,
      eventId: referralEventId || null,
      appliesTo: referralData.appliesTo || "both",
      regularPriceAfter: referralData.regularPriceAfter ?? null,
      vipPriceAfter: referralData.vipPriceAfter ?? null,
    },
  });
};
