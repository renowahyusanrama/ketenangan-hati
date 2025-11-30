// Utility untuk membuat PDF tiket yang mirip template contoh
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const COLORS = {
  primary: "#2c76b7",
  primaryLight: "#c6e3f8",
  border: "#a9c7e2",
  text: "#1e293b",
  muted: "#475569",
  headerBg: "#e9f3fb",
};

function drawRoundedBox(doc, x, y, w, h, radius = 8, options = {}) {
  const { stroke = true, fill = false, color = COLORS.border, bg } = options;
  if (bg) {
    doc.save().fillColor(bg).roundedRect(x, y, w, h, radius).fill().restore();
  }
  if (stroke) {
    doc.save().lineWidth(1).strokeColor(color).roundedRect(x, y, w, h, radius).stroke().restore();
  }
  return doc;
}

async function generateTicketPdf(order = {}) {
  const {
    customer = {},
    eventTitle = "Kajian / Event",
    amount,
    status,
    reference,
    merchantRef,
    eventDate,
    eventTime,
    eventLocation,
    speaker,
    ticketType,
    ticketCount,
  } = order;

  const name = customer.name || order.name || "Peserta";
  const email = customer.email || order.email || "-";
  const phone = customer.phone || order.phone || "-";
  const ref = reference || merchantRef || "-";
  const total = Number(order.totalAmount ?? order.amount ?? amount ?? 0) || 0;
  const price = Number(order.baseAmount ?? amount ?? 0) || total;
  const qty = ticketCount || order.quantity || 1;
  const type = ticketType || order.ticketType || "Reguler";
  const statusText = status || "paid";

  // QR code data
  const qrValue = ref;
  const dataUrl = await QRCode.toDataURL(qrValue);
  const qrBase64 = dataUrl.split(",")[1];
  const qrBuffer = Buffer.from(qrBase64, "base64");

  const doc = new PDFDocument({ size: "A4", margin: 32 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  // Header
  doc.rect(doc.page.margins.left, 32, doc.page.width - doc.page.margins.left * 2, 40).fill(COLORS.headerBg).fillColor(COLORS.primary);
  doc.fontSize(14).font("Helvetica-Bold").text("Assalamu'alaikum warahmatullahi wabarakatuh", doc.page.margins.left + 12, 42);
  doc.fontSize(10).fillColor(COLORS.text).text("Alhamdulillah, pemesanan tiket Anda telah berhasil diproses.", doc.page.margins.left + 12, 62);
  // Logo teks sederhana (jika tidak ada file logo)
  doc.fontSize(18).fillColor(COLORS.primary).font("Helvetica-Bold").text("ketenangan jiwa", doc.page.width - doc.page.margins.right - 180, 42, { width: 170, align: "right" });

  // Boxes layout
  const colWidth = (doc.page.width - doc.page.margins.left * 2 - 12) / 2;
  const topY = 90;

  // Informasi Pesanan (kiri atas)
  drawRoundedBox(doc, doc.page.margins.left, topY, colWidth, 150, 10, { bg: "white", color: COLORS.border });
  doc.fillColor(COLORS.primary).fontSize(14).font("Helvetica-Bold").text("Informasi Pesanan", doc.page.margins.left + 12, topY + 10);
  doc.fillColor(COLORS.text).fontSize(11).font("Helvetica");
  const infoPesanan = [
    ["Nama", name],
    ["Email", email],
    ["No. WhatsApp", phone],
  ];
  let lineY = topY + 36;
  infoPesanan.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(`${label}`, doc.page.margins.left + 12, lineY);
    doc.fillColor(COLORS.text).text(`: ${val}`, doc.page.margins.left + 110, lineY);
    lineY += 18;
  });

  // Detail Pesanan (kanan atas)
  drawRoundedBox(doc, doc.page.margins.left + colWidth + 12, topY, colWidth, 150, 10, { bg: "white", color: COLORS.border });
  doc.fillColor(COLORS.primary).fontSize(14).font("Helvetica-Bold").text("Detail Pesanan", doc.page.margins.left + colWidth + 24, topY + 10);
  doc.fillColor(COLORS.text).fontSize(11).font("Helvetica");
  const detailPesanan = [
    ["Jumlah Tiket", qty],
    ["Tipe Tiket", type],
    ["Harga Tiket", price ? `Rp ${price.toLocaleString("id-ID")}` : "Gratis"],
    ["Total Pembayaran", total ? `Rp ${total.toLocaleString("id-ID")}` : "Gratis"],
    ["Status", statusText.toUpperCase()],
    ["Ref", ref],
  ];
  lineY = topY + 36;
  detailPesanan.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(`${label}`, doc.page.margins.left + colWidth + 24, lineY);
    doc.fillColor(COLORS.text).text(`: ${val}`, doc.page.margins.left + colWidth + 140, lineY);
    lineY += 18;
  });

  // Informasi Acara (bawah kiri)
  const infoY = topY + 170;
  drawRoundedBox(doc, doc.page.margins.left, infoY, colWidth + colWidth - 12, 150, 10, { bg: "white", color: COLORS.border });
  doc.fillColor(COLORS.primary).fontSize(14).font("Helvetica-Bold").text("Informasi Acara", doc.page.margins.left + 12, infoY + 10);
  doc.fillColor(COLORS.text).fontSize(11).font("Helvetica");
  const infoAcara = [
    ["Judul Kajian/Event", eventTitle],
    ["Pemateri", speaker || "-"],
    ["Tanggal", eventDate || "-"],
    ["Waktu", eventTime || "-"],
    ["Lokasi", eventLocation || "-"],
  ];
  lineY = infoY + 36;
  infoAcara.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(`${label}`, doc.page.margins.left + 12, lineY);
    doc.fillColor(COLORS.text).text(`: ${val}`, doc.page.margins.left + 150, lineY, { width: colWidth * 2 - 180 });
    lineY += 18;
  });

  // QR box (kanan bawah)
  const qrBoxW = 200;
  const qrBoxH = 200;
  const qrX = doc.page.width - doc.page.margins.right - qrBoxW;
  const qrY = infoY + 10;
  drawRoundedBox(doc, qrX, qrY, qrBoxW, qrBoxH, 10, { bg: COLORS.primaryLight, color: COLORS.border });
  doc.fillColor(COLORS.muted).fontSize(12).text("BARCODE / QR", qrX, qrY + 8, { width: qrBoxW, align: "center" });
  doc.image(qrBuffer, qrX + 25, qrY + 30, { fit: [qrBoxW - 50, qrBoxW - 50], align: "center", valign: "center" });
  doc.fillColor(COLORS.muted).fontSize(10).text("Gunakan QR ini untuk check-in.", qrX, qrY + qrBoxH + 8, { width: qrBoxW, align: "center" });

  // Footer
  const footerY = doc.page.height - doc.page.margins.bottom - 40;
  doc.moveTo(doc.page.margins.left, footerY).lineTo(doc.page.width - doc.page.margins.right, footerY).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.muted).fontSize(10);
  doc.text("ketenangan jiwa", doc.page.margins.left, footerY + 8);
  doc.text("Hubungi: 0882-0176-75614 / 0812-3497-5501", doc.page.margins.left + 200, footerY + 8);
  doc.text("Email: ketenanganjiwa.id@gmail.com", doc.page.margins.left + 200, footerY + 22);
  doc.text("Alamat: Jalan Taman Internasional I Blok B8 No. 11, Sambikerep, Surabaya, Jawa Timur", doc.page.margins.left, footerY + 22, { width: 400 });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

module.exports = { generateTicketPdf };
