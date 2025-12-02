// Tahun dinamis di footer
document.getElementById('year').textContent = new Date().getFullYear();

// Toggle mobile nav
const toggle = document.querySelector('.nav-toggle');
const links  = document.querySelector('.nav-links');
toggle?.addEventListener('click', () => {
  links.classList.toggle('open');
});

// Scroll spy (beri .active pada nav)
const sections = [...document.querySelectorAll('section[id]')];
const navAnchors = [...document.querySelectorAll('.nav-links a')];

function setActiveOnScroll(){
  const scrollPos = window.scrollY + 120;
  for(const s of sections){
    const top = s.offsetTop;
    const bottom = top + s.offsetHeight;
    if(scrollPos >= top && scrollPos < bottom){
      navAnchors.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav-links a[href="#${s.id}"]`);
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
        links.classList.remove('open');
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
