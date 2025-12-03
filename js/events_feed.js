// js/events_feed.js - render list event di halaman utama dari Firestore

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { EVENT_SEED_DATA } from "./events_seed_data.js";

const firebaseConfig = {
  apiKey: "AIzaSyCoa_Ioa-Gp9TnL5eke6fwTkfQGkbWGJBw",
  authDomain: "ketenangan-jiwa.firebaseapp.com",
  projectId: "ketenangan-jiwa",
  storageBucket: "ketenangan-jiwa.firebasestorage.app",
  messagingSenderId: "965180253441",
  appId: "1:965180253441:web:f03f6cb969e422fd7e2700",
  measurementId: "G-YJ81SDXM5E",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const cardsEl = document.getElementById("eventCards");
if (cardsEl) {
  loadEvents().catch((err) => {
    console.error(err);
    cardsEl.innerHTML = '<p class="muted">Gagal memuat event.</p>';
  });
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  if (!n) return "Gratis";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);
}

async function loadEvents() {
  cardsEl.innerHTML = '<p class="muted">Memuat event...</p>';
  const ref = collection(db, "events");
  let snap;
  try {
    const q = query(ref, where("status", "==", "published"), orderBy("updatedAt", "desc"), limit(20));
    snap = await getDocs(q);
  } catch (err) {
    console.warn("Fallback load events (tanpa orderBy):", err?.message);
    const q = query(ref, where("status", "==", "published"), limit(20));
    snap = await getDocs(q);
  }

  if (snap.empty) {
    console.warn("Firestore kosong, pakai fallback seed.");
    renderList(EVENT_SEED_DATA.slice(0, 6));
    return;
  }

  const list = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...d.data() });
  });
  renderList(list);
}

function renderList(data) {
  if (!data || !data.length) {
    cardsEl.innerHTML = '<p class="muted">Belum ada event yang dipublikasikan.</p>';
    return;
  }
  cardsEl.innerHTML = data
    .map((e) => {
      const slug = e.slug || e.id;
      return `
        <article class="card">
          <div class="card-media">
            <img src="${e.imageUrl || "./images/placeholder.jpg"}" alt="${e.title || ""}" />
            ${e.category ? `<span class="chip chip-green">${e.category}</span>` : ""}
          </div>
          <div class="card-body">
            <h3>${e.title || "-"}</h3>
            <p>${e.tagline || e.description || ""}</p>
            <ul class="meta">
              <li><i class="fa-regular fa-calendar-days"></i> ${e.schedule || ""} ${e.time || ""}</li>
              <li><i class="fa-solid fa-location-dot"></i> ${e.location || ""}</li>
              ${e.speaker ? `<li><i class="fa-regular fa-user"></i> ${e.speaker}</li>` : ""}
            </ul>
            <div class="card-footer">
              <span class="price">${formatCurrency(e.amount)}</span>
              <a href="event-detail.html?event=${slug}" class="btn btn-primary">Daftar</a>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}
