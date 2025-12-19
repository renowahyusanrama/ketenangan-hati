// js/auth.js — Login Google & Email (Fix Dashboard Terbuka)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword,
  getRedirectResult, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// === Konfigurasi Firebase ===
const firebaseConfig = {
  apiKey: "AIzaSyCoa_Ioa-Gp9TnL5eke6fwTkfQGkbWGJBw",
  authDomain: "pengajian-online.firebaseapp.com",
  projectId: "pengajian-online",
  storageBucket: "pengajian-online.firebasestorage.app",
  messagingSenderId: "965180253441",
  appId: "1:965180253441:web:f03f6cb969e422fd7e2700",
  measurementId: "G-YJ81SDXM5E"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
await setPersistence(auth, browserLocalPersistence).catch(console.error);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const modal = document.getElementById('loginModal');
const authGate = document.getElementById('auth-gate');

// --- Fungsi Modal ---
function closeModal(){
  if(modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function openModal() {
  if(modal) {
    modal.classList.add('open');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }
}

// --- Render Profil & Tombol Login ---
function getAuthSlot(){
  let slot = document.getElementById('profileDropdown');
  if (slot) return slot;
  
  // Jika belum ada, buat baru di navbar
  const navRight = document.querySelector('.nav-right');
  if (!navRight) return null;
  slot = document.createElement('div');
  slot.id = 'profileDropdown';
  slot.className = 'profile-dropdown hidden';
  navRight.appendChild(slot);
  return slot;
}

function renderLoginButton(){
  const slot = getAuthSlot();
  if(!slot) return;
  // Tampilkan tombol login sederhana
  slot.innerHTML = `<button type="button" class="btn-inline-login" style="width:100%; padding:10px; background:#3775B5; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Login</button>`;
  slot.querySelector('.btn-inline-login')?.addEventListener('click', openModal);
}

function renderUserChip(user){
  const slot = getAuthSlot();
  if(!slot) return;
  slot.classList.remove('hidden');
  
  const photo = user.photoURL 
    ? `<img src="${user.photoURL}" style="width:35px; height:35px; border-radius:50%; object-fit:cover; flex-shrink:0;">` 
    : `<div style="width:35px; height:35px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-weight:bold;">${(user.displayName||'U').charAt(0)}</div>`;
  
  slot.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; padding: 15px; border-bottom: 1px solid #eee;">
      ${photo}
      <div style="display: flex; flex-direction: column; text-align: left; line-height: 1.2;">
        <span style="font-weight: bold; font-size: 14px; color: #333;">${user.displayName || 'User'}</span>
        <span style="font-size: 11px; color: #777; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${user.email}</span>
      </div>
    </div>
    <div style="padding: 10px;">
       <button class="logout-btn" style="width: 100%; text-align: left; color: #e11d48; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 600;">Keluar</button>
    </div>
  `;
  slot.querySelector('.logout-btn')?.addEventListener('click', () => signOut(auth).then(() => location.reload()));
}

// --- Handler Klik (Event Delegation) ---
document.addEventListener('click', async (e) => {
  // 1. Tutup Modal (Tombol X atau Overlay)
  if (e.target.closest('#closeModalBtn') || e.target.classList.contains('modal-overlay')) {
    closeModal();
  }

  // 2. Login Google
  // Kita cari id="googleLoginBtn" atau class ".btn-google"
  const btnGoogle = e.target.closest('#googleLoginBtn') || e.target.closest('.btn-google');
  if (btnGoogle) {
    e.preventDefault();
    e.stopImmediatePropagation(); // PENTING: Mencegah bentrok dengan script lain
    
    try {
      const res = await signInWithPopup(auth, provider);
      if (res?.user) {
        console.log("Login Google Berhasil:", res.user.email);
        closeModal();
        
        // Cek jika ada auto-submit tertunda (dari halaman event)
        if(sessionStorage.getItem('pendingSubmit')) {
          sessionStorage.removeItem('pendingSubmit');
          const payBtn = document.getElementById('payNowBtn');
          if(payBtn) payBtn.click();
        }
      }
    } catch (err) { 
      console.error("Error Google Login:", err);
      if(err.code === 'auth/popup-blocked'){
         signInWithRedirect(auth, provider);
      }
    }
  }
});

// --- Login Email Manual ---
const loginForm = document.getElementById('loginForm');
if(loginForm){
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const pass = loginForm.password.value;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      closeModal();
      // Auto submit check
      if(sessionStorage.getItem('pendingSubmit')) {
          sessionStorage.removeItem('pendingSubmit');
          document.getElementById('payNowBtn')?.click();
      }
    } catch(err) {
      alert("Login gagal: Email atau password salah.");
    }
  });
}

// --- State Observer (PENTING: Logika Gate) ---
onAuthStateChanged(auth, (user) => {
  // Pastikan gate SELALU hilang, apapun statusnya (agar dashboard terbuka)
  if(authGate) authGate.style.display = 'none';
  if(authGate) authGate.classList.add('hidden');

  if (user) {
    // User Login
    renderUserChip(user);
    closeModal();
  } else {
    // User Belum Login
    renderLoginButton();
  }
});