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

// email akun kamu di Resend
const RESEND_OWNER_EMAIL = "ketenanganjiwa.id@gmail.com";

// SELAGI BELUM VERIFY DOMAIN → biarkan true
const RESEND_TEST_MODE = true;

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
}) {
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
        <tr><td style="padding:6px 0; color:#475569;">Total</td><td style="padding:6px 0; font-weight:700; color:#16a34a;">Rp ${Number(
          amount || 0,
        ).toLocaleString("id-ID")}</td></tr>
        <tr><td style="padding:6px 0; color:#475569;">Ref</td><td style="padding:6px 0;">${reference || eventId}</td></tr>
      </table>
      <p style="margin-top:16px;">Silakan tunjukkan email ini saat registrasi / check-in.</p>
      <p style="margin-top:8px; color:#475569;">Email ini otomatis, mohon tidak dibalas.</p>
    </div>
  `;
}

async function sendTicketEmail(order) {
  if (!order) {
    console.warn("sendTicketEmail: order kosong");
    return;
  }

  // 🔥 FIX PENTING: support event GRATIS yang mungkin pakai order.email, bukan order.customer.email
  const rawEmail = order?.customer?.email || order?.email;
  if (!rawEmail) {
    console.warn("sendTicketEmail: tidak ada email penerima di order", order);
    return;
  }

  const subject = `E-Ticket / Tagihan ${
    order.eventTitle || order.eventId || "Acara"
  }`;

  const name = order.customer?.name || order.name || "Peserta";
  const email = rawEmail;
  const phone = order.customer?.phone || order.phone || "-";

  const eventTitle = order.eventTitle || order.eventId || "Acara";
  const eventId = order.eventId || "-";

  // Kalau amount 0 / kosong → anggap event gratis
  const amount = order.amount ?? 0;

  const method =
    order.paymentType === "bank_transfer"
      ? `VA ${order.bank?.toUpperCase() || order.method || "-"}`
      : order.paymentType === "qris"
      ? "QRIS"
      : amount === 0
      ? "GRATIS / Tanpa Pembayaran"
      : order.method || "Pembayaran";

  const payCode = order.vaNumber || order.payCode || "-";
  const reference = order.reference || order.merchantRef || eventId;

  const baseHtml = buildTicketHtml({
    name,
    email,
    phone,
    eventTitle,
    eventId,
    method,
    payCode,
    amount,
    reference,
  });

  let finalTo = rawEmail;
  let finalHtml = baseHtml;

  // MODE TEST: semua email dialihkan ke inbox kamu
  if (RESEND_API_KEY && RESEND_TEST_MODE) {
    finalTo = RESEND_OWNER_EMAIL;
    finalHtml = `
      <div style="font-family:Arial, sans-serif; max-width:560px; margin:auto; color:#0f172a">
        <p style="padding:8px; background:#fef3c7; border-radius:6px; border:1px solid #facc15; font-size:13px;">
          <strong>TEST MODE:</strong> Aslinya email ini untuk <strong>${rawEmail}</strong>. 
          Karena domain Resend belum diverifikasi, semua email dialihkan ke <strong>${RESEND_OWNER_EMAIL}</strong>.
        </p>
      </div>
      <hr style="margin:16px 0;" />
      ${baseHtml}
    `;
  }

  // Kirim via Resend kalau sudah di-set
  if (RESEND_API_KEY) {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: RESEND_FROM,
      to: finalTo,
      subject,
      html: finalHtml,
    });
    return;
  }

  // Fallback (kalau nanti mau pakai SMTP/Brevo)
  const transporter = createTransporter();
  await transporter.sendMail({
    from: BREVO_FROM || SMTP_FROM,
    to: finalTo,
    subject,
    html: finalHtml,
  });
}

module.exports = { sendTicketEmail };
