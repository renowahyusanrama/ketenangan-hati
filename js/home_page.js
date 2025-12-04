// Tahun dinamis di footer
document.getElementById('year').textContent = new Date().getFullYear();

// Toggle mobile nav (legacy)
const toggle = document.querySelector('.nav-toggle');
const links  = document.querySelector('.nav-links');
toggle?.addEventListener('click', () => {
  links?.classList.toggle('open');
});

// Overlay menu (burger)
const menuOverlay = document.getElementById('menuOverlay');
const menuOpenBtn = document.getElementById('menuOpen');
const menuCloseBtn = document.getElementById('menuClose');
const menuLinks = [...document.querySelectorAll('.menu-list a')];

// Cart drawer
const cartOverlay = document.getElementById('cartOverlay');
const cartToggle = document.getElementById('cartToggle');
const cartClose = document.getElementById('cartClose');
const cartOrdersStatus = document.getElementById('cartOrdersStatus');
const cartOrdersList = document.getElementById('cartOrdersList');
const profileDropdown = document.getElementById('profileDropdown');
const profileBtn = document.getElementById('profileBtn');

function syncCartPreview(){
  const sourceStatus = document.getElementById('userOrdersStatus');
  const sourceList = document.getElementById('userOrdersList');
  if(sourceStatus && cartOrdersStatus){
    cartOrdersStatus.textContent = sourceStatus.textContent;
  }
  if(sourceList && cartOrdersList){
    cartOrdersList.innerHTML = sourceList.innerHTML;
  }
}

function syncBodyLock(){
  const locked = menuOverlay?.classList.contains('open') || cartOverlay?.classList.contains('open');
  document.body.classList.toggle('no-scroll', !!locked);
}

function setMenu(open){
  if(!menuOverlay) return;
  menuOverlay.classList.toggle('open', !!open);
  closeProfileDropdown();
  syncBodyLock();
}
menuOpenBtn?.addEventListener('click', ()=> setMenu(true));
menuCloseBtn?.addEventListener('click', ()=> setMenu(false));
menuOverlay?.addEventListener('click', (e)=>{
  if(e.target === menuOverlay) setMenu(false);
});
menuLinks.forEach(a => a.addEventListener('click', () => setMenu(false)));

function setCart(open){
  if(!cartOverlay) return;
  cartOverlay.classList.toggle('open', !!open);
  if(open) syncCartPreview();
  closeProfileDropdown();
  syncBodyLock();
}
cartToggle?.addEventListener('click', ()=> setCart(true));
cartClose?.addEventListener('click', ()=> setCart(false));
cartOverlay?.addEventListener('click', (e)=>{
  if(e.target === cartOverlay) setCart(false);
});

// Profile icon -> buka modal login
function closeProfileDropdown(){
  profileDropdown?.classList.remove('open');
}
profileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if(profileDropdown?.dataset.state === 'logged-in'){
    profileDropdown.classList.toggle('open');
    profileDropdown.classList.remove('hidden');
  } else if(typeof openModal === 'function'){
    openModal();
  }
});
document.addEventListener('click', (e)=>{
  if(profileDropdown && profileDropdown.classList.contains('open')){
    const inside = profileDropdown.contains(e.target);
    const onBtn = profileBtn?.contains(e.target);
    if(!inside && !onBtn) closeProfileDropdown();
  }
});
profileDropdown?.addEventListener('click', (e)=>{
  if(e.target.closest('a')) closeProfileDropdown();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeProfileDropdown();
});

// Scroll spy (beri .active pada nav)
const sections = [...document.querySelectorAll('section[id], footer[id]')];
const navAnchors = [...document.querySelectorAll('.nav-links a, .menu-list a')];

function setActiveOnScroll(){
  const scrollPos = window.scrollY + 120;
  for(const s of sections){
    const top = s.offsetTop;
    const bottom = top + s.offsetHeight;
    if(scrollPos >= top && scrollPos < bottom){
      navAnchors.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav-links a[href="#${s.id}"], .menu-list a[href="#${s.id}"]`);
      active?.classList.add('active');
      return;
    }
  }
}
window.addEventListener('scroll', setActiveOnScroll);
setActiveOnScroll();

// Scroll-in animations
const animated = document.querySelectorAll('[data-animate]');
const obs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('animate-in');
      obs.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });
animated.forEach(el => obs.observe(el));

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if(id && id.startsWith('#') && id.length > 1){
      const target = document.querySelector(id);
      if(target){
        e.preventDefault();
        window.scrollTo({ top: target.offsetTop - 60, behavior: 'smooth' });
        links?.classList.remove('open');
        setMenu(false);
        setCart(false);
      }
    }
  });
});

// ======= LOGIN MODAL =======
const modal = document.getElementById('loginModal');
const closes = modal?.querySelectorAll('[data-close="true"]');

function openModal(){
  modal?.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(()=> modal.querySelector('input[name="email"]')?.focus(), 80);
}
function closeModal(){
    // nonaktifkan tombol close/escape: modal hanya ditutup setelah login via auth.js
    return;
}

// tombol Login di navbar akan dirender oleh auth.js.
// tapi kalau ada .btn-login awal, tetap buat bisa buka modal:
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.btn-login');
  if(!btn) return;
  e.preventDefault();
  openModal();
});






  // hilangkan kemampuan close via click / escape

// JANGAN ADA handler submit demo di sini.
// Form akan ditangani oleh js/auth.js (Firebase).
