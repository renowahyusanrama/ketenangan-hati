// api/_lib/email.js
const { Resend } = require("resend");
const QRCode = require("qrcode");

// 🔑 pastikan ini di-set di Vercel (Production env)
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

// from boleh pakai onboarding@resend.dev (direkomendasikan Resend untuk testing)
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

// email akun kamu di Resend (yang boleh terima email di mode testing)
const RESEND_OWNER_EMAIL = "ketenanganjiwa.id@gmail.com";

// SELAGI BELUM VERIFY DOMAIN → biarkan true
const RESEND_TEST_MODE = true;

// Base URL halaman tiket. Urutan prioritas:
// 1) TICKET_BASE_URL (manual/custom domain)
// 2) VERCEL_URL (otomatis di Vercel)
// 3) CF_PAGES_URL (Cloudflare Pages)
// 4) Fallback GitHub Pages
const VERCEL_BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
const CF_PAGES_BASE_URL = process.env.CF_PAGES_URL ? `https://${process.env.CF_PAGES_URL}` : "";
const TICKET_BASE_URL = (
  process.env.TICKET_BASE_URL ||
  VERCEL_BASE_URL ||
  CF_PAGES_BASE_URL ||
  "https://renowahysanrama.github.io/ketenangan-jiwa"
).replace(/\/$/, "");

function buildTicketHtml({
  name,
  email,
  phone,
  eventTitle,
  eventId,
  method,
  payCode,
  amount,
  reference,
  ticketUrl,
  qrDataUrl, // bisa kosong atau "cid:xxx"
}) {
  return `
    <div style="font-family:Arial, sans-serif; max-width:560px; margin:auto; color:#0f172a">
      <h2 style="color:#2563eb; margin-bottom:4px;">E-Ticket / Konfirmasi</h2>
      <p style="margin:0 0 12px;">Terima kasih telah mendaftar acara <strong>${eventTitle}</strong>.</p>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:6px 0; color:#475569;">Nama</td><td style="padding:6px 0; font-weight:600;">${name || "Peserta"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Email</td><td style="padding:6px 0;">${email || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">WhatsApp</td><td style="padding:6px 0;">${phone || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Event</td><td style="padding:6px 0;">${eventTitle}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Metode</td><td style="padding:6px 0; font-weight:600;">${method || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Kode/VA</td><td style="padding:6px 0; font-weight:600;">${payCode || (amount === 0 ? "GRATIS" : "-")}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Total</td><td style="padding:6px 0; font-weight:700; color:#16a34a;">Rp ${Number(
          amount || 0,
        ).toLocaleString("id-ID")}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Ref</td><td style="padding:6px 0;">${reference || eventId}</td></tr>
      </table>
      ${
        qrDataUrl
          ? `<div style="margin-top:16px; text-align:center;">
              <p style="margin:0 0 8px; color:#475569;">Tunjukkan QR ini saat check-in:</p>
              <img src="${qrDataUrl}" alt="QR E-Ticket" style="width:200px; height:200px; border:1px solid #e2e8f0; border-radius:12px;" />
              ${
                ticketUrl
                  ? `<p style="margin-top:8px;"><a href="${ticketUrl}" style="color:#2563eb;">Buka tiket</a></p>`
                  : ""
              }
            </div>`
          : ticketUrl
          ? `<div style="margin-top:16px; text-align:center;">
              <p style="margin:0 0 8px; color:#475569;">Jika QR tidak muncul di email, klik tautan berikut:</p>
              <a href="${ticketUrl}" style="color:#2563eb;">Buka tiket</a>
            </div>`
          : ""
      }
      <p style="margin-top:16px;">Silakan tunjukkan email ini saat registrasi / check-in.</p>
      <p style="margin-top:8px; color:#475569;">Email ini otomatis, mohon tidak dibalas.</p>
    </div>
  `;
}

async function sendTicketEmail(order) {
  console.log("sendTicketEmail() dipanggil:", {
    hasApiKey: !!RESEND_API_KEY,
    from: RESEND_FROM,
    ownerEmail: RESEND_OWNER_EMAIL,
    customerEmail: order?.customer?.email,
    directEmail: order?.email,
    eventId: order?.eventId,
    amount: order?.amount,
    paymentType: order?.paymentType,
    status: order?.status,
  });

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY belum di-set. Email tidak dikirim.");
    return;
  }

  if (!order) {
    console.error("sendTicketEmail: order kosong");
    return;
  }

  const originalEmail = order?.customer?.email || order?.email;
  if (!originalEmail) {
    console.error("sendTicketEmail: tidak ada email penerima di order");
    return;
  }

  const subject = `E-Ticket / Konfirmasi ${
    order.eventTitle || order.eventId || "Acara"
  }`;

  const name = order.customer?.name || order.name || "Peserta";
  const email = originalEmail;
  const phone = order.customer?.phone || order.phone || "-";

  const eventTitle = order.eventTitle || order.eventId || "Acara";
  const eventId = order.eventId || "-";

  const amount = order.amount ?? 0;

  const method =
    amount === 0
      ? "GRATIS / Tanpa Pembayaran"
      : order.paymentType === "bank_transfer"
      ? `VA ${order.bank?.toUpperCase() || order.method || "-"}`
      : order.paymentType === "qris"
      ? "QRIS"
      : order.method || "Pembayaran";

  const payCode =
    order.vaNumber || order.payCode || (amount === 0 ? "GRATIS" : "-");

  const reference =
    order.reference || order.merchantRef || order.orderId || order.id || eventId;

  // ⚠️ Di sini kita pastikan selalu pakai /ketenangan-jiwa
  const base = TICKET_BASE_URL.replace(/\/$/, "");
  const ticketUrl = reference
    ? `${base}/ticket.html?ref=${encodeURIComponent(reference)}`
    : "";

  // ==== QR CODE (inline attachment pakai CID) ====
  const isPaid = (order.status || "").toLowerCase() === "paid";
  let qrSrcForHtml = ""; // "cid:..." kalau berhasil
  let qrAttachment = null;

  if (isPaid && ticketUrl) {
    try {
      const dataUrl = await QRCode.toDataURL(ticketUrl);
      const base64 = dataUrl.split(",")[1]; // buang prefix "data:image/png;base64,"

      const contentId = "ticket-qr"; // cukup satu ID sederhana
      qrSrcForHtml = `cid:${contentId}`;

      qrAttachment = {
        content: base64,
        filename: `qr-${reference || eventId}.png`,
        contentId, // penting untuk inline image
      };

      console.log("QR inline attachment disiapkan untuk:", ticketUrl);
    } catch (err) {
      console.error("QR generate error:", err?.message || err);
    }
  }
  // ===============================================

  // HTML versi dengan QR (kalau ada) dan tanpa QR (fallback)
  const baseHtmlWithQr = buildTicketHtml({
    name,
    email,
    phone,
    eventTitle,
    eventId,
    method,
    payCode,
    amount,
    reference,
    ticketUrl,
    qrDataUrl: qrSrcForHtml,
  });

  const baseHtmlNoQr = buildTicketHtml({
    name,
    email,
    phone,
    eventTitle,
    eventId,
    method,
    payCode,
    amount,
    reference,
    ticketUrl,
    qrDataUrl: "",
  });

  let finalTo = originalEmail;
  let htmlWithQr = baseHtmlWithQr;
  let htmlNoQr = baseHtmlNoQr;

  if (RESEND_TEST_MODE) {
    finalTo = RESEND_OWNER_EMAIL;
    const banner = `
      <div style="font-family:Arial, sans-serif; max-width:560px; margin:auto; color:#0f172a">
        <p style="padding:8px; background:#fef3c7; border-radius:6px; border:1px solid #facc15; font-size:13px;">
          <strong>TEST MODE:</strong> Aslinya email ini untuk <strong>${originalEmail}</strong>.<br/>
          Semua email dialihkan ke <strong>${RESEND_OWNER_EMAIL}</strong>.
        </p>
      </div>
      <hr style="margin:16px 0;" />
    `;
    htmlWithQr = `${banner}${baseHtmlWithQr}`;
    htmlNoQr = `${banner}${baseHtmlNoQr}`;
  }

  const resend = new Resend(RESEND_API_KEY);
  const basePayload = {
    from: RESEND_FROM,
    to: finalTo,
    subject,
  };

  // Coba kirim dengan QR (kalau ada attachment)
  try {
    const payloadWithQr = {
      ...basePayload,
      html: htmlWithQr,
      ...(qrAttachment ? { attachments: [qrAttachment] } : {}),
    };

    const result = await resend.emails.send(payloadWithQr);
    console.log("Resend API result (with QR):", result);
  } catch (err) {
    console.error(
      "Resend API error (with attachments), mencoba fallback tanpa QR:",
      err?.response?.data || err?.message || err,
    );

    // Fallback: kirim ulang TANPA attachment & TANPA QR
    try {
      const fallbackPayload = {
        ...basePayload,
        html: htmlNoQr,
      };
      const result2 = await resend.emails.send(fallbackPayload);
      console.log("Resend API result (fallback no QR):", result2);
    } catch (err2) {
      console.error(
        "Resend API fallback error (no attachments):",
        err2?.response?.data || err2?.message || err2,
      );
    }
  }
}

module.exports = { sendTicketEmail };
