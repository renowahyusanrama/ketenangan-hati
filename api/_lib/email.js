// api/_lib/email.js
const { Resend } = require("resend");
const { generateTicketPdf } = require("./ticket_pdf");

// 🔑 pastikan ini di-set di Vercel (Production env)
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

// Gunakan domain terverifikasi di Resend (set di env RESEND_FROM untuk produksi)
const RESEND_FROM = process.env.RESEND_FROM || "noreply@ketenanganjiwa.id";

// email akun kamu di Resend (yang boleh terima email di mode testing)
const RESEND_OWNER_EMAIL = process.env.RESEND_OWNER_EMAIL || "onmeren@gmail.com";

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

function buildTicketHtml({ name, email, phone, eventTitle, eventId, method, payCode, amount, reference, ticketUrl }) {
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
        ticketUrl
          ? `<div style="margin-top:16px; text-align:center;">
              <p style="margin:0 0 8px; color:#475569;">Tiket PDF terlampir. Jika lampiran tidak bisa dibuka, klik tautan berikut:</p>
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
  // Link tiket
  const base = TICKET_BASE_URL.replace(/\/$/, "");
  const ticketUrl = reference
    ? `${base}/ticket.html?ref=${encodeURIComponent(reference)}`
    : "";

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
    ticketUrl,
  });

  const finalTo = originalEmail;
  const html = baseHtml;

  // Siapkan PDF lampiran (best effort)
  let pdfAttachment = null;
  try {
    const pdfBuf = await generateTicketPdf({
      ...order,
      reference,
      ticketUrl,
      eventTitle,
    });
    pdfAttachment = {
      content: pdfBuf.toString("base64"),
      filename: `tiket-${reference || "order"}.pdf`,
      contentType: "application/pdf",
    };
  } catch (err) {
    console.error("Gagal generate PDF tiket:", err?.message || err);
  }

  const resend = new Resend(RESEND_API_KEY);
  const basePayload = {
    from: RESEND_FROM,
    to: finalTo,
    subject,
  };

  const attachments = [];
  if (pdfAttachment) attachments.push(pdfAttachment);
  const payload = {
    ...basePayload,
    html,
    ...(attachments.length ? { attachments } : {}),
  };

  try {
    const result = await resend.emails.send(payload);
    console.log("Resend API result:", result);
    return result;
  } catch (err) {
    console.error("Resend API error:", err?.response?.data || err?.message || err);
    throw err;
  }
}

module.exports = { sendTicketEmail };
