// js/auth.js — Google Sign-In + Email/Password (login & daftar) dengan Firebase

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
await setPersistence(auth, browserLocalPersistence).catch(console.error);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const modal     = document.getElementById('loginModal');
const form      = document.getElementById('loginForm');
const linkReg   = document.querySelector('.link-register');
const submitBtn = form?.querySelector('.btn-login-submit');

// ——— Modal helpers
function closeModal(){
  if(!modal) return;
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
    .user-logout{ background:transparent; border:0; color:#ef4444; font-weight:700; cursor:pointer }
    .user-logout:hover{ text-decoration:underline }
  `;
  const style = Object.assign(document.createElement('style'), { id:'userChipStyle', textContent:css });
  document.head.appendChild(style);
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
    if(res?.user){ renderUserChip(res.user); closeModal(); }
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
  .then(res => { if(res?.user){ renderUserChip(res.user); closeModal(); } })
  .catch(err => console.error('Redirect error:', err.code));

// ——— EMAIL/PASSWORD: toggle daftar & submit
let isRegister = false;

function setFormMode(register){
  isRegister = register;
  if(submitBtn) submitBtn.textContent = register ? 'Daftar' : 'Login';
  const title = modal?.querySelector('#loginTitle');
  if(title) title.textContent = register ? 'Buat Akun' : 'Selamat Datang';
  const divider = modal?.querySelector('.divider span');
  if(divider) divider.textContent = register ? 'atau' : 'atau';
}

linkReg?.addEventListener('click', (e)=>{
  e.preventDefault();
  setFormMode(!isRegister);
});

form?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(authBusy) return;
  authBusy = true;
  try{
    const data = Object.fromEntries(new FormData(form).entries());
    const email = String(data.email || '').trim();
    const password = String(data.password || '');

    if(!email || !password){
      alert('Email dan password wajib diisi.');
      return;
    }

    if(isRegister){
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      // opsional: set displayName dari bagian sebelum '@'
      const guessName = email.split('@')[0];
      try{ await updateProfile(user, { displayName: guessName }); }catch{}
      renderUserChip(user);
      closeModal();
    }else{
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      renderUserChip(user);
      closeModal();
    }
  }catch(err){
    const msg = mapAuthError(err?.code);
    alert(msg);
    console.error(err);
  }finally{
    authBusy = false;
  }
});

function mapAuthError(code){
  switch(code){
    case 'auth/email-already-in-use': return 'Email sudah terdaftar. Silakan login.';
    case 'auth/invalid-email': return 'Format email tidak valid.';
    case 'auth/weak-password': return 'Password terlalu lemah (min. 6 karakter).';
    case 'auth/user-not-found': return 'Akun tidak ditemukan.';
    case 'auth/wrong-password': return 'Password salah.';
    case 'auth/too-many-requests': return 'Terlalu banyak percobaan. Coba lagi nanti.';
    default: return 'Terjadi kesalahan: ' + (code || 'unknown');
  }
}

// ——— Observer state
onAuthStateChanged(auth, (user)=>{
  if(user) renderUserChip(user);
  else     renderLoginButton();
});

// Render awal
renderLoginButton();
