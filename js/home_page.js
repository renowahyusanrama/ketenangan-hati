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

// Scroll-in animations (IntersectionObserver)
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

// Helper: smooth scroll for internal links (older browsers fallback)
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
const loginBtn = document.querySelector('.btn-login');
const modal = document.getElementById('loginModal');
const closes = modal?.querySelectorAll('[data-close="true"]');

function openModal(){
  modal?.classList.add('open');
  document.body.style.overflow = 'hidden';
  // fokus ke email biar UX enak
  setTimeout(()=> modal.querySelector('input[name="email"]')?.focus(), 80);
}
function closeModal(){
  modal?.classList.remove('open');
  document.body.style.overflow = '';
}

loginBtn?.addEventListener('click', (e)=>{ e.preventDefault(); openModal(); });
closes?.forEach(el => el.addEventListener('click', closeModal));
modal?.addEventListener('click', (e)=>{
  if(e.target?.dataset?.close === 'true') closeModal();
});
window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && modal?.classList.contains('open')) closeModal(); });

// (Demo) submit form
document.getElementById('loginForm')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  // TODO: ganti dengan logic login beneran (API/Firebase, dll)
  console.log('Login submit:', data);
  closeModal();
  alert('Login berhasil (demo). Ganti dengan proses auth milikmu ya!');
});
