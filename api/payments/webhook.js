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

function extractRawBody(req) {
  if (req.rawBody) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
    if (typeof req.rawBody === "string") return req.rawBody;
  }
  if (req.body) {
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    try {
      return JSON.stringify(req.body);
    } catch (err) {
      return "";
    }
  }
  return "";
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function getPayloadAndRaw(req) {
  // Usahakan pakai raw stream terlebih dahulu supaya signature HMAC cocok
  let rawBody = "";
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    rawBody = "";
  }

  if (!rawBody) {
    rawBody = extractRawBody(req);
  }

  let payload = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      payload = parseBody(req);
    }
  } else {
    payload = parseBody(req);
  }

  return { rawBody, payload };
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const { rawBody, payload } = await getPayloadAndRaw(req);
  req.rawBody = rawBody;
  req.body = payload;

  const merchantRef = payload.merchant_ref || payload.merchantRef || payload.reference;
  if (!merchantRef) {
    return send(res, 400, { error: "merchant_ref tidak ditemukan." });
  }

  if (!verifyTripayCallback(payload, req.headers, rawBody)) {
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

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error.message || error);
    return send(res, 500, { error: "Webhook error" });
  }
};

// Matikan bodyParser bawaan Vercel supaya rawBody tersedia untuk HMAC signature
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
