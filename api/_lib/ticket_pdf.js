// Utility untuk membuat PDF tiket yang mirip template contoh
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const COLORS = {
  primary: "#2c76b7",
  primaryAccent: "#0a9ed9",
  primaryLight: "#c6e3f8",
  border: "#a9c7e2",
  text: "#1e293b",
  muted: "#475569",
};

function drawRoundedBox(doc, x, y, w, h, radius = 8, options = {}) {
  const { stroke = true, fill = false, color = COLORS.border, bg } = options;
  if (bg) {
    doc.save().fillColor(bg).roundedRect(x, y, w, h, radius).fill().restore();
  }
  if (stroke) {
    doc
      .save()
      .lineWidth(1)
      .strokeColor(color)
      .roundedRect(x, y, w, h, radius)
      .stroke()
      .restore();
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

  const { left, right, top, bottom } = doc.page.margins;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - left - right;

  // =========================
  // HEADER MIRIP TEMPLATE
  // =========================

  // Garis biru di paling atas
  const topLineY = top;
  doc
    .save()
    .rect(left, topLineY, contentWidth, 6)
    .fill(COLORS.primary)
    .restore();

  // Salam Arab
  const headerTextY = topLineY + 18;
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(COLORS.primary)
    .text(
      "ٱلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ",
      left,
      headerTextY,
      { width: contentWidth * 0.6, align: "left" }
    );

  // Kalimat Alhamdulillah
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text(
      "Alhamdulillah, pemesanan tiket Anda telah berhasil diproses.",
      left,
      headerTextY + 32,
      { width: contentWidth * 0.6 }
    );

  // Logo "ketenangan jiwa" di kanan atas (2 warna, 1 baris)
  const logoWord1 = "ketenangan";
  const logoWord2 = "jiwa";
  doc.font("Helvetica-Bold").fontSize(24);

  const logoTotalWidth =
    doc.widthOfString(logoWord1 + " ") + doc.widthOfString(logoWord2);
  const logoStartX = left + contentWidth - logoTotalWidth;
  const logoY = headerTextY + 4;

  doc
    .fillColor(COLORS.primary)
    .text(logoWord1 + " ", logoStartX, logoY, {
      lineBreak: false,
    });

  const spaceWidth = doc.widthOfString(logoWord1 + " ");
  doc
    .fillColor(COLORS.primaryAccent)
    .text(logoWord2, logoStartX + spaceWidth, logoY, { lineBreak: false });

  // Tagline di bawah logo
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(COLORS.muted)
    .text(
      "Temukan Arah, Temukan Makna",
      logoStartX,
      logoY + 20,
      { width: logoTotalWidth, align: "right" }
    );

  // =========================
  // INFORMASI PESANAN & DETAIL PESANAN (2 KOLOM ATAS)
  // =========================

  const colGap = 18;
  const colWidth = (contentWidth - colGap) / 2;
  const topSectionY = headerTextY + 70;

  // --- Informasi Pesanan (kiri) ---
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Informasi Pesanan", left, topSectionY);

  const infoPesananBoxY = topSectionY + 18;
  const infoPesananBoxH = 120;

  drawRoundedBox(
    doc,
    left,
    infoPesananBoxY,
    colWidth,
    infoPesananBoxH,
    10,
    { bg: "#ffffff", color: COLORS.border }
  );

  const infoPesanan = [
    ["Nama", name],
    ["Email", email],
    ["No. WhatsApp", phone],
  ];

  let lineY = infoPesananBoxY + 20;
  doc.font("Helvetica").fontSize(11);

  infoPesanan.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, left + 12, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`: ${val}`, left + 110, lineY, {
        width: colWidth - 120,
      });
    lineY += 20;
  });

  // --- Detail Pesanan (kanan) ---
  const detailX = left + colWidth + colGap;

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Detail Pesanan", detailX, topSectionY);

  const detailBoxY = topSectionY + 18;
  const detailBoxH = 120;

  drawRoundedBox(
    doc,
    detailX,
    detailBoxY,
    colWidth,
    detailBoxH,
    10,
    { bg: "#ffffff", color: COLORS.border }
  );

  // Tiga baris utama di dalam box
  const detailRows = [
    ["Jumlah Tiket", qty],
    ["Tipe Tiket", type],
    ["Harga Tiket", price ? `Rp ${price.toLocaleString("id-ID")}` : "Gratis"],
  ];

  lineY = detailBoxY + 20;
  doc.font("Helvetica").fontSize(11);

  detailRows.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, detailX + 12, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`${val}`, detailX + 120, lineY, {
        width: colWidth - 132,
        align: "left",
      });
    lineY += 20;
  });

  // Garis pemisah & total pembayaran di bagian bawah box (mirip template)
  const totalLineY = detailBoxY + detailBoxH - 30;
  doc
    .moveTo(detailX + 10, totalLineY)
    .lineTo(detailX + colWidth - 10, totalLineY)
    .lineWidth(0.7)
    .strokeColor(COLORS.border)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text(
      "Total Pembayaran",
      detailX + 12,
      totalLineY + 6,
      { width: colWidth / 2 }
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.text)
    .text(
      total ? `Rp ${total.toLocaleString("id-ID")}` : "Gratis",
      detailX + colWidth / 2,
      totalLineY + 6,
      {
        width: colWidth / 2 - 12,
        align: "right",
      }
    );

  // Status & Ref kecil di bawah box, supaya sistem tetap informatif
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      `Status: ${statusText.toUpperCase()}  |  Ref: ${ref}`,
      detailX,
      detailBoxY + detailBoxH + 8,
      { width: colWidth }
    );

  // =========================
  // INFORMASI ACARA (LEBAR PENUH)
  // =========================

  const infoAcaraTitleY = detailBoxY + detailBoxH + 40;

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Informasi Acara", left, infoAcaraTitleY);

  const infoAcaraBoxY = infoAcaraTitleY + 18;
  const infoAcaraBoxH = 150;

  drawRoundedBox(
    doc,
    left,
    infoAcaraBoxY,
    contentWidth,
    infoAcaraBoxH,
    10,
    { bg: "#ffffff", color: COLORS.border }
  );

  const infoAcara = [
    ["Judul Kajian/Event", eventTitle],
    ["Pemateri", speaker || "-"],
    ["Tanggal", eventDate || "-"],
    ["Waktu", eventTime || "-"],
    ["Lokasi", eventLocation || "-"],
  ];

  lineY = infoAcaraBoxY + 20;
  doc.font("Helvetica").fontSize(11);

  infoAcara.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, left + 12, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`: ${val}`, left + 160, lineY, {
        width: contentWidth - 170,
      });
    lineY += 20;
  });

  // =========================
  // BAGIAN BAWAH: LOGO KECIL, ALAMAT, KONTAK, BARCODE
  // =========================

  const bottomRowY = infoAcaraBoxY + infoAcaraBoxH + 28;

  // Kolom 1: logo kecil + alamat
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.primary)
    .text("ketenangan", left, bottomRowY);

  const miniLogoWidth =
    doc.widthOfString("ketenangan ") + doc.widthOfString("jiwa");

  doc
    .fillColor(COLORS.primaryAccent)
    .text(" jiwa", left, bottomRowY, { lineBreak: false });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      "Jalan Taman Internasional I Blok B8 No. 11\nSambikerep, Kota Surabaya, Jawa Timur, Indonesia 60219",
      left,
      bottomRowY + 18,
      { width: contentWidth * 0.4 }
    );

  // Kolom 2: kontak
  const midColX = left + contentWidth * 0.4 + 12;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Telepon :", midColX, bottomRowY);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(
      " 0882-0176-75614 / 0812-3497-5501",
      midColX + 58,
      bottomRowY,
      { lineBreak: false }
    );

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Email   :", midColX, bottomRowY + 16);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(" ketenanganjiwa.id@gmail.com", midColX + 58, bottomRowY + 16, {
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Instagram :", midColX, bottomRowY + 32);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(" @ketenanganjiwa.id", midColX + 58, bottomRowY + 32, {
      lineBreak: false,
    });

  // Kolom 3: kotak BARCODE / QR di kanan
  const qrBoxSize = 200;
  const qrBoxX = pageWidth - right - qrBoxSize;
  const qrBoxY = bottomRowY - 4;

  drawRoundedBox(
    doc,
    qrBoxX,
    qrBoxY,
    qrBoxSize,
    qrBoxSize,
    10,
    { bg: COLORS.primaryLight, color: COLORS.border }
  );

  // QR code di tengah kotak
  doc.image(qrBuffer, qrBoxX + 24, qrBoxY + 24, {
    fit: [qrBoxSize - 48, qrBoxSize - 48],
    align: "center",
    valign: "center",
  });

  // Catatan di bawah barcode
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      "Gunakan barcode untuk melakukan\ncheck-in pada saat acara.",
      qrBoxX,
      qrBoxY + qrBoxSize + 8,
      { width: qrBoxSize, align: "center" }
    );

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

module.exports = { generateTicketPdf };
