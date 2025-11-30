// Utility untuk membuat PDF tiket mirip template contoh
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

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
  const statusText = (status || "paid").toUpperCase();

  // ================== QR CODE ==================
  const qrValue = ref || `${name}-${eventTitle}`;
  const dataUrl = await QRCode.toDataURL(qrValue);
  const qrBase64 = dataUrl.split(",")[1];
  const qrBuffer = Buffer.from(qrBase64, "base64");

  // ================== PDF INIT ==================
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const { left, right, top, bottom } = doc.page.margins;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - left - right;

  // ================== FONT ARAB OPSIONAL ==================
  let arabicFontName = "Helvetica-Bold";
  let useArabicHeader = false;
  try {
    const candidates = [
      path.join(__dirname, "arabic.ttf"),
      path.join(__dirname, "..", "fonts", "arabic.ttf"),
      path.join(__dirname, "..", "arabic.ttf"),
    ];
    const arabicPath = candidates.find((p) => fs.existsSync(p));
    if (arabicPath) {
      doc.registerFont("ArabicHeader", arabicPath);
      arabicFontName = "ArabicHeader";
      useArabicHeader = true;
    }
  } catch (_) {
    useArabicHeader = false;
  }

  const arabicHeader =
    "ٱلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ وَبَرَكَاتُهُ";
  const latinHeader = "Assalamu'alaikum warahmatullahi wabarakatuh";
  const headerText = useArabicHeader ? arabicHeader : latinHeader;

  // ================== CARI LOGO.PNG ==================
  let logoPath = null;
  try {
    const logoCandidates = [
      path.join(__dirname, "logo.png"),
      path.join(__dirname, "..", "images", "logo.png"),
      path.join(__dirname, "..", "logo.png"),
      path.join(__dirname, "..", "..", "images", "logo.png"),
    ];
    logoPath = logoCandidates.find((p) => fs.existsSync(p)) || null;
  } catch (_) {
    logoPath = null;
  }

  // ================== HEADER ==================
  const topLineY = top + 6;
  const topLineHeight = 6;

  // garis biru atas
  doc
    .save()
    .rect(left, topLineY, contentWidth, topLineHeight)
    .fill(COLORS.primary)
    .restore();

  const headerTextY = topLineY + 18;

  // salam (arab/latin) kiri
  doc
    .font(useArabicHeader ? arabicFontName : "Helvetica-Bold")
    .fontSize(useArabicHeader ? 22 : 16)
    .fillColor(COLORS.primary)
    .text(headerText, left, headerTextY, {
      width: contentWidth * 0.6,
      align: "left",
    });

  // kalimat bawahnya
  const subHeaderY = headerTextY + (useArabicHeader ? 32 : 24);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.text)
    .text(
      "Alhamdulillah, pemesanan tiket Anda telah berhasil diproses.",
      left,
      subHeaderY
    );

  // logo kanan atas
  const logoBoxWidth = 230;
  const logoMaxHeight = 70;
  const logoX = left + contentWidth - logoBoxWidth;
  const logoY = headerTextY - 8;

  if (logoPath) {
    doc.image(logoPath, logoX, logoY, {
      fit: [logoBoxWidth, logoMaxHeight],
      align: "right",
      valign: "center",
    });
  } else {
    // fallback text logo
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(COLORS.primary)
      .text("ketenangan", logoX, headerTextY, {
        width: logoBoxWidth,
        align: "right",
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(COLORS.primaryAccent)
      .text("jiwa", logoX, headerTextY, {
        width: logoBoxWidth,
        align: "right",
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text("Temukan Arah, Temukan Makna", logoX, headerTextY + 24, {
        width: logoBoxWidth,
        align: "right",
      });
  }

  // ================== DUA KOLOM ATAS ==================
  const colGap = 18;
  const colWidth = (contentWidth - colGap) / 2;
  const sectionsTop = subHeaderY + 28;

  // --- Informasi Pesanan (kiri) ---
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Informasi Pesanan", left, sectionsTop);

  const infoPesananBoxY = sectionsTop + 18;
  const infoPesananBoxH = 120;

  drawRoundedBox(
    doc,
    left,
    infoPesananBoxY,
    colWidth,
    infoPesananBoxH,
    12,
    { bg: "#ffffff", color: COLORS.primaryLight }
  );

  const infoPesanan = [
    ["Nama", name],
    ["Email", email],
    ["No. WhatsApp", phone],
  ];

  let lineY = infoPesananBoxY + 22;
  doc.font("Helvetica").fontSize(11);
  infoPesanan.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, left + 18, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`: ${val}`, left + 110, lineY, { width: colWidth - 120 });
    lineY += 22;
  });

  // --- Detail Pesanan (kanan) ---
  const detailX = left + colWidth + colGap;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Detail Pesanan", detailX, sectionsTop);

  const detailBoxY = sectionsTop + 18;
  const detailBoxH = 120;

  drawRoundedBox(
    doc,
    detailX,
    detailBoxY,
    colWidth,
    detailBoxH,
    12,
    { bg: "#ffffff", color: COLORS.primaryLight }
  );

  const detailRows = [
    ["Jumlah Tiket", qty],
    ["Tipe Tiket", type],
    ["Harga Tiket", price ? `Rp ${price.toLocaleString("id-ID")}` : "Gratis"],
  ];

  lineY = detailBoxY + 22;
  doc.font("Helvetica").fontSize(11);
  detailRows.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, detailX + 18, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`${val}`, detailX + 120, lineY, {
        width: colWidth - 132,
        align: "left",
      });
    lineY += 22;
  });

  // garis + total pembayaran di dalam box kanan
  const totalLineY = detailBoxY + detailBoxH - 30;
  doc
    .moveTo(detailX + 12, totalLineY)
    .lineTo(detailX + colWidth - 12, totalLineY)
    .lineWidth(0.7)
    .strokeColor(COLORS.primaryLight)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text("Total Pembayaran", detailX + 18, totalLineY + 6);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.text)
    .text(
      total ? `Rp ${total.toLocaleString("id-ID")}` : "Gratis",
      detailX + colWidth / 2,
      totalLineY + 6,
      { width: colWidth / 2 - 18, align: "right" }
    );

  // status + ref kecil di bawah box
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `Status: ${statusText}  |  Ref: ${ref}`,
      detailX,
      detailBoxY + detailBoxH + 8,
      { width: colWidth }
    );

  // ================== INFORMASI ACARA + QR ==================
  const acaraTitleY = detailBoxY + detailBoxH + 40;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text("Informasi Acara", left, acaraTitleY);

  const qrBoxSize = 210;
  const acaraBoxY = acaraTitleY + 18;
  const acaraBoxHeight = 170;
  const qrBoxX = left + contentWidth - qrBoxSize;
  const qrBoxY = acaraBoxY;

  // box acara di kiri (sisakan ruang QR di kanan)
  const acaraBoxWidth = contentWidth - qrBoxSize - 24;
  drawRoundedBox(
    doc,
    left,
    acaraBoxY,
    acaraBoxWidth,
    acaraBoxHeight,
    12,
    { bg: "#ffffff", color: COLORS.primaryLight }
  );

  const infoAcara = [
    ["Judul Kajian/Event", eventTitle],
    ["Pemateri", speaker || "-"],
    ["Tanggal", eventDate || "-"],
    ["Waktu", eventTime || "-"],
    ["Lokasi", eventLocation || "-"],
  ];

  lineY = acaraBoxY + 22;
  doc.font("Helvetica").fontSize(11);
  infoAcara.forEach(([label, val]) => {
    doc.fillColor(COLORS.muted).text(label, left + 18, lineY);
    doc
      .fillColor(COLORS.text)
      .text(`: ${val}`, left + 170, lineY, {
        width: acaraBoxWidth - 180,
      });
    lineY += 22;
  });

  // kotak QR kanan
  drawRoundedBox(
    doc,
    qrBoxX,
    qrBoxY,
    qrBoxSize,
    qrBoxSize,
    12,
    { bg: COLORS.primaryLight, color: COLORS.primaryLight }
  );

  doc.image(qrBuffer, qrBoxX + 26, qrBoxY + 26, {
    fit: [qrBoxSize - 52, qrBoxSize - 52],
    align: "center",
    valign: "center",
  });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      "Gunakan barcode untuk melakukan check-in pada saat acara.",
      qrBoxX,
      qrBoxY + qrBoxSize + 10,
      { width: qrBoxSize, align: "center" }
    );

  // ================== FOOTER ==================
  const footerTopY = acaraBoxY + acaraBoxHeight + 28;

  // logo kecil kiri bawah
  if (logoPath) {
    doc.image(logoPath, left, footerTopY - 4, {
      width: 130,
    });
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(COLORS.primary)
      .text("ketenangan", left, footerTopY);
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(COLORS.primaryAccent)
      .text(" jiwa", left, footerTopY, { lineBreak: false });
  }

  // alamat di bawah logo
  const addressY = footerTopY + 24;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      "Jalan Taman Internasional I Blok B8 No. 11\nSambikerep, Kota Surabaya, Jawa Timur, Indonesia 60219",
      left,
      addressY,
      { width: contentWidth * 0.4 }
    );

  // kontak (tengah)
  const contactX = left + contentWidth * 0.4 + 14;
  const contactY = footerTopY + 2;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Telepon :", contactX, contactY);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(" 0882-0176-75614 / 0812-3497-5501", contactX + 58, contactY, {
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Email   :", contactX, contactY + 16);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(" ketenanganjiwa.id@gmail.com", contactX + 58, contactY + 16, {
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text("Instagram :", contactX, contactY + 32);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(" @ketenanganjiwa.id", contactX + 58, contactY + 32, {
      lineBreak: false,
    });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

module.exports = { generateTicketPdf };
