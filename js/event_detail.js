import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { EVENT_SEED_DATA } from "./events_seed_data.js";

const firebaseConfig = {
  apiKey: "AIzaSyCoa_Ioa-Gp9TnL5eke6fwTkfQGkbWGJBw",
  authDomain: "pengajian-online.firebaseapp.com",
  projectId: "pengajian-online",
  storageBucket: "pengajian-online.firebasestorage.app",
  messagingSenderId: "965180253441",
  appId: "1:965180253441:web:f03f6cb969e422fd7e2700",
  measurementId: "G-YJ81SDXM5E",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==== BAGIAN INI SAYA PERBAIKI AGAR TIDAK MACET ====
const PROD_FUNCTION_BASE = "https://ketenangan-jiwa.vercel.app/api"; // URL PASTI
const LOCAL_FUNCTION_BASE = "http://localhost:5001/pengajian-online/us-central1/api";

const isBrowser = typeof window !== "undefined";

// Logika: Jika di HTML ada window.__API_BASE_URL__, pakai itu (Paling Aman).
// Jika tidak, baru pakai logika lama.
let API_BASE;
if (isBrowser && window.__API_BASE_URL__) {
    API_BASE = window.__API_BASE_URL__;
} else {
    API_BASE = !isBrowser
      ? PROD_FUNCTION_BASE
      : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? LOCAL_FUNCTION_BASE
      : "/api"; // Fallback
}
console.log("System Connected to:", API_BASE); // Cek Console untuk memastikan

let activeOrderStatusPoll = null;
let activeExpiryTimer = null;

const FORM_KEY_PREFIX = "kj-payment-form-";
const ORDER_KEY_PREFIX = "kj-payment-order-";

// =========================================================

function formatCurrency(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && text != null) el.textContent = text;
}

function renderList(listId, items, formatter) {
  const container = document.getElementById(listId);
  const block = container?.parentElement;
  if (!container) return;

  container.innerHTML = "";
  if (!items || !items.length) {
    block?.classList.add("is-hidden");
    if(block) block.style.display = 'none';
    return;
  }
  block?.classList.remove("is-hidden");
  if(block) block.style.display = 'block';

  items.forEach((item) => {
    const li = document.createElement("li");
    if (formatter) formatter(li, item);
    else li.textContent = item;
    container.appendChild(li);
  });
}

function renderAgendaItem(li, item) {
  li.className = "agenda-item";
  const time = document.createElement("time");
  time.textContent = item.time || "";
  const desc = document.createElement("p");
  desc.textContent = item.activity || "";
  li.appendChild(time);
  li.appendChild(desc);
}

function renderContact(listId, contact) {
  const container = document.getElementById(listId);
  if (!container) return;
  container.innerHTML = "";
  if (!contact) return;

  if (contact.phone) {
    const li = document.createElement("li");
    li.textContent = `Telp/WA: ${contact.phone}`;
    container.appendChild(li);
  }
  if (contact.wa) {
    const li = document.createElement("li");
    li.innerHTML = `WhatsApp panitia: <a href="${contact.wa}" target="_blank" rel="noopener">Chat sekarang</a>`;
    container.appendChild(li);
  }
  if (contact.email) {
    const li = document.createElement("li");
    li.innerHTML = `Email: <a href="mailto:${contact.email}">${contact.email}</a>`;
    container.appendChild(li);
  }
}

function renderNotFound() {
  const main = document.querySelector("main");
  if (main) {
    main.innerHTML = `
      <section class="section">
        <div class="container empty-state" style="text-align:center; padding:50px;">
          <h2>Event tidak ditemukan</h2>
          <p>Maaf, tautan event yang Anda buka tidak tersedia atau sudah tidak aktif.</p>
          <a href="index.html#event" class="btn btn-primary">Kembali ke daftar event</a>
        </div>
      </section>
    `;
  }
}

function saveToStorage(key, value) {
  if (!isBrowser || !key) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) {}
}

function readFromStorage(key) {
  if (!isBrowser || !key) return null;
  try { return JSON.parse(localStorage.getItem(key)); } catch (err) { return null; }
}

function removeFromStorage(key) {
  if (!isBrowser || !key) return;
  try { localStorage.removeItem(key); } catch (err) {}
}

function createQrUrl(qrString) {
  if (!qrString) return "";
  return `https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=${encodeURIComponent(qrString)}`;
}

function buildInstructionsHtml(instructions) {
  if (!instructions || !instructions.length) return "";
  const content = instructions
    .map((item) => {
      const steps = (item.steps || []).map((step) => `<li>${step}</li>`).join("");
      return `
        <details class="payment-instruction" open style="margin-bottom:10px; border:1px solid #eee; padding:10px; border-radius:8px;">
          <summary style="font-weight:bold; cursor:pointer;">${item.title || "Panduan pembayaran"}</summary>
          ${steps ? `<ol style="margin-left:20px; margin-top:5px;">${steps}</ol>` : ""}
        </details>
      `;
    })
    .join("");
  return `<div class="payment-instructions">${content}</div>`;
}

function buildEmailHintHtml(data) {
  if (!data) return "";
  const status = (data.ticketEmailStatus || data.ticketEmail?.status || "").toLowerCase();
  const recipient = data.ticketEmailRecipient || data.customer?.email || "";
  if (!status) return "";
  if (status === "sent") return `<p class="form-hint success">E-ticket sudah dikirim ke email ${recipient || "Anda"}.</p>`;
  if (status === "pending") return `<p class="form-hint muted">E-ticket akan otomatis dikirim setelah pembayaran selesai.</p>`;
  if (status === "error") return `<p class="form-hint error">Gagal mengirim e-ticket. Silakan hubungi panitia.</p>`;
  return "";
}

function renderPaymentSuccess(container, data) {
  if (!container) return;
  const normalizedStatus = (data?.status || data?.rawStatus || "paid").toString().toLowerCase();
  const statusText = normalizedStatus ? normalizedStatus.toUpperCase() : "PAID";
  const amount = data.amount ?? data.totalAmount ?? 0;
  const reference = data.reference || data.orderId || data.merchantRef || "";
  const emailHintHtml = buildEmailHintHtml(data);
  container.innerHTML = `
    <div class="payment-info-row" style="align-items:center;">
      <div><span>Status</span><strong style="color:green;">${statusText}</strong></div>
      <div><span>Total</span><strong>${formatCurrency(amount)}</strong></div>
    </div>
    <p class="form-hint success" style="margin-top:10px;">Pembayaran berhasil, e-ticket Anda sudah terkirim.</p>
    ${reference ? `<p class="form-hint">Ref: ${reference}</p>` : ""}
    ${emailHintHtml}
  `;
  container.classList.remove("hidden");
  container.style.display = "block";
}

function startOrderStatusPolling(refValue, onStatus) {
  if (!refValue || typeof onStatus !== "function") return null;
  let cancelled = false;
  let timer = null;

  async function poll() {
    if (cancelled) return;
    try {
      const params = new URLSearchParams();
      params.set("value", refValue);
      const url = `${API_BASE}/payments/status?${params.toString()}`;
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (payload) {
          onStatus(payload);
          const normalized = (payload.status || "").toLowerCase();
          if (["paid", "failed", "expired", "canceled", "refunded"].includes(normalized)) {
            cancelled = true;
            return;
          }
        }
      }
    } catch (err) { console.error("Order status poll error:", err); }
    if (!cancelled) timer = setTimeout(poll, 5000);
  }
  poll();
  return { stop() { cancelled = true; if (timer) clearTimeout(timer); } };
}

function stopExpiryTimer() {
  if (activeExpiryTimer) { clearInterval(activeExpiryTimer); activeExpiryTimer = null; }
}

function setupExpiryCountdown(container, expiresAt, { onExpire } = {}) {
  stopExpiryTimer();
  if (!container || !expiresAt) return;
  const target = new Date(expiresAt).getTime();
  if (!Number.isFinite(target)) return;
  const label = container.querySelector("[data-expiry-countdown]");
  if (!label) return;

  function formatDiff(ms) {
    if (ms <= 0) return "Waktu pembayaran telah habis.";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const h = hours.toString().padStart(2, "0");
    const m = minutes.toString().padStart(2, "0");
    const s = seconds.toString().padStart(2, "0");
    return `Selesaikan sebelum kadaluarsa (${h}:${m}:${s})`;
  }

  function tick() {
    const diff = target - Date.now();
    label.textContent = formatDiff(diff);
    if (diff <= 0) { stopExpiryTimer(); if (typeof onExpire === "function") onExpire(); }
  }
  tick();
  activeExpiryTimer = setInterval(tick, 1000);
}

function renderFeeBreakdown(data) {
  if (!data) return "";
  const base = Number.isFinite(data.baseAmount) ? Number(data.baseAmount) : null;
  const platformTax = Number.isFinite(data.platformTax) ? Number(data.platformTax) : null;
  const tripayFee = Number.isFinite(data.tripayFee) ? Number(data.tripayFee) : null;
  const total = Number.isFinite(data.amount) ? Number(data.amount) : null;
  const hasAny = base !== null || platformTax !== null || tripayFee !== null || total !== null;
  if (!hasAny) return "";
  return `
    <div class="payment-info-row fee-breakdown" style="background:#f9fafb; padding:10px; border-radius:6px; margin:10px 0;">
      ${base !== null ? `<div><span>Harga tiket</span><strong>${formatCurrency(base)}</strong></div>` : ""}
      ${platformTax !== null ? `<div><span>Pajak website (1%)</span><strong>${formatCurrency(platformTax)}</strong></div>` : ""}
      ${tripayFee !== null ? `<div><span>Biaya Tripay</span><strong>${formatCurrency(tripayFee)}</strong></div>` : ""}
      ${total !== null ? `<div style="margin-top:5px; border-top:1px dashed #ccc; padding-top:5px;"><span>Total bayar</span><strong>${formatCurrency(total)}</strong></div>` : ""}
    </div>
  `;
}

function renderPaymentResult(container, data, options = {}) {
  if (!container) return;
  if (!data) {
    stopExpiryTimer();
    container.classList.add("hidden");
    container.style.display = "none";
    return;
  }

  // --- AUTO SCROLL (Agar user lihat tagihan) ---
  container.classList.remove("hidden");
  container.style.display = "block";
  setTimeout(() => {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);

  const statusText = (data.status || data.rawStatus || "").toLowerCase();
  if (statusText === "paid") {
    renderPaymentSuccess(container, data);
    return;
  }

  if (data.paymentType === "free") {
    container.innerHTML = `
      <div class="payment-info-row">
        <div><span>Metode</span><strong>Gratis</strong></div>
        <div><span>Total</span><strong>${formatCurrency(0)}</strong></div>
      </div>
      <p class="form-hint success">Pendaftaran berhasil. E-ticket telah dikirim ke email.</p>
    `;
    return;
  }

  const checkoutLink = data.checkoutUrl
    ? `<a class="btn btn-outline" href="${data.checkoutUrl}" target="_blank" rel="noopener" style="display:block; width:100%; text-align:center; margin-top:10px;">Buka halaman pembayaran</a>`
    : "";
  const referenceText = data.reference || data.orderId || "";
  const isPending = ["pending", "unpaid", ""].includes(statusText);
  const canCancel =
    (data.provider || "").toLowerCase() === "tripay" && isPending && (data.reference || data.orderId);
  const cancelHtml = canCancel
    ? `<div class="payment-info-row" style="align-items:center; gap:12px; flex-wrap:wrap; margin-top:10px;">
        <div><span>Status</span><strong style="color:orange;">${statusText ? statusText.toUpperCase() : "PENDING"}</strong></div>
        <button data-cancel-order style="background:#ef4444;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Batalkan pesanan</button>
      </div><p class="form-hint" data-cancel-status style="font-size:12px;">Tagihan menunggu pembayaran.</p>`
    : `<div class="payment-info-row" style="align-items:center;">
        <div><span>Status</span><strong style="color:orange;">${statusText ? statusText.toUpperCase() : "PENDING"}</strong></div>
      </div>`;

  const emailHintHtml = buildEmailHintHtml(data);

  if (data.paymentType === "bank_transfer") {
    const bank = (data.bank || data.paymentName || "VA").toString().toUpperCase();
    const va = data.vaNumber || data.payCode || data.pay_code || "-";
    const feeBreakdown = renderFeeBreakdown(data);
    container.innerHTML = `
      <div class="payment-info-row" style="margin-bottom:10px;">
        <div><span>Metode</span><strong>VA ${bank}</strong></div>
        <div><span>Total</span><strong>${formatCurrency(data.amount)}</strong></div>
      </div>
      <div class="payment-info-row" style="background:#f1f5f9; padding:15px; border-radius:8px;">
        <div><span style="display:block; font-size:12px; color:#64748b;">Nomor VA</span><strong id="vaNumberText" style="font-size:18px;">${va}</strong></div>
        <button class="copy-btn" data-copy="${va}" style="padding:5px 10px;">Salin</button>
      </div>
      <p class="form-hint">Transfer tepat sesuai nominal.</p>
      ${feeBreakdown}
      ${data.expiresAt ? `<p class="form-hint warning" data-expiry-countdown style="color:red; font-weight:bold;">Waktu pembayaran: memuat...</p>` : ""}
      ${checkoutLink}
      ${buildInstructionsHtml(data.instructions)}
      ${cancelHtml}
      ${emailHintHtml}
    `;
  } else {
    const qrUrl = data.qrUrl || createQrUrl(data.qrString) || "";
    const feeBreakdown = renderFeeBreakdown(data);
    container.innerHTML = `
      <div class="qr-preview" style="text-align:center; margin-bottom:15px;">
        ${qrUrl ? `<img src="${qrUrl}" alt="QRIS" style="max-width:200px; border:1px solid #ddd; padding:5px; border-radius:8px;">` : ""}
        <div style="font-size:18px; font-weight:bold; margin-top:10px;">${formatCurrency(data.amount)}</div>
        <p>Pindai QRIS menggunakan mobile banking / e-wallet.</p>
      </div>
      ${feeBreakdown}
      ${checkoutLink}
      ${data.expiresAt ? `<p class="form-hint warning" data-expiry-countdown style="color:red; font-weight:bold;">Waktu pembayaran: memuat...</p>` : ""}
      ${buildInstructionsHtml(data.instructions)}
      ${cancelHtml}
      ${emailHintHtml}
    `;
  }

  container.classList.remove("hidden");
  if (["pending", "unpaid", ""].includes(statusText) && data.expiresAt) {
    setupExpiryCountdown(container, data.expiresAt, { onExpire: options.onExpire });
  } else stopExpiryTimer();

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || "");
        btn.textContent = "Disalin";
        setTimeout(() => (btn.textContent = "Salin"), 2000);
      } catch (err) {}
    });
  });

  const cancelBtn = container.querySelector("[data-cancel-order]");
  const cancelStatus = container.querySelector("[data-cancel-status]");
  if (cancelBtn && (data.reference || data.orderId)) {
    cancelBtn.addEventListener("click", async () => {
      cancelBtn.disabled = true;
      if (cancelStatus) cancelStatus.textContent = "Membatalkan pesanan...";
      try {
        const resp = await fetch(`${API_BASE}/payments/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: data.reference || data.orderId,
            merchantRef: data.orderId || data.merchantRef,
            orderId: data.orderId || data.merchantRef,
            requestedBy: "user",
          }),
        });
        if (!resp.ok) throw new Error("Gagal membatalkan.");
        const result = await resp.json();
        container.innerHTML = `<p class="form-hint success">Pesanan dibatalkan. Status: ${(result.status || "canceled").toUpperCase()}.</p>`;
      } catch (err) {
        if (cancelStatus) cancelStatus.textContent = err.message || "Gagal membatalkan.";
        cancelBtn.disabled = false;
      }
    });
  }
}

function initPaymentForm(event) {
  const form = document.getElementById("paymentForm");
  const methodButtons = document.querySelectorAll(".method-btn");
  const resultBox = document.getElementById("paymentResult");
  const payBtn = document.getElementById("payNowBtn");
  const methodGrid = document.querySelector(".method-grid");
  const ticketTypeInput = form?.querySelector('input[name="ticketType"]');
  const ticketRegularBtn = document.getElementById("ticketRegularBtn");
  const ticketVipBtn = document.getElementById("ticketVipBtn");
  const priceRegularLabel = document.getElementById("priceRegularLabel");
  const priceVipLabel = document.getElementById("priceVipLabel");
  const nameInput = form?.querySelector('input[name="name"]');
  const emailInput = form?.querySelector('input[name="email"]');
  const phoneInput = form?.querySelector('input[name="phone"]');
  
  const quotaRegular = Number(event.quotaRegular || 0);
  const quotaVip = Number(event.quotaVip || 0);
  const seatsUsedRegular = Number(event.seatsUsedRegular || 0);
  const seatsUsedVip = Number(event.seatsUsedVip || 0);
  const soldOutRegular = quotaRegular > 0 && seatsUsedRegular >= quotaRegular;
  const soldOutVip = quotaVip > 0 && seatsUsedVip >= quotaVip;

  const formStorageKey = `${FORM_KEY_PREFIX}${event.id}`;
  const orderStorageKey = `${ORDER_KEY_PREFIX}${event.id}`;

  if (!form) return;

  const priceRegular = Number(event.priceRegular || 0);
  const priceVip = event.priceVip != null ? Number(event.priceVip) : null;
  const savedForm = readFromStorage(formStorageKey) || {};
  let selectedTicket = savedForm.ticketType || (priceRegular ? "regular" : priceVip ? "vip" : "regular");
  let method = savedForm.method || "qris";
  let bank = savedForm.bank || null;

  function setHint(message, variant = "info") {
     const hint = document.getElementById("paymentHint");
     if (!hint) return;
     hint.textContent = message;
     hint.classList.remove("error", "success", "warning");
     if (variant !== "info") hint.classList.add(variant);
  }

  function saveFormState() {
    saveToStorage(formStorageKey, {
      name: nameInput?.value || "",
      email: emailInput?.value || "",
      phone: phoneInput?.value || "",
      ticketType: selectedTicket,
      method,
      bank,
    });
  }

  function loadPendingOrder() { return readFromStorage(orderStorageKey); }
  function savePendingOrder(orderData) { if (orderData) saveToStorage(orderStorageKey, orderData); }
  function clearPendingOrder() { removeFromStorage(orderStorageKey); }

  if (nameInput && savedForm.name) nameInput.value = savedForm.name;
  if (emailInput && savedForm.email) emailInput.value = savedForm.email;
  if (phoneInput && savedForm.phone) phoneInput.value = savedForm.phone;

  function updateTicketSelection(type) {
    if ((type === "vip" && soldOutVip) || (type !== "vip" && soldOutRegular)) {
      alert("Tiket habis.");
      return;
    }
    selectedTicket = type === "vip" ? "vip" : "regular";
    const selectedPrice = selectedTicket === "vip" ? priceVip || priceRegular || 0 : priceRegular || 0;
    if (ticketTypeInput) ticketTypeInput.value = selectedTicket;
    
    ticketRegularBtn?.classList.toggle("active", selectedTicket === "regular");
    ticketVipBtn?.classList.toggle("active", selectedTicket === "vip");

    const isFree = selectedPrice <= 0;
    const priceDisplay = document.getElementById("eventPrice");
    if(priceDisplay) priceDisplay.textContent = isFree ? "Gratis" : formatCurrency(selectedPrice);

    if (isFree) {
      method = "free"; bank = null;
      if(methodGrid) methodGrid.classList.add("hidden");
      payBtn.textContent = "Kirim E-Ticket";
    } else {
      if(methodGrid) methodGrid.classList.remove("hidden");
      payBtn.textContent = "Buat Tagihan";
    }
    saveFormState();
  }

  if (priceRegularLabel) priceRegularLabel.textContent = priceRegular ? formatCurrency(priceRegular) : "Gratis";
  if (priceVipLabel) priceVipLabel.textContent = priceVip ? formatCurrency(priceVip) : "N/A";
  
  if (soldOutRegular) ticketRegularBtn?.classList.add("sold-out");
  if (soldOutVip) ticketVipBtn?.classList.add("sold-out");

  ticketRegularBtn?.addEventListener("click", () => updateTicketSelection("regular"));
  ticketVipBtn?.addEventListener("click", () => updateTicketSelection("vip"));
  updateTicketSelection(selectedTicket);

  methodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      methodButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const chosen = btn.dataset.method;
      method = chosen === "va" ? "bank_transfer" : "qris";
      bank = chosen === "va" ? btn.dataset.bank || null : null;
      saveFormState();
    });
  });

  [nameInput, emailInput, phoneInput].forEach((el) => {
    el?.addEventListener("input", () => saveFormState());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    const originalText = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = "Memproses...";
    resultBox?.classList.add("hidden");

    const formData = new FormData(form);
    const email = formData.get("email")?.toString().trim() || "";
    if(!email.includes("@")) {
        alert("Email tidak valid!");
        payBtn.disabled = false;
        payBtn.textContent = originalText;
        return;
    }
    const isFree = (selectedTicket === "vip" ? priceVip : priceRegular) <= 0;

    const payload = {
      eventId: event.id,
      paymentType: isFree ? "free" : method,
      bank: isFree ? null : method === "bank_transfer" ? bank || "bca" : null,
      ticketType: selectedTicket,
      customer: {
        name: formData.get("name")?.toString() || "",
        email,
        phone: formData.get("phone")?.toString() || "",
      },
    };

    try {
      const response = await fetch(`${API_BASE}/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Gagal membuat tagihan.");
      }

      const data = await response.json();
      if (isFree) clearPendingOrder(); else savePendingOrder(data);
      renderPaymentResult(resultBox, data);

      if (!isFree && data.checkoutUrl) window.open(data.checkoutUrl, "_blank", "noopener");

    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan: " + err.message);
    } finally {
      payBtn.disabled = false;
      payBtn.textContent = originalText;
    }
  });

  const cached = loadPendingOrder();
  if (cached && cached.status !== "paid") {
      renderPaymentResult(resultBox, cached);
  }
}

async function fetchEventBySlug(slug) {
  if (!slug) return null;
  try {
    const snap = await getDoc(doc(db, "events", slug));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (err) { console.error(err); }
  const fallback = EVENT_SEED_DATA.find((e) => e.slug === slug);
  return fallback ? { id: fallback.slug, ...fallback } : null;
}

function normalizeEvent(raw, slug) {
  if(!raw) return null;
  return {
    id: slug || raw.id,
    slug: raw.slug || slug,
    title: raw.title || "Event",
    tagline: raw.tagline || "",
    category: raw.category || "Event",
    chipClass: raw.chipClass || "chip-green",
    imageUrl: raw.imageUrl || "./assets/img/event-1.jpg",
    schedule: raw.schedule || "",
    time: raw.time || "",
    location: raw.location || "",
    priceRegular: Number(raw.priceRegular ?? raw.amount ?? 0),
    priceVip: raw.priceVip != null ? Number(raw.priceVip) : null,
    priceLabel: raw.priceLabel || null,
    description: raw.description || "",
    highlights: raw.highlights || [],
    agenda: raw.agenda || [],
    notes: raw.notes || [],
    preparation: raw.preparation || [],
    contact: raw.contact || null,
    quotaRegular: raw.quotaRegular,
    quotaVip: raw.quotaVip,
    seatsUsedRegular: raw.seatsUsedRegular,
    seatsUsedVip: raw.seatsUsedVip
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  updateFooterYear();
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("event") || "teka-teki-takdir";
  const data = await fetchEventBySlug(slug);
  const event = normalizeEvent(data, slug);
  if (!event) { renderNotFound(); return; }
  renderEvent(event);
});