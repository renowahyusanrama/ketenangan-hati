// js/event_detail.js (module) - render detail event dari Firestore + pembayaran Tripay sandbox

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

const PROD_FUNCTION_BASE = "https://ketenangan-jiwa.vercel.app/api";
const DEFAULT_FUNCTION_BASE = "https://us-central1-pengajian-online.cloudfunctions.net/api"; // fallback lama
const LOCAL_FUNCTION_BASE = "http://localhost:5001/pengajian-online/us-central1/api";
const shouldUseRelativeApi =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname.endsWith("web.app") ||
    window.location.hostname.endsWith("firebaseapp.com"));

const API_BASE =
  typeof window !== "undefined" && window.__API_BASE_URL__
    ? window.__API_BASE_URL__
    : shouldUseRelativeApi
      ? window.location.hostname === "localhost"
        ? LOCAL_FUNCTION_BASE
        : "/api"
      : PROD_FUNCTION_BASE;

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
    return;
  }
  block?.classList.remove("is-hidden");

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
        <div class="container empty-state">
          <h2>Event tidak ditemukan</h2>
          <p>Maaf, tautan event yang Anda buka tidak tersedia atau sudah tidak aktif.</p>
          <a href="index.html#event" class="btn btn-primary">Kembali ke daftar event</a>
        </div>
      </section>
    `;
  }
  const hero = document.querySelector(".event-hero");
  hero?.style.setProperty("--hero-image", "url('./assets/img/event-1.jpg')");
  setText("eventCategory", "Event");
  setText("eventTitle", "Event tidak ditemukan");
  setText("eventTagline", "Silakan kembali ke halaman utama untuk melihat jadwal terbaru.");
  document.getElementById("eventRegisterHero")?.setAttribute("href", "index.html#event");
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
        <details class="payment-instruction" open>
          <summary>${item.title || "Panduan pembayaran"}</summary>
          ${steps ? `<ol>${steps}</ol>` : ""}
        </details>
      `;
    })
    .join("");
  return `<div class="payment-instructions">${content}</div>`;
}

function renderPaymentResult(container, data) {
  if (!container) return;
  if (!data) {
    container.classList.add("hidden");
    return;
  }

  const checkoutLink = data.checkoutUrl
    ? `<a class="btn btn-outline" href="${data.checkoutUrl}" target="_blank" rel="noopener">Buka halaman pembayaran</a>`
    : "";
  const referenceText = data.reference || data.orderId || "";

  if (data.paymentType === "bank_transfer") {
    const bank = (data.bank || data.paymentName || "VA").toString().toUpperCase();
    const va = data.vaNumber || data.payCode || data.pay_code || "-";
    container.innerHTML = `
      <div class="payment-info-row">
        <div>
          <span>Metode</span>
          <strong>VA ${bank}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>${formatCurrency(data.amount)}</strong>
        </div>
      </div>
      <div class="payment-info-row">
        <div>
          <span>Nomor VA</span>
          <strong id="vaNumberText">${va}</strong>
        </div>
        <button class="copy-btn" data-copy="${va}">Salin</button>
      </div>
      <p class="form-hint">Transfer tepat sesuai nominal. Tagihan akan diverifikasi otomatis setelah pembayaran berhasil.</p>
      ${checkoutLink}
      ${referenceText ? `<p class="form-hint">Ref: ${referenceText}</p>` : ""}
      ${buildInstructionsHtml(data.instructions)}
    `;
  } else {
    const qrUrl = data.qrUrl || createQrUrl(data.qrString) || "";
    container.innerHTML = `
      <div class="qr-preview">
        ${qrUrl ? `<img src="${qrUrl}" alt="QRIS">` : ""}
        <strong>${formatCurrency(data.amount)}</strong>
        <p>Pindai QRIS menggunakan mobile banking / e-wallet.</p>
      </div>
      ${checkoutLink}
      ${referenceText ? `<p class="form-hint">Ref: ${referenceText}</p>` : ""}
      ${buildInstructionsHtml(data.instructions)}
    `;
  }

  container.classList.remove("hidden");

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
}

function initPaymentForm(event) {
  const form = document.getElementById("paymentForm");
  const methodButtons = document.querySelectorAll(".method-btn");
  const resultBox = document.getElementById("paymentResult");
  const hint = document.getElementById("paymentHint");
  const payBtn = document.getElementById("payNowBtn");

  if (!form || !methodButtons.length) return;

  let method = "qris";
  let bank = null;

  function setHint(message, variant = "info") {
    if (!hint) return;
    hint.textContent = message;
    hint.classList.remove("error", "success");
    if (variant !== "info") hint.classList.add(variant);
  }

  function activateButton(target) {
    methodButtons.forEach((btn) => btn.classList.toggle("active", btn === target));
  }

  methodButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      method = btn.dataset.method === "va" ? "bank_transfer" : "qris";
      bank = btn.dataset.bank || null;
      activateButton(btn);
      setHint(
        method === "bank_transfer"
          ? `Gunakan virtual account ${(bank || "bca").toUpperCase()} untuk pembayaran.`
          : "QRIS bisa dibayar lewat mobile banking atau e-wallet yang mendukung.",
      );
    });
    if (index === 0) btn.click();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    resultBox?.classList.add("hidden");
    setHint("Membuat tagihan pembayaran...", "info");
    payBtn.disabled = true;
    payBtn.textContent = "Memproses...";

    const formData = new FormData(form);
    const payload = {
      eventId: event.id,
      paymentType: method,
      bank: method === "bank_transfer" ? bank || "bca" : null,
      customer: {
        name: formData.get("name")?.toString() || "",
        email: formData.get("email")?.toString() || "",
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
        throw new Error(err.error || "Gagal membuat pembayaran.");
      }

      const data = await response.json();
      renderPaymentResult(resultBox, data);
      setHint("Tagihan berhasil dibuat. Segera selesaikan pembayaran.", "success");
    } catch (error) {
      console.error(error);
      setHint(error.message || "Gagal membuat pembayaran.", "error");
    } finally {
      payBtn.disabled = false;
      payBtn.textContent = "Buat Tagihan";
    }
  });
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

async function fetchRecommended(slug) {
  try {
    const ref = collection(db, "events");
    let snap;
    try {
      const q = query(ref, where("status", "==", "published"), orderBy("updatedAt", "desc"), limit(3));
      snap = await getDocs(q);
    } catch (err) {
      console.warn("Fallback recommended (tanpa orderBy):", err?.message);
      const q = query(ref, where("status", "==", "published"), limit(3));
      snap = await getDocs(q);
    }
    const list = [];
    snap.forEach((d) => {
      if (d.id !== slug) list.push({ id: d.id, ...d.data() });
    });
    if (!list.length) {
      return EVENT_SEED_DATA.filter((e) => e.slug !== slug).slice(0, 3);
    }
    return list.slice(0, 3);
  } catch (err) {
    console.error("Fetch recommended error:", err);
    return EVENT_SEED_DATA.filter((e) => e.slug !== slug).slice(0, 3);
  }
}

function renderRecommended(list) {
  const container = document.getElementById("otherEvents");
  if (!container) return;
  if (!list || !list.length) {
    container.innerHTML = '<p class="muted">Belum ada event lain.</p>';
    return;
  }
  container.innerHTML = "";
  list.forEach((item) => {
    const card = document.createElement("article");
    card.className = "mini-card";
    card.innerHTML = `
      <span class="chip chip-green">${item.category || "Event"}</span>
      <h4>${item.title || "-"}</h4>
      <ul class="meta">
        <li><i class="fa-regular fa-calendar-days"></i>${item.schedule || ""} ${item.time || ""}</li>
        <li><i class="fa-solid fa-location-dot"></i>${item.location || ""}</li>
      </ul>
      <a class="btn btn-outline" href="event-detail.html?event=${item.slug || item.id}">Detail</a>
    `;
    container.appendChild(card);
  });
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
    amount: Number(raw.amount) || 0,
    priceLabel: raw.priceLabel || (Number(raw.amount) ? null : "Gratis"),
    description: raw.description || "",
    highlights: raw.highlights || [],
    agenda: raw.agenda || [],
    notes: raw.notes || [],
    preparation: raw.preparation || [],
    contact: raw.contact || null,
  };
}

function renderEvent(event) {
  if (!event) return renderNotFound();

  document.title = `${event.title} | ketenangan jiwa`;

  const hero = document.querySelector(".event-hero");
  hero?.style.setProperty("--hero-image", `url('${event.imageUrl}')`);

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
  setText("eventPrice", event.amount ? formatCurrency(event.amount) : event.priceLabel || "Gratis");
  setText("eventTime", event.time);
  setText("eventAddress", event.address);

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
  const slug = params.get("event");
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
  const recommended = await fetchRecommended(slug);
  renderRecommended(recommended);
});
