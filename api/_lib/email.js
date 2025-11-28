const nodemailer = require("nodemailer");
const { Resend } = require("resend");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "no-reply@example.com";

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_FROM = process.env.BREVO_FROM || SMTP_FROM;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

function createTransporter() {
  if (BREVO_API_KEY) {
    return nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: BREVO_API_KEY,
      },
    });
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP env (SMTP_HOST/SMTP_USER/SMTP_PASS) is not set");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function buildTicketHtml({ name, email, phone, eventTitle, eventId, method, payCode, amount, reference }) {
  return `
    <div style="font-family:Arial, sans-serif; max-width:560px; margin:auto; color:#0f172a">
      <h2 style="color:#2563eb; margin-bottom:4px;">E-Ticket / Tagihan</h2>
      <p style="margin:0 0 12px;">Terima kasih telah mendaftar acara <strong>${eventTitle}</strong>.</p>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:6px 0; color:#475569;">Nama</td><td style="padding:6px 0; font-weight:600;">${name || "Peserta"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Email</td><td style="padding:6px 0;">${email || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">WhatsApp</td><td style="padding:6px 0;">${phone || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Event</td><td style="padding:6px 0;">${eventTitle}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Metode</td><td style="padding:6px 0; font-weight:600;">${method || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Kode/VA</td><td style="padding:6px 0; font-weight:600;">${payCode || "-"}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Total</td><td style="padding:6px 0; font-weight:700; color:#16a34a;">Rp ${Number(amount || 0).toLocaleString("id-ID")}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Ref</td><td style="padding:6px 0;">${reference || eventId}</td></tr>
      </table>
      <p style="margin-top:16px;">Silakan selesaikan pembayaran sesuai petunjuk di halaman pembayaran.</p>
      <p style="margin-top:8px; color:#475569;">Email ini otomatis, mohon tidak dibalas.</p>
    </div>
  `;
}

async function sendTicketEmail(order) {
  const to = order?.customer?.email;
  if (!to) return;
  const subject = `E-Ticket / Tagihan ${order.eventTitle || order.eventId || "Acara"}`;
  const html = buildTicketHtml({
    name: order.customer?.name,
    email: order.customer?.email,
    phone: order.customer?.phone,
    eventTitle: order.eventTitle,
    eventId: order.eventId,
    method: order.paymentType === "bank_transfer" ? `VA ${order.bank?.toUpperCase() || order.method}` : "QRIS",
    payCode: order.vaNumber || order.payCode,
    amount: order.amount,
    reference: order.reference || order.merchantRef,
  });

  // Kirim via Resend jika API key tersedia
  if (RESEND_API_KEY) {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: RESEND_FROM,
      to,
      subject,
      html,
    });
    return;
  }

  // Fallback ke Brevo/SMTP
  const transporter = createTransporter();
  await transporter.sendMail({
    from: BREVO_FROM || SMTP_FROM,
    to,
    subject,
    html,
  });
}

module.exports = { sendTicketEmail };
