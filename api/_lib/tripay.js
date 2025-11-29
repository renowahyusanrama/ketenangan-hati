const axios = require("axios");
const crypto = require("crypto");

const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY || "";
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY || "";
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || "";
const TRIPAY_MODE = process.env.TRIPAY_MODE || "sandbox";
const TRIPAY_CALLBACK_URL = process.env.TRIPAY_CALLBACK_URL || "";
const TRIPAY_RETURN_URL = process.env.TRIPAY_RETURN_URL || "";

const TRIPAY_BASE_URL =
  TRIPAY_MODE === "production" ? "https://tripay.co.id/api" : "https://tripay.co.id/api-sandbox";

function createTripaySignature(merchantRef, amount) {
  if (!TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) return "";
  return crypto
    .createHmac("sha256", TRIPAY_PRIVATE_KEY)
    .update(`${TRIPAY_MERCHANT_CODE}${merchantRef}${Number(amount)}`)
    .digest("hex");
}

function resolveTripayMethod(paymentType, bank) {
  if (paymentType === "qris") return "QRIS";
  const normalized = (bank || "bca").toLowerCase();
  const map = {
    bca: "BCAVA",
    bni: "BNIVA",
    bri: "BRIVA",
    mandiri: "MANDIRIVA",
    permata: "PERMATAVA",
  };
  return map[normalized] || "BCAVA";
}

async function createTripayTransaction(payload) {
  const { data } = await axios.post(`${TRIPAY_BASE_URL}/transaction/create`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIPAY_API_KEY}`,
    },
  });
  return data;
}

function normalizeTripayResponse(
  trx,
  { eventId, eventTitle, paymentType, bank, method, merchantRef, amount },
) {
  const payCode = trx?.pay_code || trx?.va_number || trx?.payment_code || null;
  return {
    provider: "tripay",
    orderId: merchantRef,
    reference: trx?.reference || trx?.reference_id,
    eventId,
    eventTitle,
    amount,
    paymentType,
    bank: bank || null,
    method,
    paymentName: trx?.payment_name || trx?.payment_method || method,
    vaNumber: paymentType === "bank_transfer" ? payCode : null,
    payCode,
    checkoutUrl: trx?.checkout_url || trx?.pay_url,
    qrUrl: trx?.qr_url || "",
    qrString: trx?.qr_string || "",
    instructions: trx?.instructions || [],
    expiresAt: trx?.expired_time
      ? new Date(Number(trx.expired_time) * 1000).toISOString()
      : null,
    status: trx?.status || "UNPAID",
  };
}

function verifyTripayCallback(body = {}, headers = {}, rawBody = "") {
  if (!TRIPAY_PRIVATE_KEY) return false;

  const headerSig =
    headers["x-callback-signature"] ||
    headers["X-CALLBACK-SIGNATURE"] ||
    headers["x-callback-signature".toLowerCase()];
  const signature = body.signature || body.sign || headerSig;
  if (!signature) return false;

  // Tripay callback signature resmi: HMAC SHA256 dari raw JSON callback.
  const candidates = [];
  if (typeof rawBody === "string" && rawBody.length > 0) candidates.push(rawBody);
  try {
    const stringified = JSON.stringify(body);
    if (stringified) candidates.push(stringified);
  } catch (err) {
    // ignore
  }

  const expectedCandidates = [];
  for (const candidate of candidates) {
    const expectedFromBody = crypto.createHmac("sha256", TRIPAY_PRIVATE_KEY).update(candidate).digest("hex");
    expectedCandidates.push(expectedFromBody);
    if (signature === expectedFromBody) return true;
  }

  // Fallback ke pola lama (merchant_code + merchant_ref + amount) jika diperlukan.
  const merchantRef = body.merchant_ref || body.merchantRef || body.reference;
  const amount =
    body.total_amount ?? body.amount ?? body.amount_total ?? body.amount_received ?? body.amount_received_raw;
  if (!merchantRef || amount == null) return false;
  const basePayload = `${merchantRef}${TRIPAY_MERCHANT_CODE}${amount}`;
  const altPayload = `${TRIPAY_MERCHANT_CODE}${merchantRef}${amount}`;
  const expected = crypto.createHmac("sha256", TRIPAY_PRIVATE_KEY).update(basePayload).digest("hex");
  const altExpected = crypto.createHmac("sha256", TRIPAY_PRIVATE_KEY).update(altPayload).digest("hex");
  const matched = signature === expected || signature === altExpected;

  if (!matched) {
    console.warn("Tripay callback signature mismatch", {
      signature,
      expectedCandidates,
      expectedFallback: [expected, altExpected],
      merchantRef,
      amount,
      hasRawBody: !!rawBody,
    });
  }

  return matched;
}

function mapStatus(status = "") {
  const normalized = status.toUpperCase();
  const statusMap = {
    PAID: "paid",
    PENDING: "pending",
    UNPAID: "pending",
    EXPIRED: "expired",
    FAILED: "failed",
    REFUND: "refunded",
    CANCEL: "canceled",
    CANCELED: "canceled",
  };
  return statusMap[normalized] || normalized.toLowerCase() || "pending";
}

module.exports = {
  TRIPAY_API_KEY,
  TRIPAY_PRIVATE_KEY,
  TRIPAY_MERCHANT_CODE,
  TRIPAY_MODE,
  TRIPAY_BASE_URL,
  TRIPAY_CALLBACK_URL,
  TRIPAY_RETURN_URL,
  createTripaySignature,
  resolveTripayMethod,
  createTripayTransaction,
  normalizeTripayResponse,
  verifyTripayCallback,
  mapStatus,
};
