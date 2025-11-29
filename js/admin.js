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
  doc as firestoreDoc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  query,
  limit,
  startAfter,
  where,
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
const ordersTableBody = document.querySelector("#ordersTable tbody");
const ordersStatusText = document.getElementById("ordersStatus");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const orderSearch = document.getElementById("orderSearch");
const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const loadMoreOrdersBtn = document.getElementById("loadMoreOrders");
const toggleQrPanelBtn = document.getElementById("toggleQrPanel");
const qrPanel = document.getElementById("qrPanel");
const qrStatus = document.getElementById("qrStatus");
const qrReaderEl = document.getElementById("qrReader");
const qrInput = document.getElementById("qrInput");
const qrSubmitBtn = document.getElementById("qrSubmitBtn");
const qrStopBtn = document.getElementById("qrStopBtn");

let currentUser = null;
let isAdmin = false;
let editingSlug = null;
let cloudinaryWidget = null;
const eventsCache = new Map();
let lastOrderDoc = null;
let ordersLoading = false;
const ORDERS_PAGE_SIZE = 25;
let qrScanner = null;
let qrScanning = false;

async function updateCheckin(orderId, verified) {
  if (!isAdmin || !orderId) return false;
  const ref = firestoreDoc(db, "orders", orderId);
  try {
    await setDoc(
      ref,
      {
        verified: !!verified,
        checkedInAt: verified ? serverTimestamp() : null,
        verifiedAt: verified ? serverTimestamp() : null,
      },
      { merge: true },
    );
    await loadOrders(true);
    return true;
  } catch (err) {
    console.error("Gagal update check-in:", err);
    alert("Gagal update check-in: " + (err?.message || err));
    return false;
  }
}

function setQrStatus(message, isError = false) {
  if (!qrStatus) return;
  qrStatus.textContent = message;
  qrStatus.style.color = isError ? "#f87171" : "#cbd5e1";
}

function extractRefFromQr(text) {
  if (!text) return "";
  const raw = String(text).trim();
  // Jika berupa URL, coba ambil ?ref=
  try {
    const url = new URL(raw);
    const fromParam = url.searchParams.get("ref");
    if (fromParam) return fromParam;
  } catch (err) {
    // bukan URL, lanjut fallback
  }
  const match = raw.match(/ref=([^&]+)/i);
  if (match && match[1]) return decodeURIComponent(match[1]);
  return raw;
}

async function findOrderIdByRef(refValue) {
  const code = (refValue || "").trim();
  if (!code) return null;

  // 1) coba akses langsung dokumen dengan ID = code
  try {
    const directRef = firestoreDoc(db, "orders", code);
    const snap = await getDoc(directRef);
    if (snap.exists()) return directRef.id;
  } catch (err) {
    console.warn("Lookup direct doc gagal:", err?.message || err);
  }

  // 2) cari berdasarkan field reference atau merchantRef
  try {
    const col = collection(db, "orders");
    const byRef = query(col, where("reference", "==", code), limit(1));
    let snap = await getDocs(byRef);
    if (snap?.docs?.length) return snap.docs[0].id;

    const byMerchant = query(col, where("merchantRef", "==", code), limit(1));
    snap = await getDocs(byMerchant);
    if (snap?.docs?.length) return snap.docs[0].id;
  } catch (err) {
    console.error("findOrderIdByRef error:", err?.message || err);
  }

  return null;
}

async function verifyByRef(refValue) {
  const code = (refValue || "").trim();
  if (!code) {
    setQrStatus("Kode/ref kosong.", true);
    return false;
  }
  if (!isAdmin) {
    setQrStatus("Hanya admin yang bisa verifikasi.", true);
    return false;
  }
  setQrStatus(`Memeriksa ref ${code}...`);

  const orderId = await findOrderIdByRef(code);
  if (!orderId) {
    setQrStatus(`Order dengan ref ${code} tidak ditemukan.`, true);
    return false;
  }

  const ok = await updateCheckin(orderId, true);
  setQrStatus(ok ? `Berhasil verifikasi ${code}.` : `Gagal verifikasi ${code}.`, !ok);
  if (ok && qrInput) qrInput.value = "";
  return ok;
}

async function stopQrScan() {
  if (qrScanner && qrScanning) {
    try {
      await qrScanner.stop();
      await qrScanner.clear();
    } catch (err) {
      console.warn("Stop QR scanner:", err?.message || err);
    }
  }
  qrScanner = null;
  qrScanning = false;
  setQrStatus("Scanner berhenti.");
}

async function startQrScan() {
  if (!qrReaderEl) {
    setQrStatus("Elemen scanner tidak tersedia.", true);
    return;
  }
  if (qrScanning) {
    setQrStatus("Scanner sudah aktif.");
    return;
  }
  if (typeof window.Html5Qrcode === "undefined") {
    setQrStatus("Library scanner belum dimuat.", true);
    return;
  }

  try {
    qrScanner = new Html5Qrcode(qrReaderEl.id);
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const ref = extractRefFromQr(decodedText);
        if (!ref) {
          setQrStatus("QR tidak memuat kode ref.", true);
          return;
        }
        await verifyByRef(ref);
      },
      () => {
        // abaikan error scan per frame
      },
    );
    qrScanning = true;
    setQrStatus("Memindai... arahkan kamera ke QR tiket.");
  } catch (err) {
    console.error("QR start error:", err);
    setQrStatus("Tidak bisa memulai kamera: " + (err?.message || err), true);
    qrScanner = null;
    qrScanning = false;
  }
}

function setGuard(message, isOk = false) {
  guardMessage.textContent = message;
  guardMessage.style.color = isOk ? "#4ade80" : "#cbd5e1";
}

function setDashboardVisible(visible) {
  dashboard.classList.toggle("hidden", !visible);
  guardPanel.classList.toggle("hidden", visible);
  if (!visible) {
    adminStatus.textContent = "bukan admin";
    adminStatus.className = "badge gray";
  }
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

function formatDateTime(value) {
  if (!value) return "-";
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch (err) {
    return "-";
  }
}

function formatStatusBadge(status) {
  const map = {
    paid: "green",
    pending: "yellow",
    expired: "gray",
    failed: "red",
    canceled: "red",
    refunded: "blue",
  };
  const cls = map[status?.toLowerCase?.()] || "gray";
  const label = status ? status.toUpperCase() : "-";
  return `<span class="badge ${cls}">${label}</span>`;
}

function formatMethod(order) {
  if (!order) return "-";
  if (order.paymentType === "bank_transfer") {
    const bank = order.bank || order.method || "";
    return bank ? `VA ${String(bank).toUpperCase()}` : "Bank Transfer";
  }
  if (order.paymentType === "qris") return "QRIS";
  return order.method || order.paymentType || "-";
}

async function loadOrders(reset = true) {
  if (!isAdmin) return;
  if (ordersLoading) return;
  ordersLoading = true;

  let existingHtml = "";
  if (ordersTableBody) {
    existingHtml = ordersTableBody.innerHTML;
    if (reset) {
      existingHtml = "";
      ordersTableBody.innerHTML = `<tr><td colspan="8" class="muted">Memuat data...</td></tr>`;
    }
  }
  if (reset) lastOrderDoc = null;

  const statusFilter = (orderStatusFilter?.value || "").toLowerCase();
  const searchTerm = (orderSearch?.value || "").trim().toLowerCase();

  const ref = collection(db, "orders");
  let q = query(ref, orderBy("createdAt", "desc"), limit(ORDERS_PAGE_SIZE));
  if (lastOrderDoc) {
    q = query(ref, orderBy("createdAt", "desc"), startAfter(lastOrderDoc), limit(ORDERS_PAGE_SIZE));
  }

  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    console.warn("loadOrders fallback getDocs:", err?.message || err);
    snap = await getDocs(ref);
  }

  const rows = [];
  snap?.forEach((d) => {
    const data = d.data() || {};
    rows.push({ id: d.id, ...data, _snap: d });
  });

  const filtered = rows.filter((o) => {
    const status = (o.status || "").toLowerCase();
    if (statusFilter && status !== statusFilter) return false;
    if (searchTerm) {
      const haystack = `${o.merchantRef || ""} ${o.reference || ""} ${o.customer?.email || ""} ${o.customer?.name || ""}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  if (ordersTableBody) {
    if (!filtered.length && reset) {
      ordersTableBody.innerHTML = `<tr><td colspan="8" class="muted">Tidak ada transaksi pada filter ini.</td></tr>`;
    } else if (filtered.length) {
      const html = filtered
        .map((o) => {
          const total = Number(o.totalAmount ?? o.amount ?? 0);
          const createdAt = formatDateTime(o.createdAt || o.created_at);
          const verified = o.verified ? "Terverifikasi" : "Belum";
          const verifyBtn =
            (o.status || "").toLowerCase() === "paid"
              ? `<button class="outline" data-checkin="${o.id}" data-verified="${o.verified ? "false" : "true"}">${
                  o.verified ? "Batalkan" : "Verifikasi"
                }</button>`
              : `<span class="muted">-</span>`;
          return `
            <tr>
              <td>${o.merchantRef || o.reference || "-"}</td>
              <td>${o.eventTitle || o.eventId || "-"}</td>
              <td>${o.customer?.name || "-"}<br><span class="muted">${o.customer?.email || ""}</span></td>
              <td>${formatMethod(o)}</td>
              <td>${formatStatusBadge(o.status)}</td>
              <td>${o.verified ? `<span class="badge green">Terverifikasi</span>` : `<span class="badge gray">Belum</span>`}<br>${verifyBtn}</td>
              <td>${formatCurrency(total)}</td>
              <td>${createdAt}</td>
            </tr>
          `;
        })
        .join("");
      ordersTableBody.innerHTML = reset ? html : existingHtml + html;
    } else if (!reset) {
      ordersTableBody.innerHTML = existingHtml || `<tr><td colspan="8" class="muted">Tidak ada transaksi.</td></tr>`;
    }
  }

  if (snap && snap.docs && snap.docs.length) {
    lastOrderDoc = snap.docs[snap.docs.length - 1];
  }
  if (ordersStatusText) {
    ordersStatusText.textContent = `Memuat ${filtered.length} transaksi (batch ${snap?.size || 0}).`;
  }
  if (loadMoreOrdersBtn) {
    const allowPaging = !searchTerm; // saat pencarian aktif, matikan paging agar tidak membingungkan
    loadMoreOrdersBtn.disabled = !allowPaging || !snap || !snap.docs || snap.docs.length < ORDERS_PAGE_SIZE;
  }
  ordersLoading = false;
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
  const image = eventForm.imageUrl?.value?.trim() || "./images/placeholder.jpg";

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
  // force refresh token agar klaim admin terbaru terambil
  const tokenResult = await getIdTokenResult(user, true);
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
        const capacity = Number(e.capacity) || 0;
        const used = Number(e.seatsUsed) || 0;
        const quotaText = capacity ? `${used}/${capacity}` : "∞";
        return `
          <tr>
            <td>${e.title || "-"}</td>
            <td>${e.slug || e.id}</td>
            <td><span class="badge ${statusClass}">${e.status || "draft"}</span></td>
            <td>${e.schedule || "-"}</td>
            <td>${e.location || "-"}</td>
            <td>${formatCurrency(e.amount)}</td>
            <td>${quotaText}</td>
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

  const ref = firestoreDoc(db, "events", slug);
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
    await deleteDoc(firestoreDoc(db, "events", slug));
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
refreshOrdersBtn?.addEventListener("click", () => loadOrders(true));
loadMoreOrdersBtn?.addEventListener("click", () => loadOrders(false));
orderStatusFilter?.addEventListener("change", () => loadOrders(true));
orderSearch?.addEventListener("input", () => loadOrders(true));
toggleQrPanelBtn?.addEventListener("click", () => {
  if (!qrPanel) return;
  const hidden = qrPanel.classList.contains("hidden");
  if (hidden) {
    qrPanel.classList.remove("hidden");
    startQrScan();
  } else {
    qrPanel.classList.add("hidden");
    stopQrScan();
  }
});
qrStopBtn?.addEventListener("click", () => {
  stopQrScan();
  qrPanel?.classList.add("hidden");
});
qrSubmitBtn?.addEventListener("click", () => verifyByRef(qrInput?.value));
qrInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    verifyByRef(qrInput?.value);
  }
});

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

ordersTableBody?.addEventListener("click", (e) => {
  const checkinBtn = e.target.closest("[data-checkin]");
  if (checkinBtn) {
    const id = checkinBtn.dataset.checkin;
    const val = checkinBtn.dataset.verified === "true";
    updateCheckin(id, val);
  }
});

// === Auth guard ===
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    isAdmin = false;
    stopQrScan();
    qrPanel?.classList.add("hidden");
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
    stopQrScan();
    qrPanel?.classList.add("hidden");
    setDashboardVisible(false);
    setGuard("Akun ini tidak memiliki akses admin. Minta panitia menambahkan custom claim admin.", false);
    return;
  }

  setGuard("Akses admin diberikan.", true);
  setDashboardVisible(true);
  resetForm();
  loadEvents();
  loadOrders(true);
  initCloudinaryWidget();
});
