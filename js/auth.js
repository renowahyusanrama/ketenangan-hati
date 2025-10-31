// js/auth.js — Google Sign-In stabil (popup + fallback redirect) + auto slot

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// === Config (punyamu) ===
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

// Simpan sesi biar tidak hilang setelah refresh
setPersistence(auth, browserLocalPersistence).catch(console.error);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const modal = document.getElementById('loginModal');

// Helper close modal
function closeModal(){
  if(!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// Pastikan #auth-slot ADA (kalau belum, bikin otomatis di .nav-links)
function ensureAuthSlot(){
  let slot = document.getElementById('auth-slot');
  if (slot) return slot;

  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return null;

  slot = document.createElement('div');
  slot.id = 'auth-slot';

  // Kalau sudah ada .btn-login “lama”, ganti dengan slot.
  const oldLogin = navLinks.querySelector('.btn-login');
  if (oldLogin) {
    oldLogin.replaceWith(slot);
  } else {
    navLinks.appendChild(slot);
  }
  return slot;
}

function getAuthSlot(){
  return ensureAuthSlot();
}

// ==== Renderers (swap UI tanpa reload) ====
function renderLoginButton(){
  const authSlot = getAuthSlot();
  if(!authSlot) return;

  authSlot.innerHTML = `
    <a href="#" class="btn btn-login"><i class="fa-regular fa-user"></i> Login</a>
  `;

  // Buka modal saat klik Login
  const btnLogin = authSlot.querySelector('.btn-login');
  btnLogin?.addEventListener('click', (e)=>{
    e.preventDefault();
    const modalEl = document.getElementById('loginModal');
    if(modalEl){
      modalEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(()=> modalEl.querySelector('input[name="email"]')?.focus(), 60);
    }
  });
}

function renderUserChip(user){
  const authSlot = getAuthSlot();
  if(!authSlot) return;

  const photo = user.photoURL
    ? `<img class="avatar" src="${user.photoURL}" alt="">`
    : `<span class="avatar avatar-fallback">${(user.displayName||'U').charAt(0)}</span>`;

  authSlot.innerHTML = `
    <div class="user-chip">
      ${photo}
      <span class="user-name">${user.displayName || user.email}</span>
      <button class="user-logout" title="Logout">Keluar</button>
    </div>
  `;

  authSlot.querySelector('.user-logout')?.addEventListener('click', async ()=>{
    try { await signOut(auth); } catch(e){ console.error(e) }
  });

  injectUserChipStyles();
}

// Style kecil untuk chip user (disuntik sekali)
function injectUserChipStyles(){
  if(document.getElementById('userChipStyle')) return;
  const css = `
    .user-chip{ display:inline-flex; align-items:center; gap:10px; padding:8px 10px;
      border:1px solid var(--border); border-radius:999px; background:#fff; }
    .user-chip .avatar{ width:28px; height:28px; border-radius:999px; object-fit:cover }
    .avatar-fallback{ display:grid; place-items:center; background:#E2E8F0; color:#111; font-weight:700 }
    .user-name{ font-weight:600; color:#111827; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
    .user-logout{ background:transparent; border:0; color:#ef4444; font-weight:700; cursor:pointer }
    .user-logout:hover{ text-decoration:underline }
  `;
  const style = Object.assign(document.createElement('style'), { id:'userChipStyle', textContent:css });
  document.head.appendChild(style);
}

// ==== Login Google (popup + fallback redirect) ====
let authBusy = false;

// Delegasi klik — tombol .btn-google tetap hidup walau DOM berubah
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.btn-google');
  if(!btn) return;
  e.preventDefault();

  if(authBusy) return;
  authBusy = true; btn.disabled = true;

  try{
    await signInWithPopup(auth, provider);   // coba popup dulu
    closeModal();
  }catch(err){
    console.warn('Google popup error:', err.code);
    if (err.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider); // fallback redirect
    } else if (err.code !== 'auth/cancelled-popup-request') {
      alert('Login gagal: ' + err.code);
      console.error(err);
    }
  }finally{
    authBusy = false; btn.disabled = false;
  }
});

// Jika tadi pakai redirect, proses hasilnya di sini
getRedirectResult(auth)
  .then(res => { if(res?.user){ closeModal(); } })
  .catch(err => console.error('Redirect error:', err.code));

// ==== Reaktivitas UI berdasar state auth ====
onAuthStateChanged(auth, (user)=>{
  // console.log('[auth] state:', user?.email ?? null); // debug optional
  if(user) renderUserChip(user);
  else     renderLoginButton();
});

// Render awal (jaga-jaga sebelum onAuthStateChanged terpanggil)
renderLoginButton();
