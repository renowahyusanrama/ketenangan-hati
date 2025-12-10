// backfill_seats.js - Sinkronisasi seatsUsed (total/reguler/VIP) berdasarkan orders berstatus paid.
// Pakai: SERVICE_ACCOUNT=./serviceAccountKey.json node backfill_seats.js
// Kalau tidak set SERVICE_ACCOUNT, script akan cari ./serviceAccountKey.json di root.

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const keyPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error(`serviceAccountKey.json tidak ditemukan di: ${keyPath}`);
  console.error('Set env SERVICE_ACCOUNT atau letakkan file di root. File bisa diunduh dari Firebase Console > Project Settings > Service accounts.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

const db = admin.firestore();

async function main() {
  console.log("Mengambil orders berstatus PAID...");
  const snap = await db.collection("orders").where("status", "==", "paid").get();
  console.log(`Total order paid: ${snap.size}`);

  const counters = new Map();
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const eventId = data.eventId;
    if (!eventId) return;
    const type = (data.ticketType || "regular").toLowerCase() === "vip" ? "vip" : "regular";
    const current = counters.get(eventId) || { reg: 0, vip: 0 };
    if (type === "vip") current.vip += 1;
    else current.reg += 1;
    counters.set(eventId, current);
  });

  console.log(`Akan update ${counters.size} event...`);
  let batch = db.batch();
  let opCount = 0;
  let batchCount = 0;

  for (const [eventId, count] of counters.entries()) {
    const total = (count.reg || 0) + (count.vip || 0);
    const ref = db.collection("events").doc(eventId);
    batch.update(ref, {
      seatsUsed: total,
      seatsUsedRegular: count.reg || 0,
      seatsUsedVip: count.vip || 0,
      seatsSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    opCount += 1;
    if (opCount % 400 === 0) {
      await batch.commit();
      batch = db.batch();
      batchCount += 1;
      console.log(`Batch ${batchCount} terkirim (400 update).`);
    }
  }

  if (opCount % 400 !== 0) {
    await batch.commit();
    batchCount += 1;
    console.log(`Batch ${batchCount} terkirim (${opCount % 400} update).`);
  }

  console.log("Selesai. Event tersinkron:", counters.size);
}

main()
  .catch((err) => {
    console.error("Gagal sinkron seats:", err?.message || err);
    process.exit(1);
  })
  .then(() => process.exit(0));
