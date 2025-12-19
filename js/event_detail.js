// js/event_detail.js (FULL ORIGINAL RESTORED)

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth // Kita perlu getAuth disini untuk cek status login manual jika perlu
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

// --- RESTORE: INISIALISASI DATABASE SEPERTI AWAL (AGAR KONTEN MUNCUL) ---
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // Inisialisasi Auth lokal

// ==== FIX: API URL AGAR TIDAK MACET DI VERCEL ====
const PROD_FUNCTION_BASE = "https://ketenangan-jiwa.vercel.app/api"; 
const LOCAL_FUNCTION_BASE = "http://localhost:5001/pengajian-online/us-central1/api";
const isBrowser = typeof window !== "undefined";

let API_BASE;
if (isBrowser && window.__API_BASE_URL__) {
    API_BASE = window.__API_BASE_URL__;
} else {
    API_BASE = !isBrowser
      ? PROD_FUNCTION_BASE
      : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? LOCAL_FUNCTION_BASE
      : "/api";
}

let activeOrderStatusPoll = null;
let activeExpiryTimer = null;

const FORM_KEY_PREFIX = "kj-payment-form-";
const ORDER_KEY_PREFIX = "kj-payment-order-";

// =========================================================
// BAGIAN INI ADALAH FUNGSI RENDER ASLI (TIDAK DIUBAH)
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
    if(block) block.style.display = 'none'; // Tambahan safety
    return;
  }
  block?.classList.remove("is-hidden");
  if(block) block.style.display = 'block'; // Tambahan safety

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
  const hero = document.querySelector(".event-hero");
  if(hero) hero.style.setProperty("--hero-image", "url('./assets/img/event-1.jpg')");
  setText("eventCategory", "Event");
  setText("eventTitle", "Event tidak ditemukan");
  setText("eventTagline", "Silakan kembali ke halaman utama untuk melihat jadwal terbaru.");
  document.getElementById("eventRegisterHero")?.setAttribute("href", "index.html#event");
}

function saveToStorage(key, value) {
  if (!isBrowser || !key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("saveToStorage error:", err?.message || err);
  }
}

function readFromStorage(key) {
  if (!isBrowser || !key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("readFromStorage error:", err?.message || err);
    return null;
  }
}

function removeFromStorage(key) {
  if (!isBrowser || !key) return;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn("removeFromStorage error:", err?.message || err);
  }
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

  if (status === "sent") {
    return `<p class="form-hint success">E-ticket sudah dikirim ke email ${recipient || "Anda"}.</p>`;
  }
  if (status === "pending") {
    return `<p class="form-hint muted">E-ticket akan otomatis dikirim setelah pembayaran selesai.</p>`;
  }
  if (status === "error") {
    return `<p class="form-hint error">Gagal mengirim e-ticket. Silakan hubungi panitia.</p>`;
  }
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
      <div>
        <span>Status</span>
        <strong style="color:green;">${statusText}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>${formatCurrency(amount)}</strong>
      </div>
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
    } catch (err) {
      console.error("Order status poll error:", err);
    }
    if (!cancelled) {
      timer = setTimeout(poll, 5000);
    }
  }

  poll();

  return {
    stop() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function stopExpiryTimer() {
  if (activeExpiryTimer) {
    clearInterval(activeExpiryTimer);
    activeExpiryTimer = null;
  }
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
    if (diff <= 0) {
      stopExpiryTimer();
      if (typeof onExpire === "function") onExpire();
    }
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

  // --- FIX: AUTO SCROLL (AGAR USER MELIHAT TAGIHAN) ---
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
        <div>
          <span>Metode</span>
          <strong>Gratis</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${formatCurrency(0)}</strong>
        </div>
      </div>
      <p class="form-hint success">Pendaftaran berhasil. E-ticket telah dikirim ke email.</p>
      ${data.reference ? `<p class="form-hint">Ref: ${data.reference}</p>` : ""}
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
    ? `
      <div class="payment-info-row" style="align-items:center; gap:12px; flex-wrap:wrap; margin-top:10px;">
        <div>
          <span>Status</span>
          <strong style="color:orange;">${statusText ? statusText.toUpperCase() : "PENDING"}</strong>
        </div>
        <button data-cancel-order style="background:#ef4444;color:white;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Batalkan pesanan</button>
      </div>
      <p class="form-hint" data-cancel-status style="font-size:12px;">Tagihan menunggu pembayaran. Klik batalkan jika ingin mengganti metode.</p>
    `
    : `
      <div class="payment-info-row" style="align-items:center;">
        <div>
          <span>Status</span>
          <strong style="color:orange;">${statusText ? statusText.toUpperCase() : "PENDING"}</strong>
        </div>
      </div>
      ${
        isPending
          ? '<p class="form-hint">Tagihan menunggu pembayaran. Hubungi panitia jika perlu mengganti metode.</p>'
          : ""
      }
    `;

  const emailHintHtml = buildEmailHintHtml(data);

  if (data.paymentType === "bank_transfer") {
    const bank = (data.bank || data.paymentName || "VA").toString().toUpperCase();
    const va = data.vaNumber || data.payCode || data.pay_code || "-";
    const feeBreakdown = renderFeeBreakdown(data);
    container.innerHTML = `
      <div class="payment-info-row" style="margin-bottom:10px;">
        <div>
          <span>Metode</span>
          <strong>VA ${bank}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${formatCurrency(data.amount)}</strong>
        </div>
      </div>
      <div class="payment-info-row" style="background:#f1f5f9; padding:15px; border-radius:8px;">
        <div>
          <span style="display:block; font-size:12px; color:#64748b;">Nomor VA</span>
          <strong id="vaNumberText" style="font-size:18px;">${va}</strong>
        </div>
        <button class="copy-btn" data-copy="${va}" style="padding:5px 10px;">Salin</button>
      </div>
      <p class="form-hint">Transfer tepat sesuai nominal. Tagihan akan diverifikasi otomatis setelah pembayaran berhasil.</p>
      ${feeBreakdown}
      ${
        data.expiresAt
          ? `<p class="form-hint warning" data-expiry-countdown style="color:red; font-weight:bold;">Waktu pembayaran: memuat...</p>`
          : ""
      }
      ${checkoutLink}
      ${referenceText ? `<p class="form-hint" style="font-size:11px; color:#999;">Ref: ${referenceText}</p>` : ""}
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
      ${referenceText ? `<p class="form-hint" style="font-size:11px; color:#999;">Ref: ${referenceText}</p>` : ""}
      ${
        data.expiresAt
          ? `<p class="form-hint warning" data-expiry-countdown style="color:red; font-weight:bold;">Waktu pembayaran: memuat...</p>`
          : ""
      }
      ${buildInstructionsHtml(data.instructions)}
      ${cancelHtml}
      ${emailHintHtml}
    `;
  }

  container.classList.remove("hidden");
  const terminalStatuses = ["paid", "failed", "expired", "canceled", "refunded"];
  if (terminalStatuses.includes(statusText) && typeof options.onTerminalStatus === "function") {
    options.onTerminalStatus(statusText);
  }

  if (["pending", "unpaid", ""].includes(statusText) && data.expiresAt) {
    setupExpiryCountdown(container, data.expiresAt, { onExpire: options.onExpire });
  } else {
    stopExpiryTimer();
  }

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || "");
        btn.textContent = "Disalin";
        setTimeout(() => (btn.textContent = "Salin"), 2000);
      } catch (err) {
        console.error(err);
      }
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
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Gagal membatalkan pesanan.");
        }
        const result = await resp.json();
        const warning = result.tripayWarning
          ? `<p class="form-hint warning">${result.tripayWarning}</p>`
          : "";
        container.innerHTML = `
          <p class="form-hint success">Pesanan dibatalkan. Status: ${(result.status || "canceled").toUpperCase()}.</p>
          ${warning}
          <p class="form-hint">Buat tagihan baru jika ingin mengganti metode pembayaran.</p>
        `;
      } catch (err) {
        console.error(err);
        if (cancelStatus) cancelStatus.textContent = err.message || "Gagal membatalkan pesanan.";
        cancelBtn.disabled = false;
      }
    });
  }
}

function initPaymentForm(event) {
  const form = document.getElementById("paymentForm");
  const methodButtons = document.querySelectorAll(".method-btn");
  const resultBox = document.getElementById("paymentResult");
  const hint = document.getElementById("paymentHint");
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
  if (soldOutRegular && !soldOutVip && priceVip) selectedTicket = "vip";
  if (soldOutRegular && soldOutVip) selectedTicket = "regular";
  let selectedPrice = selectedTicket === "vip" ? priceVip || priceRegular || 0 : priceRegular || 0;
  let method = savedForm.method || "qris";
  let bank = savedForm.bank || null;
  const defaultPayLabel = selectedPrice > 0 ? "Buat Tagihan" : "Kirim E-Ticket";

  function setHint(message, variant = "info") {
    if (!hint) return;
    hint.textContent = message;
    hint.classList.remove("error", "success", "warning");
    if (variant !== "info") hint.classList.add(variant);
  }

  function setPayLabel(label) {
    if (payBtn) payBtn.textContent = label;
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

  function loadPendingOrder() {
    return readFromStorage(orderStorageKey);
  }

  function savePendingOrder(orderData) {
    if (!orderData) return;
    saveToStorage(orderStorageKey, orderData);
  }

  function clearPendingOrder() {
    removeFromStorage(orderStorageKey);
  }

  if (nameInput && savedForm.name) nameInput.value = savedForm.name;
  if (emailInput && savedForm.email) emailInput.value = savedForm.email;
  if (phoneInput && savedForm.phone) phoneInput.value = savedForm.phone;

  function updateTicketSelection(type) {
    if ((type === "vip" && soldOutVip) || (type !== "vip" && soldOutRegular)) {
      setHint("Tiket yang dipilih sudah habis. Pilih tipe lain.", "warning");
      return;
    }
    selectedTicket = type === "vip" ? "vip" : "regular";
    selectedPrice = selectedTicket === "vip" ? priceVip || priceRegular || 0 : priceRegular || 0;
    
    // UPDATE HIDDEN INPUT (Agar form HTML juga update)
    if(ticketTypeInput) ticketTypeInput.value = selectedTicket;
    
    ticketRegularBtn?.classList.toggle("active", selectedTicket === "regular");
    ticketVipBtn?.classList.toggle("active", selectedTicket === "vip");

    const isFree = selectedPrice <= 0;
    if (isFree) {
      method = "free";
      bank = null;
      if(methodGrid) methodGrid.classList.add("hidden");
      methodButtons.forEach((btn) => {
        btn.setAttribute("disabled", "true");
        btn.classList.remove("active");
      });
      setPayLabel("Kirim E-Ticket");
      setHint("Event gratis, e-ticket akan dikirim otomatis tanpa pembayaran.", "success");
    } else {
      if(methodGrid) methodGrid.classList.remove("hidden");
      methodButtons.forEach((btn) => btn.removeAttribute("disabled"));
      if (!method || method === "free") method = "qris";
      setPayLabel(defaultPayLabel);
      setHint("Silakan isi data peserta dengan email Gmail lalu pilih metode pembayaran.");
    }

    const priceDisplay = document.getElementById("eventPrice");
    if (priceDisplay) {
      if (priceVip) {
        priceDisplay.textContent = selectedTicket === "vip" ? formatCurrency(priceVip) : formatCurrency(priceRegular);
      } else {
        priceDisplay.textContent = selectedPrice ? formatCurrency(selectedPrice) : "Gratis";
      }
    }
    saveFormState();
  }

  if (priceRegularLabel) priceRegularLabel.textContent = priceRegular ? formatCurrency(priceRegular) : "Gratis";
  if (priceVipLabel) {
    if (priceVip) {
      priceVipLabel.textContent = formatCurrency(priceVip);
      ticketVipBtn?.classList.remove("hidden");
      ticketVipBtn?.removeAttribute("disabled");
    } else {
      priceVipLabel.textContent = "N/A";
      ticketVipBtn?.setAttribute("disabled", "true");
      ticketVipBtn?.classList.add("hidden");
    }
  }
  if (soldOutRegular) {
    ticketRegularBtn?.setAttribute("disabled", "true");
    ticketRegularBtn?.classList.add("sold-out");
    ticketRegularBtn.querySelector("span")?.classList.add("muted");
    ticketRegularBtn.textContent = "Reguler Sold Out";
  }
  if (soldOutVip) {
    ticketVipBtn?.setAttribute("disabled", "true");
    ticketVipBtn?.classList.add("sold-out");
    ticketVipBtn.querySelector("span")?.classList.add("muted");
    ticketVipBtn.textContent = "VIP Sold Out";
  }
  ticketRegularBtn?.addEventListener("click", () => updateTicketSelection("regular"));
  ticketVipBtn?.addEventListener("click", () => updateTicketSelection("vip"));
  updateTicketSelection(selectedTicket);
  if (soldOutRegular && soldOutVip) {
    setHint("Semua tiket sudah habis.", "warning");
    payBtn.disabled = true;
    methodButtons.forEach((btn) => btn.setAttribute("disabled", "true"));
  }

  function selectMethodButton(preferredMethod, preferredBank) {
    if (!methodButtons || !methodButtons.length) return;
    if (preferredMethod === "bank_transfer") {
      const target =
        Array.from(methodButtons).find(
          (btn) => btn.dataset.method === "va" && (!preferredBank || btn.dataset.bank === preferredBank),
        ) || null;
      if (target) {
        target.click();
        return;
      }
    }
    if (preferredMethod === "qris") {
      const target = Array.from(methodButtons).find((btn) => btn.dataset.method === "qris");
      if (target) {
        target.click();
        return;
      }
    }
    methodButtons[0]?.click();
  }

  methodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.dataset.method;
      method = chosen === "va" ? "bank_transfer" : "qris";
      bank = chosen === "va" ? btn.dataset.bank || null : null;
      methodButtons.forEach((b) => b.classList.toggle("active", b === btn));
      
      // Update hidden input agar form HTML tau (opsional tapi aman)
      const hiddenMethod = document.getElementById('paymentMethodInput');
      if(hiddenMethod) hiddenMethod.value = method + (bank ? '_' + bank : '');

      setHint(
        method === "bank_transfer"
          ? `Gunakan virtual account ${(bank || "bca").toUpperCase()} untuk pembayaran.`
          : "QRIS bisa dibayar lewat mobile banking atau e-wallet yang mendukung.",
      );
      saveFormState();
    });
  });
  if (selectedPrice > 0) {
    selectMethodButton(method, bank);
  }

  [nameInput, emailInput, phoneInput].forEach((el) => {
    el?.addEventListener("input", () => saveFormState());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (selectedTicket === "vip" && soldOutVip) {
      setHint("Tiket VIP sudah habis.", "error");
      return;
    }
    if (selectedTicket !== "vip" && soldOutRegular) {
      setHint("Tiket Reguler sudah habis.", "error");
      return;
    }

    resultBox?.classList.add("hidden");
    resultBox.style.display = 'none'; // Tambahan safety
    const isFree = selectedPrice <= 0;
    setHint(isFree ? "Memproses e-ticket gratis..." : "Membuat tagihan pembayaran...", "info");
    payBtn.disabled = true;
    setPayLabel("Memproses...");

    const formData = new FormData(form);
    const email = formData.get("email")?.toString().trim() || "";
    if (!/@gmail\.com$/i.test(email)) {
      setHint("Email harus menggunakan Gmail (contoh: nama@gmail.com).", "error");
      alert("Harap gunakan email Gmail (contoh@gmail.com)");
      payBtn.disabled = false;
      setPayLabel(defaultPayLabel);
      return;
    }

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
      console.log("Sending payload to:", `${API_BASE}/payments/create`);
      const response = await fetch(`${API_BASE}/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Gagal membuat pembayaran.");
      }

      const data = await response.json();
      if (isFree) {
        clearPendingOrder();
      } else {
        savePendingOrder(data);
      }
      renderPaymentResult(resultBox, data, {
        onExpire: () => {
          setHint("Waktu pembayaran sudah kadaluarsa. Buat tagihan baru untuk melanjutkan.", "warning");
          clearPendingOrder();
        },
        onTerminalStatus: (statusValue) => {
          if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue)) {
            clearPendingOrder();
          }
        },
      });
      setHint(
        isFree
          ? "E-ticket berhasil dikirim ke email. Cek inbox/spam."
          : "Tagihan berhasil dibuat. Mengarahkan ke halaman pembayaran Tripay...",
        "success",
      );
      if (!isFree && data.checkoutUrl) {
        // Buka halaman pembayaran Tripay di tab baru supaya user langsung ke template Tripay
        window.open(data.checkoutUrl, "_blank", "noopener");
      }
      const normalizedInitialStatus = (data.status || data.rawStatus || "").toLowerCase();
      if (!isFree && normalizedInitialStatus !== "paid") {
        const orderKey = data.orderId || data.merchantRef || data.reference;
        if (orderKey) {
          activeOrderStatusPoll?.stop();
          const handleStatusUpdate = (statusPayload) => {
            if (!statusPayload) return;
            const statusValue = (statusPayload.status || "").toLowerCase();
            if (!statusValue) return;
            const mergedData = {
              ...data,
              ...statusPayload,
              ticketEmailStatus:
                statusPayload.ticketEmailStatus ||
                statusPayload.ticketEmail?.status ||
                data.ticketEmailStatus,
              ticketEmailRecipient:
                statusPayload.ticketEmailRecipient ||
                statusPayload.ticketEmail?.recipient ||
                data.ticketEmailRecipient,
            };
            renderPaymentResult(resultBox, mergedData, {
              onExpire: () => {
                setHint("Waktu pembayaran sudah kadaluarsa. Buat tagihan baru untuk melanjutkan.", "warning");
                clearPendingOrder();
              },
              onTerminalStatus: (statusValue2) => {
                if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue2)) {
                  clearPendingOrder();
                }
              },
            });
            savePendingOrder(mergedData);
            if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue)) {
              activeOrderStatusPoll?.stop();
              setHint(
                statusValue === "paid"
                  ? "Pembayaran berhasil, e-ticket Anda sudah terkirim."
                  : `Status pembayaran: ${statusValue.toUpperCase()}`,
                statusValue === "paid" ? "success" : "warning",
              );
            }
          };
          activeOrderStatusPoll = startOrderStatusPolling(orderKey, handleStatusUpdate);
        }
      }
    } catch (err) {
      console.error(err);
      setHint(err.message || "Gagal memproses pembayaran.", "error");
      alert("Terjadi kesalahan: " + err.message);
      renderPaymentResult(resultBox, null);
    } finally {
      payBtn.disabled = false;
      setPayLabel(defaultPayLabel);
    }
  });

  // Pulihkan tagihan yang masih pending setelah refresh
  const cachedOrder = loadPendingOrder();
  if (
    cachedOrder &&
    cachedOrder.status !== "paid" &&
    (cachedOrder.status || cachedOrder.reference || cachedOrder.orderId || cachedOrder.merchantRef)
  ) {
    renderPaymentResult(resultBox, cachedOrder, {
      onExpire: () => {
        setHint("Waktu pembayaran sudah kadaluarsa. Buat tagihan baru untuk melanjutkan.", "warning");
        clearPendingOrder();
      },
      onTerminalStatus: (statusValue) => {
        if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue)) {
          clearPendingOrder();
        }
      },
    });
    const orderKey = cachedOrder.orderId || cachedOrder.merchantRef || cachedOrder.reference;
    if (orderKey) {
      activeOrderStatusPoll?.stop();
      const handleStatusUpdate = (statusPayload) => {
        if (!statusPayload) return;
        const statusValue = (statusPayload.status || "").toLowerCase();
        if (!statusValue) return;
        const mergedData = {
          ...cachedOrder,
          ...statusPayload,
          ticketEmailStatus:
            statusPayload.ticketEmailStatus ||
            statusPayload.ticketEmail?.status ||
            cachedOrder.ticketEmailStatus,
          ticketEmailRecipient:
            statusPayload.ticketEmailRecipient ||
            statusPayload.ticketEmail?.recipient ||
            cachedOrder.ticketEmailRecipient,
        };
        renderPaymentResult(resultBox, mergedData, {
          onExpire: () => {
            setHint("Waktu pembayaran sudah kadaluarsa. Buat tagihan baru untuk melanjutkan.", "warning");
            clearPendingOrder();
          },
          onTerminalStatus: (statusValue2) => {
            if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue2)) {
              clearPendingOrder();
            }
          },
        });
        savePendingOrder(mergedData);
        if (["paid", "failed", "expired", "canceled", "refunded"].includes(statusValue)) {
          activeOrderStatusPoll?.stop();
          clearPendingOrder();
          setHint(
            statusValue === "paid"
              ? "Pembayaran berhasil, e-ticket Anda sudah terkirim."
              : `Status pembayaran: ${statusValue.toUpperCase()}`,
            statusValue === "paid" ? "success" : "warning",
          );
        }
      };
      activeOrderStatusPoll = startOrderStatusPolling(orderKey, handleStatusUpdate);
    }
  }
}


async function fetchEventBySlug(slug) {
  if (!slug) return null;
  try {
    const snap = await getDoc(doc(db, "events", slug));
    if (snap.exists()) {
      const data = snap.data();
      if (data.status && data.status !== "published") return null;
      return { id: snap.id, ...data };
    }
  } catch (err) {
    console.error("Fetch event error:", err);
  }
  const fallback = EVENT_SEED_DATA.find((e) => e.slug === slug);
  return fallback ? { id: fallback.slug, ...fallback } : null;
}

function normalizeEvent(raw, slug) {
  if (!raw) return null;
  return {
    id: slug || raw.id,
    slug: raw.slug || slug,
    title: raw.title || "Event",
    tagline: raw.tagline || raw.description || "",
    category: raw.category || "Event",
    chipClass: raw.chipClass || "chip-green",
    imageUrl: raw.imageUrl || raw.image || "./assets/img/event-1.jpg",
    schedule: raw.schedule || "",
    time: raw.time || "",
    location: raw.location || "",
    address: raw.address || "",
    speaker: raw.speaker || "",
    priceRegular: Number(raw.priceRegular ?? raw.amount ?? 0) || 0,
    priceVip: raw.priceVip != null ? Number(raw.priceVip) : null,
    priceLabel: raw.priceLabel || (Number(raw.priceRegular ?? raw.amount) ? null : "Gratis"),
    description: raw.description || "",
    highlights: raw.highlights || [],
    agenda: raw.agenda || [],
    notes: raw.notes || [],
    preparation: raw.preparation || [],
    contact: raw.contact || null,
    capacity: raw.capacity ?? null,
    seatsUsed: raw.seatsUsed ?? null,
    quotaRegular: raw.quotaRegular ?? null,
    quotaVip: raw.quotaVip ?? null,
    seatsUsedRegular: raw.seatsUsedRegular ?? null,
    seatsUsedVip: raw.seatsUsedVip ?? null,
  };
}

function renderEvent(event) {
  if (!event) return renderNotFound();

  document.title = `${event.title} | ketenangan jiwa`;

  const hero = document.querySelector(".event-hero");
  if(hero) hero.style.setProperty("--hero-image", `url('${event.imageUrl}')`);

  const category = document.getElementById("eventCategory");
  if (category) {
    category.textContent = event.category;
    category.classList.add(event.chipClass || "chip-green");
  }

  setText("eventTitle", event.title);
  setText("eventTagline", event.tagline);
  setText("eventDate", `${event.schedule} - ${event.time}`);
  setText("eventLocation", event.location);
  setText("eventSpeaker", event.speaker);
  setText("eventDescription", event.description);
  const priceRegular = Number(event.priceRegular || 0);
  const priceVip = event.priceVip != null ? Number(event.priceVip) : null;
  let priceText = priceRegular ? formatCurrency(priceRegular) : event.priceLabel || "Gratis";
  if (priceVip) {
    priceText = `Reg: ${formatCurrency(priceRegular)} / VIP: ${formatCurrency(priceVip)}`;
  }
  setText("eventPrice", priceText);
  setText("eventTime", event.time);
  setText("eventAddress", event.address);

  const quotaEl = document.getElementById("quotaInfo");
  if (quotaEl) {
    quotaEl.innerHTML = "";
    quotaEl.classList.add("hidden");
  }

  renderList("eventHighlights", event.highlights);
  renderList("eventAgenda", event.agenda, renderAgendaItem);
  renderList("eventNotes", event.notes);
  renderList("eventPreparation", event.preparation);
  renderContact("eventContact", event.contact);

  document.getElementById("eventRegisterHero")?.setAttribute("href", "#paymentSection");
  initPaymentForm(event);
}

function updateFooterYear() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", async () => {
  updateFooterYear();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("event"); // HAPUS FALLBACK AGAR TIDAK LOAD DEFAULT JIKA URL KOSONG
  if (!slug) {
    renderNotFound();
    return;
  }

  const data = await fetchEventBySlug(slug);
  const event = normalizeEvent(data, slug);
  if (!event) {
    renderNotFound();
    return;
  }

  renderEvent(event);
});