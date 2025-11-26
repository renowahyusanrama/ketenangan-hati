// js/admin.js - Admin dashboard sederhana untuk kelola event + upload poster Cloudinary

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// === Konfigurasi Firebase (samakan dengan proyekmu) ===
const firebaseConfig = {
  apiKey: "AIzaSyCoa_Ioa-Gp9TnL5eke6fwTkfQGkbWGJBw",
  authDomain: "pengajian-online.firebaseapp.com",
  projectId: "pengajian-online",
  storageBucket: "pengajian-online.firebasestorage.app",
  messagingSenderId: "965180253441",
  appId: "1:965180253441:web:f03f6cb969e422fd7e2700",
  measurementId: "G-YJ81SDXM5E",
};

// === Konfigurasi Cloudinary (isi dengan punyamu) ===
const CLOUDINARY_CLOUD_NAME = "dkhieufnk";
const CLOUDINARY_UPLOAD_PRESET = "posters"; // nama preset unsigned yang kamu buat
const CLOUDINARY_FOLDER = "posters";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// === DOM refs ===
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");
const guardPanel = document.getElementById("guardPanel");
const guardMessage = document.getElementById("guardMessage");
const dashboard = document.getElementById("dashboard");
const adminStatus = document.getElementById("adminStatus");
const eventForm = document.getElementById("eventForm");
const formStatus = document.getElementById("formStatus");
const posterPreview = document.getElementById("posterPreview");
const uploadPosterBtn = document.getElementById("uploadPosterBtn");
const refreshBtn = document.getElementById("refreshBtn");
const resetBtn = document.getElementById("resetBtn");
const newEventBtn = document.getElementById("newEventBtn");
const tableBody = document.querySelector("#eventsTable tbody");
const saveBtn = document.getElementById("saveBtn");
const previewImage = document.getElementById("previewImage");
const previewCategory = document.getElementById("previewCategory");
const previewTitle = document.getElementById("previewTitle");
const previewTagline = document.getElementById("previewTagline");
const previewSchedule = document.getElementById("previewSchedule");
const previewLocation = document.getElementById("previewLocation");
const previewSpeaker = document.getElementById("previewSpeaker");
const previewPrice = document.getElementById("previewPrice");

let currentUser = null;
let isAdmin = false;
let editingSlug = null;
let cloudinaryWidget = null;
const eventsCache = new Map();

function setGuard(message, isOk = false) {
  guardMessage.textContent = message;
  guardMessage.style.color = isOk ? "#4ade80" : "#cbd5e1";
}

function setDashboardVisible(visible) {
  dashboard.classList.toggle("hidden", !visible);
  guardPanel.classList.toggle("hidden", visible);
}

function setLoadingForm(loading) {
  saveBtn.disabled = loading;
  formStatus.textContent = loading ? "Menyimpan..." : "";
}

function formatCurrency(num) {
  const n = Number(num) || 0;
  if (!n) return "Gratis";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);
}

function updatePreviewFromForm() {
  const title = eventForm.title?.value?.trim() || "Judul Event";
  const tagline = eventForm.tagline?.value?.trim() || eventForm.description?.value?.trim() || "Tagline atau deskripsi singkat.";
  const category = eventForm.category?.value?.trim() || "Kategori";
  const schedule = eventForm.schedule?.value?.trim() || "Tanggal & waktu";
  const time = eventForm.time?.value?.trim();
  const location = eventForm.location?.value?.trim() || "Lokasi";
  const speaker = eventForm.speaker?.value?.trim() || "Pemateri";
  const amount = Number(eventForm.amount?.value) || 0;
  const image = eventForm.imageUrl?.value?.trim() || "./assets/img/event-1.jpg";

  if (previewTitle) previewTitle.textContent = title;
  if (previewTagline) previewTagline.textContent = tagline;
  if (previewCategory) previewCategory.textContent = category;
  if (previewSchedule) previewSchedule.textContent = time ? `${schedule} ${time}` : schedule;
  if (previewLocation) previewLocation.textContent = location;
  if (previewSpeaker) previewSpeaker.textContent = speaker;
  if (previewPrice) previewPrice.textContent = formatCurrency(amount);
  if (previewImage && previewImage.src !== image) previewImage.src = image;
}

function renderPosterPreview(url) {
  if (!posterPreview) return;
  if (!url) {
    posterPreview.classList.add("hidden");
    posterPreview.innerHTML = "";
    updatePreviewFromForm();
    return;
  }
  posterPreview.classList.remove("hidden");
  posterPreview.innerHTML = `<img src="${url}" alt="Poster" />`;
  if (previewImage) previewImage.src = url;
}

async function requireAdmin(user) {
  if (!user) return false;
  const tokenResult = await getIdTokenResult(user);
  return tokenResult?.claims?.admin === true;
}

async function loadEvents() {
  if (!isAdmin) return;
  tableBody.innerHTML = `<tr><td colspan="8" class="muted">Memuat data...</td></tr>`;
  try {
    eventsCache.clear();
    const ref = collection(db, "events");
    const q = query(ref, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q).catch(async () => getDocs(ref)); // fallback jika belum ada index
    const rows = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const item = { id: d.id, ...data };
      eventsCache.set(d.id, item);
      rows.push(item);
    });
    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="8" class="muted">Belum ada event.</td></tr>`;
      return;
    }
    tableBody.innerHTML = rows
      .map((e) => {
        const statusClass = e.status === "published" ? "green" : "gray";
        const img = e.imageUrl ? `<a href="${e.imageUrl}" target="_blank">Lihat</a>` : "-";
        return `
          <tr>
            <td>${e.title || "-"}</td>
            <td>${e.slug || e.id}</td>
            <td><span class="badge ${statusClass}">${e.status || "draft"}</span></td>
            <td>${e.schedule || "-"}</td>
            <td>${e.location || "-"}</td>
            <td>${formatCurrency(e.amount)}</td>
            <td>${img}</td>
            <td>
              <button class="outline" data-edit="${e.id}">Edit</button>
              <button class="outline" data-duplicate="${e.id}">Duplikat</button>
              <button class="danger" data-delete="${e.id}">Hapus</button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `<tr><td colspan="8" class="muted">Gagal memuat event: ${err.message}</td></tr>`;
  }
}

function fillForm(data) {
  if (!data) return;
  eventForm.title.value = data.title || "";
  eventForm.slug.value = data.slug || data.id || "";
  eventForm.category.value = data.category || "";
  eventForm.status.value = data.status || "draft";
  eventForm.schedule.value = data.schedule || "";
  eventForm.time.value = data.time || "";
  eventForm.location.value = data.location || "";
  eventForm.address.value = data.address || "";
  eventForm.speaker.value = data.speaker || "";
  eventForm.amount.value = data.amount ?? 0;
  eventForm.capacity.value = data.capacity ?? "";
  eventForm.tagline.value = data.tagline || "";
  eventForm.description.value = data.description || "";
  eventForm.imageUrl.value = data.imageUrl || "";
  eventForm.contactWa.value = data.contact?.wa || "";
  eventForm.contactPhone.value = data.contact?.phone || "";
  eventForm.contactEmail.value = data.contact?.email || "";
  // array to textarea
  eventForm.highlights.value = Array.isArray(data.highlights) ? data.highlights.join("\n") : "";
  eventForm.notes.value = Array.isArray(data.notes) ? data.notes.join("\n") : "";
  eventForm.preparation.value = Array.isArray(data.preparation) ? data.preparation.join("\n") : "";
  if (Array.isArray(data.agenda)) {
    eventForm.agenda.value = data.agenda
      .map((a) => {
        const t = a.time || "";
        const act = a.activity || "";
        return t && act ? `${t} - ${act}` : act || t;
      })
      .join("\n");
  } else {
    eventForm.agenda.value = "";
  }
  renderPosterPreview(data.imageUrl || "");
  updatePreviewFromForm();
}

function resetForm() {
  editingSlug = null;
  eventForm.reset();
  eventForm.status.value = "draft";
  eventForm.amount.value = 0;
  renderPosterPreview("");
  formStatus.textContent = "";
  updatePreviewFromForm();
}

async function saveEvent(e) {
  e.preventDefault();
  if (!isAdmin || !currentUser) {
    alert("Tidak ada akses admin.");
    return;
  }
  const slug = (eventForm.slug.value || "").trim();
  if (!slug) {
    alert("Slug wajib diisi.");
    return;
  }
  const data = {
    slug,
    title: (eventForm.title.value || "").trim(),
    category: (eventForm.category.value || "").trim(),
    status: eventForm.status.value || "draft",
    schedule: (eventForm.schedule.value || "").trim(),
    time: (eventForm.time.value || "").trim(),
    location: (eventForm.location.value || "").trim(),
    address: (eventForm.address.value || "").trim(),
    speaker: (eventForm.speaker.value || "").trim(),
    amount: Number(eventForm.amount.value) || 0,
    capacity: eventForm.capacity.value ? Number(eventForm.capacity.value) : null,
    tagline: (eventForm.tagline.value || "").trim(),
    description: (eventForm.description.value || "").trim(),
    imageUrl: (eventForm.imageUrl.value || "").trim(),
    contact: {
      wa: (eventForm.contactWa.value || "").trim(),
      phone: (eventForm.contactPhone.value || "").trim(),
      email: (eventForm.contactEmail.value || "").trim(),
    },
    highlights: (eventForm.highlights.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: (eventForm.notes.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    preparation: (eventForm.preparation.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    agenda: (eventForm.agenda.value || "")
      .split("\n")
      .map((row) => {
        const [t, ...rest] = row.split(" - ");
        const activity = rest.join(" - ").trim();
        return {
          time: (t || "").trim(),
          activity: activity || row.trim(),
        };
      })
      .filter((a) => a.time || a.activity),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid,
  };

  const ref = doc(db, "events", slug);
  const isNew = editingSlug !== slug;
  if (isNew) {
    data.createdAt = serverTimestamp();
  }

  setLoadingForm(true);
  try {
    if (isNew) {
      const exists = await getDoc(ref);
      if (exists.exists()) {
        const ok = confirm(`Slug "${slug}" sudah ada. Update event lama ini?`);
        if (!ok) {
          setLoadingForm(false);
          return;
        }
      }
    }
    await setDoc(ref, data, { merge: true });
    formStatus.textContent = "Tersimpan.";
    editingSlug = slug;
    await loadEvents();
  } catch (err) {
    console.error(err);
    formStatus.textContent = `Gagal: ${err.message}`;
    alert("Gagal menyimpan event: " + err.message);
  } finally {
    setLoadingForm(false);
  }
}

async function deleteEvent(slug) {
  if (!isAdmin || !slug) return;
  const ok = confirm(`Hapus event ${slug}?`);
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "events", slug));
    await loadEvents();
  } catch (err) {
    console.error(err);
    alert("Gagal menghapus: " + err.message);
  }
}

function initCloudinaryWidget() {
  if (cloudinaryWidget || !window.cloudinary) return;
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.startsWith("GANTI")) {
    console.warn("Cloudinary belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME di js/admin.js");
    return;
  }
  cloudinaryWidget = window.cloudinary.createUploadWidget(
    {
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: CLOUDINARY_FOLDER,
      sources: ["local", "url", "camera"],
      multiple: false,
    },
    (error, result) => {
      if (error) {
        console.error("Upload error:", error);
        alert("Upload gagal: " + error.message);
        return;
      }
      if (result && result.event === "success") {
        const url = result.info.secure_url;
        eventForm.imageUrl.value = url;
        renderPosterPreview(url);
        formStatus.textContent = "Poster diunggah.";
      }
    },
  );
}

function openUpload() {
  if (!cloudinaryWidget && window.cloudinary) {
    initCloudinaryWidget();
  }
  if (!cloudinaryWidget) {
    alert("Widget Cloudinary belum siap atau konfigurasi belum diisi.");
    return;
  }
  cloudinaryWidget.open();
}

// === Event listeners ===
loginBtn?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    alert("Login gagal: " + err.message);
  }
});

logoutBtn?.addEventListener("click", () => signOut(auth).catch(console.error));
refreshBtn?.addEventListener("click", loadEvents);
resetBtn?.addEventListener("click", resetForm);
newEventBtn?.addEventListener("click", resetForm);
eventForm?.addEventListener("submit", saveEvent);
eventForm?.addEventListener("input", updatePreviewFromForm);
uploadPosterBtn?.addEventListener("click", openUpload);

tableBody?.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-delete]");
  const dupBtn = e.target.closest("[data-duplicate]");
  if (editBtn) {
    const slug = editBtn.dataset.edit;
    const data = eventsCache.get(slug);
    if (data) {
      editingSlug = slug;
      fillForm(data);
    } else {
      alert("Data event tidak ditemukan di cache.");
    }
  }
  if (delBtn) {
    deleteEvent(delBtn.dataset.delete);
  }
  if (dupBtn) {
    const slug = dupBtn.dataset.duplicate;
    const data = eventsCache.get(slug);
    if (data) {
      const clone = { ...data };
      delete clone.id;
      clone.slug = "";
      editingSlug = null;
      fillForm(clone);
    }
  }
});

// === Auth guard ===
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    isAdmin = false;
    setDashboardVisible(false);
    setGuard("Silakan login dengan akun admin.");
    userInfo.textContent = "Belum login";
    loginBtn?.classList.remove("hidden");
    logoutBtn?.classList.add("hidden");
    return;
  }

  loginBtn?.classList.add("hidden");
  logoutBtn?.classList.remove("hidden");
  userInfo.textContent = user.email || user.uid;
  setGuard("Memeriksa hak akses admin...");

  try {
    isAdmin = await requireAdmin(user);
  } catch (err) {
    console.error(err);
    isAdmin = false;
  }

  adminStatus.textContent = isAdmin ? "admin" : "bukan admin";
  adminStatus.className = isAdmin ? "badge green" : "badge gray";

  if (!isAdmin) {
    setDashboardVisible(false);
    setGuard("Akun ini tidak memiliki akses admin. Minta panitia menambahkan custom claim admin.", false);
    return;
  }

  setGuard("Akses admin diberikan.", true);
  setDashboardVisible(true);
  resetForm();
  loadEvents();
  initCloudinaryWidget();
});
