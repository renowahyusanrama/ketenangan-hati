import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword,
  getRedirectResult, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// --- Helper Functions ---
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

// --- FITUR AUTO-FILL (OTOMATIS ISI FORM) ---
function autoFillForm(user) {
    const nameInput = document.querySelector('input[name="name"]');
    const emailInput = document.querySelector('input[name="email"]');
    
    if (user) {
        if (nameInput && !nameInput.value && user.displayName) {
            nameInput.value = user.displayName;
        }
        if (emailInput && !emailInput.value && user.email) {
            emailInput.value = user.email;
            // Buat efek visual bahwa ini sudah terisi
            emailInput.style.backgroundColor = "#f0fdf4";
            emailInput.style.borderColor = "#22c55e";
        }
    }
}

// --- Render User Interface ---
function getAuthSlot(){
  let slot = document.getElementById('profileDropdown');
  if (slot) return slot;
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
  slot.innerHTML = `<button type="button" class="btn-inline-login" style="padding: 8px 16px; background: #3775B5; color: white; border-radius: 8px; border: none; cursor: pointer; font-weight: bold;">Login</button>`;
  slot.querySelector('.btn-inline-login')?.addEventListener('click', openModal);
}

function renderUserChip(user){
  const slot = getAuthSlot();
  if(!slot) return;
  slot.classList.remove('hidden');
  const photo = user.photoURL 
    ? `<img src="${user.photoURL}" style="width:35px; height:35px; border-radius:50%; object-fit:cover; flex-shrink:0;">` 
    : `<div style="width:35px; height:35px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${(user.displayName||'U').charAt(0)}</div>`;
  
  slot.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; padding: 15px; border-bottom: 1px solid #eee;">
      ${photo}
      <div style="display: flex; flex-direction: column; text-align: left; line-height: 1.2;">
        <span style="font-weight: bold; font-size: 14px; color: #333;">${user.displayName || 'User'}</span>
        <span style="font-size: 11px; color: #777;">${user.email}</span>
      </div>
    </div>
    <div style="padding: 10px;">
       <button class="logout-btn" style="width: 100%; text-align: left; color: #e11d48; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 600;">Keluar</button>
    </div>
  `;
  slot.querySelector('.logout-btn')?.addEventListener('click', () => signOut(auth).then(() => location.reload()));
}

// --- Event Listeners ---
document.addEventListener('click', async (e) => {
  // Tutup Modal
  if (e.target.closest('#closeModalBtn') || e.target.classList.contains('modal-overlay')) closeModal();

  // Login Google
  const btnGoogle = e.target.closest('#googleLoginBtn') || e.target.closest('.btn-google');
  if (btnGoogle) {
    e.preventDefault();
    e.stopImmediatePropagation();
    try {
      const res = await signInWithPopup(auth, provider);
      if (res?.user) {
        closeModal();
        autoFillForm(res.user); // PANGGIL FUNGSI AUTO-FILL
        
        // Lanjut ke pendaftaran jika tadi klik Buat Tagihan
        if(sessionStorage.getItem('pendingSubmit')) {
            sessionStorage.removeItem('pendingSubmit');
            // Beri jeda sedikit agar user lihat datanya terisi
            setTimeout(() => document.getElementById('payNowBtn')?.click(), 500);
        }
      }
    } catch (err) {
       console.error(err);
       if(err.code === 'auth/popup-blocked') signInWithRedirect(auth, provider);
    }
  }
});

// Login Email
const loginForm = document.getElementById('loginForm');
if(loginForm){
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value);
      closeModal();
      autoFillForm(res.user); // PANGGIL FUNGSI AUTO-FILL
      
      if(sessionStorage.getItem('pendingSubmit')) {
          sessionStorage.removeItem('pendingSubmit');
          setTimeout(() => document.getElementById('payNowBtn')?.click(), 500);
      }
    } catch(err) { alert("Email atau Password salah."); }
  });
}

// --- Observer (Menjaga status login) ---
onAuthStateChanged(auth, (user) => {
  // Selalu hilangkan gate
  if(authGate) { authGate.style.display = 'none'; authGate.classList.add('hidden'); }
  
  if (user) {
    renderUserChip(user);
    autoFillForm(user); // Pastikan form terisi jika user refresh halaman
    closeModal();
  } else {
    renderLoginButton();
  }
});