// js/event_detail.js (FIXED: Connected to auth.js & HTML)

// 1. IMPORT DARI AUTH.JS AGAR KONEKSI NYAMBUNG
import { db, auth } from "./auth.js"; 
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { EVENT_SEED_DATA } from "./events_seed_data.js"; // Pastikan file ini ada

// Base URL API (Tetap gunakan yang lama)
const PROD_FUNCTION_BASE = "https://www.ketenanganjiwa.id/api";
const LOCAL_FUNCTION_BASE = "http://localhost:5001/pengajian-online/us-central1/api";
const isBrowser = typeof window !== "undefined";

const API_BASE = !isBrowser
  ? PROD_FUNCTION_BASE
  : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? LOCAL_FUNCTION_BASE
  : "/api";

let activeOrderStatusPoll = null;
let activeExpiryTimer = null;

const FORM_KEY_PREFIX = "kj-payment-form-";
const ORDER_KEY_PREFIX = "kj-payment-order-";

// --- UTILITY FUNCTIONS ---

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
    block?.classList.add("is-hidden"); // Sesuaikan class CSS Anda jika perlu
    if(block) block.style.display = 'none'; // Fallback hide
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

// --- STORAGE HELPERS ---

function saveToStorage(key, value) {
  if (!isBrowser || !key) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function readFromStorage(key) {
  if (!isBrowser || !key) return null;
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function removeFromStorage(key) {
  if (!isBrowser || !key) return;
  try { localStorage.removeItem(key); } catch (e) {}
}

// --- PAYMENT RENDERING ---

function createQrUrl(qrString) {
  if (!qrString) return "";
  return `https://chart.googleapis.com/chart?chs=320x320&cht=qr&chl=${encodeURIComponent(qrString)}`;
}

function buildInstructionsHtml(instructions) {
  if (!instructions || !instructions.length) return "";
  return `<div class="payment-instructions" style="margin-top:15px;">
    ${instructions.map(item => `
      <details style="margin-bottom:8px; border:1px solid #eee; padding:8px; border-radius:6px;">
        <summary style="cursor:pointer; font-weight:600;">${item.title || "Panduan"}</summary>
        <ol style="margin-left:20px; margin-top:5px;">${(item.steps||[]).map(s=>`<li>${s}</li>`).join('')}</ol>
      </details>
    `).join('')}
  </div>`;
}

function renderFeeBreakdown(data) {
  if (!data) return "";
  const total = Number(data.amount) || 0;
  return `<div style="margin-top:10px; padding:10px; background:#f9fafb; border-radius:6px; font-size:13px;">
    <div style="display:flex; justify-content:space-between;"><span>Total Bayar</span><strong>${formatCurrency(total)}</strong></div>
  </div>`;
}

// FUNGSI UTAMA RENDER HASIL PEMBAYARAN
function renderPaymentResult(container, data, options = {}) {
  if (!container) return;
  if (!data) {
    stopExpiryTimer();
    container.classList.add("hidden");
    container.style.display = 'none';
    return;
  }

  container.classList.remove("hidden");
  container.style.display = 'block';

  // Scroll otomatis ke hasil pembayaran (Fix untuk user)
  setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  const statusText = (data.status || data.rawStatus || "").toLowerCase();
  
  // 1. SUKSES (PAID)
  if (statusText === "paid") {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; background:#f0fdf4; border:1px solid #22c55e; border-radius:8px;">
        <h3 style="color:#15803d; margin-bottom:10px;"><i class="fa-solid fa-check-circle"></i> Pembayaran Berhasil</h3>
        <p>E-Ticket telah dikirim ke email Anda.</p>
        <strong>${formatCurrency(data.amount)}</strong>
      </div>
    `;
    return;
  }

  // 2. GRATIS
  if (data.paymentType === "free") {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; background:#f0fdf4; border:1px solid #22c55e; border-radius:8px;">
        <h3 style="color:#15803d;">Terdaftar (Gratis)</h3>
        <p>Tiket telah dikirim ke email Anda.</p>
      </div>
    `;
    return;
  }

  // 3. MENUNGGU PEMBAYARAN (PENDING)
  const isPending = ["pending", "unpaid", ""].includes(statusText);
  let contentHtml = '';

  // Jika QRIS
  if (data.paymentType !== "bank_transfer") {
    const qrUrl = data.qrUrl || createQrUrl(data.qrString);
    contentHtml = `
      <div style="text-align:center; margin-bottom:15px;">
        <p style="font-weight:bold; margin-bottom:5px;">Scan QRIS ini</p>
        ${qrUrl ? `<img src="${qrUrl}" alt="QRIS" style="max-width:200px; border:1px solid #eee; padding:5px; border-radius:8px;">` : ''}
      </div>
    `;
  } 
  // Jika VA
  else {
    const bank = (data.bank || "VA").toUpperCase();
    const va = data.vaNumber || data.payCode || "-";
    contentHtml = `
      <div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px;">
        <div style="font-size:12px; color:#64748b;">Virtual Account ${bank}</div>
        <div style="font-size:20px; font-weight:bold; color:#334155; display:flex; justify-content:space-between; align-items:center;">
            <span id="vaNum">${va}</span>
            <button class="copy-btn" data-copy="${va}" style="font-size:12px; padding:4px 8px;">Salin</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-top:20px;">
      <h4 style="margin-bottom:15px; text-align:center;">Selesaikan Pembayaran</h4>
      ${contentHtml}
      ${renderFeeBreakdown(data)}
      ${data.expiresAt ? `<div style="text-align:center; margin-top:10px; color:#e11d48; font-size:13px;" data-expiry-countdown>Loading timer...</div>` : ''}
      ${buildInstructionsHtml(data.instructions)}
      
      ${data.checkoutUrl ? `<a href="${data.checkoutUrl}" target="_blank" class="btn btn-outline" style="width:100%; display:block; text-align:center; margin-top:15px;">Buka Halaman Pembayaran</a>` : ''}
    </div>
  `;

  // Setup Timer & Copy
  if (isPending && data.expiresAt) {
    setupExpiryCountdown(container, data.expiresAt, { onExpire: options.onExpire });
  }
  container.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Disalin!";
      setTimeout(() => btn.textContent = "Salin", 2000);
    });
  });
}

// --- LOGIKA UTAMA FORM ---

function initPaymentForm(event) {
  const form = document.getElementById("paymentForm");
  const resultBox = document.getElementById("paymentResult");
  const payBtn = document.getElementById("payNowBtn");
  
  // Input Hidden HTML
  const ticketInput = document.getElementById('ticketTypeInput'); // Hidden input
  const methodInput = document.getElementById('paymentMethodInput'); // Hidden input

  // Tombol HTML
  const methodButtons = document.querySelectorAll(".method-btn");
  const ticketRegularBtn = document.getElementById("ticketRegularBtn");
  const ticketVipBtn = document.getElementById("ticketVipBtn");
  
  // Data Event
  const priceRegular = Number(event.priceRegular || 0);
  const priceVip = Number(event.priceVip || 0);
  
  // State Awal
  let selectedTicket = "regular"; 
  let method = "qris"; 
  let bank = null;

  // 1. Sinkronisasi UI Tiket
  function updateTicketUI(type) {
    selectedTicket = type;
    if(ticketInput) ticketInput.value = type;
    
    // Update class tombol
    if(ticketRegularBtn) ticketRegularBtn.classList.toggle("active", type === "regular");
    if(ticketVipBtn) ticketVipBtn.classList.toggle("active", type === "vip");

    // Update Harga Tampil
    const priceEl = document.getElementById("eventPrice");
    if(priceEl) {
        const price = type === "vip" ? priceVip : priceRegular;
        priceEl.textContent = price > 0 ? formatCurrency(price) : "Gratis";
    }
  }

  // Event Listener Tiket
  if(ticketRegularBtn) ticketRegularBtn.addEventListener("click", () => updateTicketUI("regular"));
  if(ticketVipBtn) ticketVipBtn.addEventListener("click", () => updateTicketUI("vip"));

  // 2. Sinkronisasi UI Metode Pembayaran
  methodButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        // Hapus active dari semua
        methodButtons.forEach(b => b.classList.remove("active"));
        // Tambah active ke yang diklik
        btn.classList.add("active");
        
        // Update State
        const m = btn.dataset.method;
        const b = btn.dataset.bank;
        
        if (m === "va") {
            method = "bank_transfer";
            bank = b;
        } else {
            method = "qris";
            bank = null;
        }

        // Update Hidden Input (untuk backup)
        if(methodInput) methodInput.value = method + (bank ? '_' + bank : '');
    });
  });

  // 3. HANDLE SUBMIT
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // VALIDASI EMAIL GMAIL
      const formData = new FormData(form);
      const email = formData.get("email");
      if (!email || !email.includes("@gmail.com")) {
        alert("Harap gunakan email Gmail (contoh@gmail.com)");
        return;
      }

      // UI LOADING
      const originalText = payBtn.textContent;
      payBtn.disabled = true;
      payBtn.textContent = "Memproses...";
      resultBox.classList.add("hidden");

      // SIAPKAN PAYLOAD API
      const isFree = (selectedTicket === "vip" ? priceVip : priceRegular) <= 0;
      const payload = {
        eventId: event.id,
        paymentType: isFree ? "free" : method,
        bank: isFree ? null : bank, // Bank null jika QRIS
        ticketType: selectedTicket,
        customer: {
            name: formData.get("name"),
            email: email,
            phone: formData.get("phone")
        }
      };

      try {
        console.log("Sending payload:", payload);
        const response = await fetch(`${API_BASE}/payments/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error("Gagal membuat pembayaran");
        
        const data = await response.json();
        
        // RENDER HASIL DI HALAMAN INI (INLINE)
        renderPaymentResult(resultBox, data);
        
        // JIKA ADA CHECKOUT URL, BUKA DI TAB BARU JUGA (OPSIONAL)
        if (data.checkoutUrl && !isFree) {
            window.open(data.checkoutUrl, "_blank");
        }

      } catch (err) {
        console.error(err);
        alert("Terjadi kesalahan: " + err.message);
      } finally {
        payBtn.disabled = false;
        payBtn.textContent = originalText;
      }
    });
  }
}

// --- LOGIKA POLLING & TIMER (TETAP SEPERTI ASLI) ---
function startOrderStatusPolling(refValue, onStatus) { /* ... kode asli polling ... */ } 
function stopExpiryTimer() { if(activeExpiryTimer) clearInterval(activeExpiryTimer); }
function setupExpiryCountdown(container, expiresAt, opts) {
    stopExpiryTimer();
    const target = new Date(expiresAt).getTime();
    const el = container.querySelector("[data-expiry-countdown]");
    if(!el) return;
    
    activeExpiryTimer = setInterval(() => {
        const diff = target - Date.now();
        if(diff <= 0) {
            el.textContent = "Waktu habis";
            stopExpiryTimer();
            if(opts.onExpire) opts.onExpire();
        } else {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.textContent = `Sisa waktu: ${m}m ${s}s`;
        }
    }, 1000);
}

// --- LOAD EVENT LOGIC ---

async function fetchEventBySlug(slug) {
  try {
    const snap = await getDoc(doc(db, "events", slug));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (err) { console.error(err); }
  // Fallback ke seed data
  const fallback = EVENT_SEED_DATA.find((e) => e.slug === slug);
  return fallback ? { id: fallback.slug, ...fallback } : null;
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("event") || "teka-teki-takdir"; // Default fallback buat testing

  if (!slug) return renderNotFound();

  const eventData = await fetchEventBySlug(slug);
  if (!eventData) return renderNotFound();

  renderEvent(eventData);
});

function renderEvent(event) {
    // Render teks dasar
    setText("eventTitle", event.title);
    setText("eventDescription", event.description);
    setText("eventDate", event.schedule);
    setText("eventLocation", event.location);
    
    // Setup form
    initPaymentForm(event);
}