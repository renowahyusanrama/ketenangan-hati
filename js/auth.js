// js/auth.js — Google Sign-In + Email/Password (login & daftar) dengan Firebase

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, getIdTokenResult,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// === Config proyekmu ===
const firebaseConfig = {
  apiKey: "AIzaSyCoa_Ioa-Gp9TnL5eke6fwTkfQGkbWGJBw",
  authDomain: "pengajian-online.firebaseapp.com",
  projectId: "pengajian-online",
  storageBucket: "pengajian-online.firebasestorage.app",
  messagingSenderId: "965180253441",
  appId: "1:965180253441:web:f03f6cb969e422fd7e2700",
  measurementId: "G-YJ81SDXM5E"
};

// === Init ===
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'id';
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence).catch(console.error);
const authGate = document.getElementById('auth-gate');
const bodyEl = document.body;

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const modal     = document.getElementById('loginModal');
const form      = document.getElementById('loginForm');
const linkReg   = document.querySelector('.link-register');
const linkLoginBack = document.querySelector('.link-login-back');
const footRegister = document.querySelector('.auth-footnote-register');
const footLogin = document.querySelector('.auth-footnote-login');
const submitBtn = form?.querySelector('.btn-login-submit');
let isAdmin = false;
const userOrdersStatus = document.getElementById('userOrdersStatus');
const userOrdersList = document.getElementById('userOrdersList');
const USER_ORDER_LIMIT = 10;
let userOrdersLoading = false;
const ORDER_STATUS_CLASSES = {
  paid: "green",
  pending: "yellow",
  expired: "gray",
  failed: "red",
  canceled: "red",
  refunded: "blue",
};

// ——— Modal helpers
function closeModal(){
  if(!modal) return;
  if(!auth.currentUser){
    modal.classList.add('open'); // tetap buka
    document.body.style.overflow = 'hidden';
    return;
  }
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ——— Pastikan ada #auth-slot untuk swap UI
function ensureAuthSlot(){
  let slot = document.getElementById('auth-slot');
  if (slot) return slot;
  const nav = document.querySelector('.nav-links');
  if (!nav) return null;
  slot = document.createElement('div'); slot.id = 'auth-slot';
  const oldLogin = nav.querySelector('.btn-login');
  if (oldLogin) oldLogin.replaceWith(slot); else nav.appendChild(slot);
  return slot;
}
function getAuthSlot(){ return ensureAuthSlot(); }

// ——— Renderers
function renderLoginButton(){
  const slot = getAuthSlot();
  if(!slot) return;
  slot.innerHTML = `
    <a href="#" class="btn btn-login"><i class="fa-regular fa-user"></i> Login</a>
  `;
  slot.querySelector('.btn-login')?.addEventListener('click', (e)=>{
    e.preventDefault();
    modal?.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(()=> modal.querySelector('input[name="email"]')?.focus(), 60);
  });
}

function renderUserChip(user){
  const slot = getAuthSlot();
  if(!slot) return;
  const photo = user.photoURL
    ? `<img class="avatar" src="${user.photoURL}" alt="">`
    : `<span class="avatar avatar-fallback">${(user.displayName||user.email||'U').charAt(0)}</span>`;
  slot.innerHTML = `
    <div class="user-chip">
      ${photo}
      <span class="user-name">${user.displayName || user.email}</span>
      ${isAdmin ? '<a class="user-admin" href="admin.html" title="Admin dashboard">Admin</a>' : ''}
      <button class="user-logout" title="Logout">Keluar</button>
    </div>
  `;
  slot.querySelector('.user-logout')?.addEventListener('click', async ()=>{
    try{ await signOut(auth); }catch(e){ console.error(e); }
  });
  injectChipStyles();
}

function injectChipStyles(){
  if(document.getElementById('userChipStyle')) return;
  const css = `
    .user-chip{ display:inline-flex; align-items:center; gap:10px; padding:8px 10px;
      border:1px solid var(--border); border-radius:999px; background:#fff }
    .user-chip .avatar{ width:28px; height:28px; border-radius:999px; object-fit:cover }
    .avatar-fallback{ display:grid; place-items:center; background:#E2E8F0; color:#111; font-weight:700 }
    .user-name{ font-weight:600; color:#111827; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .user-admin{ color:#2563eb; font-weight:700; text-decoration:none; padding:4px 10px; border:1px solid #2563eb; border-radius:999px; }
    .user-admin:hover{ background:#2563eb; color:#fff; }
    .user-logout{ background:transparent; border:0; color:#ef4444; font-weight:700; cursor:pointer }
    .user-logout:hover{ text-decoration:underline }
  `;
  const style = Object.assign(document.createElement('style'), { id:'userChipStyle', textContent:css });
  document.head.appendChild(style);
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  if (!n) return "Gratis";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (err) {
    return "-";
  }
}

function getStatusClass(status) {
  const key = (status || "").toLowerCase();
  return ORDER_STATUS_CLASSES[key] || "gray";
}

function setOrdersPlaceholder(message) {
  if (!userOrdersList) return;
  userOrdersList.innerHTML = `<p class="muted text-center">${message}</p>`;
}

function setOrdersStatus(message) {
  if (!userOrdersStatus) return;
  userOrdersStatus.textContent = message || "";
}

function buildOrderCardHtml(order) {
  const status = (order.status || "pending").toLowerCase();
  const statusClass = getStatusClass(status);
  const totalAmount = order.totalAmount ?? order.amount ?? 0;
  const amountText = formatCurrency(totalAmount);
  const method = order.paymentType === "bank_transfer"
    ? `VA ${order.bank?.toUpperCase() || "BANK"}`
    : (order.paymentType || order.method || "-").toString().toUpperCase();
  const reference = order.reference || order.merchantRef || order.orderId || "-";
  const ticketUrl = reference && reference !== "-" ? `${window.location.origin}/ticket.html?ref=${encodeURIComponent(reference)}` : "#";
  const emailStatus = (order.ticketEmail?.status || "").toLowerCase();
  const recipient = order.ticketEmail?.recipient || order.customer?.email || "";
  let emailHint = "";
  if (emailStatus === "sent") {
    emailHint = `<p class="order-note success">E-ticket sudah dikirim ke ${recipient || "email Anda"}.</p>`;
  } else if (emailStatus === "pending") {
    emailHint = `<p class="order-note muted">E-ticket akan dikirim otomatis setelah pembayaran selesai.</p>`;
  } else if (emailStatus === "error") {
    emailHint = `<p class="order-note error">Gagal mengirim e-ticket. Silakan hubungi panitia.</p>`;
  }
  return `
    <article class="order-card">
      <div class="order-card-header">
        <h3 class="order-card-heading">${order.eventTitle || order.eventId || "Event"}</h3>
        <span class="badge ${statusClass}">${status.toUpperCase()}</span>
      </div>
      <div class="order-row">
        <div>
          <span class="order-label">Total Bayar</span>
          <span class="order-value">${amountText}</span>
        </div>
        <div>
          <span class="order-label">Metode</span>
          <span class="order-value">${method}</span>
        </div>
      </div>
      <div class="order-card-meta">
        <span><i class="fa-regular fa-clock"></i> ${formatDateTime(order.createdAt || order.created_at)}</span>
        <span><i class="fa-solid fa-hashtag"></i> ${reference}</span>
      </div>
      <div class="order-row" style="margin-top:12px;">
        <a href="${ticketUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-download"></i> Unduh E-ticket</a>
        ${
          recipient
            ? `<span style="font-size:12px; color:#475569;">Dikirim ke ${recipient}</span>`
            : ""
        }
      </div>
      ${emailHint}
    </article>
  `;
}

async function loadUserOrders(email) {
  if (!userOrdersList) return;
  if (!email) {
    setOrdersPlaceholder("Silakan login terlebih dahulu untuk melihat pesanan Anda.");
    setOrdersStatus("Login untuk melihat riwayat pesanan.");
    return;
  }
  if (userOrdersLoading) return;
  userOrdersLoading = true;
  setOrdersStatus("Memuat pesanan...");
  setOrdersPlaceholder("Memuat pesanan...");
  try {
    const ref = collection(db, "orders");
    const q = query(ref, where("customer.email", "==", email), orderBy("createdAt", "desc"), limit(USER_ORDER_LIMIT));
    const snap = await getDocs(q);
    if (!snap || !snap.docs.length) {
      setOrdersPlaceholder("Belum ada pesanan tersimpan.");
      setOrdersStatus("Belum ada pesanan aktif.");
      return;
    }
    const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    userOrdersList.innerHTML = orders.map(buildOrderCardHtml).join("");
    setOrdersStatus(`Menampilkan ${orders.length} pesanan terbaru.`);
  } catch (err) {
    console.error("loadUserOrders error:", err?.message || err);
    setOrdersPlaceholder("Gagal memuat pesanan.");
    setOrdersStatus("Terjadi kesalahan saat memuat pesanan.");
  } finally {
    userOrdersLoading = false;
  }
}

function showAuthGate(){
  authGate?.classList.remove('hidden');
  bodyEl.classList.add('auth-locked');
  document.body.style.overflow = 'hidden';
}
function hideAuthGate(){
  authGate?.classList.add('hidden');
  bodyEl.classList.remove('auth-locked');
  document.body.style.overflow = '';
}

async function refreshAdminFlag(user){
  if(!user){ isAdmin = false; return; }
  try{
    const token = await getIdTokenResult(user);
    isAdmin = !!token.claims?.admin;
  }catch(err){
    console.error('Gagal cek klaim admin:', err?.code || err);
    isAdmin = false;
  }
}

async function renderAfterAuth(user){
  await refreshAdminFlag(user);
  renderUserChip(user);
  hideAuthGate();
}

// ——— GOOGLE LOGIN (popup + fallback redirect)
let authBusy = false;

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.btn-google');
  if(!btn) return;
  e.preventDefault();
  if(authBusy) return;
  authBusy = true; btn.disabled = true;

  try{
    const res = await signInWithPopup(auth, provider);
    if(res?.user){ await renderAfterAuth(res.user); closeModal(); }
  }catch(err){
    if (err.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
    } else if (err.code !== 'auth/cancelled-popup-request') {
      alert('Login gagal: ' + (err.code || 'unknown'));
      console.error(err);
    }
  }finally{
    authBusy = false; btn.disabled = false;
  }
});

getRedirectResult(auth)
  .then(async (res) => { if(res?.user){ await renderAfterAuth(res.user); closeModal(); } })
  .catch(err => console.error('Redirect error:', err.code));

// ——— Observer state
onAuthStateChanged(auth, (user)=>{
  loadUserOrders(user ? user.email : null);
  if(user) {
    renderAfterAuth(user);
    // pastikan gate & modal tertutup jika sudah login (termasuk saat reload)
    hideAuthGate();
    modal?.classList.remove('open');
    document.body.style.overflow = '';
  } else {
    isAdmin = false;
    renderLoginButton();
    showAuthGate();
    modal?.classList.add('open'); // paksa modal tampil
    document.body.style.overflow = 'hidden';
  }
});

// Tombol login pada gate -> buka modal & hilangkan gate
document.querySelector('.gate-login-btn')?.addEventListener('click', (e)=>{
  e.preventDefault();
  hideAuthGate();
  modal?.classList.add('open');
  document.body.style.overflow = 'hidden';
});

// Render awal
renderLoginButton();
// Paksa tampilkan modal & kunci konten sampai login
showAuthGate();
modal?.classList.add('open');
document.body.style.overflow = 'hidden';
