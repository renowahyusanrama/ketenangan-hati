import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, 
  onAuthStateChanged, signOut, getIdTokenResult, setPersistence, browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// --- DOM ELEMENTS ---
const modal = document.getElementById('loginModal');
const authGate = document.getElementById('auth-gate');
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');

// ELEMENT MENU MOBILE (GARIS TIGA)
const menuOpen = document.getElementById('menuOpen');
const menuClose = document.getElementById('menuClose');
const menuOverlay = document.getElementById('menuOverlay');

// --- Helper Functions ---
function closeModal(){
  if(modal) { modal.classList.remove('open'); modal.style.display = 'none'; document.body.style.overflow = ''; }
}
function openModal() {
  if(modal) { modal.classList.add('open'); modal.style.display = 'block'; document.body.style.overflow = 'hidden'; }
}

// Auto-fill form
function autoFillForm(user) {
    const nameInput = document.querySelector('input[name="name"]');
    const emailInput = document.querySelector('input[name="email"]');
    if (user) {
        if (nameInput && !nameInput.value && user.displayName) nameInput.value = user.displayName;
        if (emailInput && !emailInput.value && user.email) {
            emailInput.value = user.email;
            emailInput.style.backgroundColor = "#f0fdf4";
        }
    }
}

// Auto Submit Logic
function handlePostLogin(user) {
    autoFillForm(user);
    if(sessionStorage.getItem('pendingSubmit')) {
        sessionStorage.removeItem('pendingSubmit');
        setTimeout(() => {
            const payBtn = document.getElementById('payNowBtn');
            const phoneInput = document.querySelector('input[name="phone"]');
            
            // Cek apakah WA kosong? Jika kosong, fokuskan kesana
            if(phoneInput && !phoneInput.value) {
                phoneInput.focus();
                alert("Login berhasil! Mohon lengkapi No. WhatsApp.");
            } else {
                payBtn?.click();
            }
        }, 800);
    }
}

function getAuthSlot(){
  if (profileDropdown) return profileDropdown;
  return document.getElementById('profileDropdown');
}

function renderLoginButton(){
  const slot = getAuthSlot();
  if(!slot) return;
  slot.innerHTML = `<button type="button" class="btn-inline-login" style="padding:10px; width:100%; background:#3775B5; color:white; border:none; border-radius:8px; font-weight:bold;">Login</button>`;
  slot.querySelector('.btn-inline-login')?.addEventListener('click', openModal);
}

async function renderUserChip(user){
  const slot = getAuthSlot();
  if(!slot) return;
  slot.classList.remove('hidden');
  
  let adminMenuHtml = '';
  try {
      const token = await getIdTokenResult(user);
      if (token.claims.admin || user.email === "zhuansyahwa45@gmail.com") {
          adminMenuHtml = `<a href="admin.html" style="display:block; text-decoration:none; color:#333; font-weight:600; padding:10px 0; margin-bottom:5px;">Admin</a>`;
      }
  } catch (err) { console.log("Gagal cek admin:", err); }

  const photo = user.photoURL 
    ? `<img src="${user.photoURL}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">` 
    : `<div style="width:40px; height:40px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#555;">${(user.displayName||'U').charAt(0).toUpperCase()}</div>`;
  
  slot.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; padding:15px; border-bottom:1px solid #eee;">
      ${photo}
      <div style="text-align:left;">
        <div style="font-weight:bold; font-size:14px; color:#333;">${user.displayName || 'User'}</div>
        <div style="font-size:12px; color:#777;">${user.email}</div>
      </div>
    </div>
    <div style="padding:15px;">
       ${adminMenuHtml}
       <button class="logout-btn" style="width:100%; text-align:center; padding:8px; color:#e11d48; border:1px solid #eee; background:#fff; border-radius:6px; cursor:pointer; font-weight:600;">Keluar</button>
    </div>
  `;
  slot.querySelector('.logout-btn')?.addEventListener('click', () => signOut(auth).then(() => location.reload()));
}

// --- LOGIKA MENU MOBILE (GARIS TIGA) ---
if(menuOpen && menuOverlay) {
    menuOpen.addEventListener('click', () => {
        menuOverlay.classList.add('open'); // Tambah class 'open' (biasanya dari CSS home_page)
        menuOverlay.style.display = 'block'; // Paksa tampil
        document.body.style.overflow = 'hidden'; // Kunci scroll
    });
}
if(menuClose && menuOverlay) {
    menuClose.addEventListener('click', () => {
        menuOverlay.classList.remove('open');
        menuOverlay.style.display = 'none';
        document.body.style.overflow = '';
    });
}

// --- Handler Klik Global ---
if(profileBtn && profileDropdown) {
  profileBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (profileDropdown.classList.contains('hidden')) {
        profileDropdown.classList.remove('hidden'); profileDropdown.classList.add('open');
    } else {
        profileDropdown.classList.add('hidden'); profileDropdown.classList.remove('open');
    }
  });
}

document.addEventListener('click', (e) => {
  // Tutup dropdown profil jika klik luar
  if (profileDropdown && !profileDropdown.classList.contains('hidden')) {
    if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
      profileDropdown.classList.add('hidden'); profileDropdown.classList.remove('open');
    }
  }
  
  // Tutup Modal
  if (e.target.closest('#closeModalBtn') || e.target.classList.contains('modal-overlay')) closeModal();
  
  // Login Google
  const btnGoogle = e.target.closest('#googleLoginBtn') || e.target.closest('.btn-google');
  if (btnGoogle) {
    e.preventDefault(); e.stopImmediatePropagation();
    signInWithPopup(auth, provider).then((res) => {
      if(res.user) {
        closeModal();
        renderUserChip(res.user);
        handlePostLogin(res.user);
      }
    }).catch(err => {
      if(err.code === 'auth/popup-blocked') signInWithRedirect(auth, provider);
    });
  }
});

// Observer Auth State
onAuthStateChanged(auth, (user) => {
  if(authGate) { authGate.style.display = 'none'; authGate.classList.add('hidden'); }
  if (user) { 
      renderUserChip(user); 
      closeModal();
      autoFillForm(user);
  }
  else { renderLoginButton(); }
});