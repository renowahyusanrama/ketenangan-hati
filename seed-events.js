// seed-events.js - masukkan event contoh ke Firestore agar tampil di homepage & admin
// Pakai: node seed-events.js
// Opsional env:
//   SERVICE_ACCOUNT=./serviceAccountKey.json

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const keyPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error(`File service account tidak ditemukan di ${keyPath}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

// Data seed sama seperti event awal di halaman
const events = require('./events_seed_data.json');

async function main() {
  const db = admin.firestore();
  const batch = db.batch();
  events.forEach((e) => {
    const ref = db.collection('events').doc(e.slug);
    batch.set(ref, {
      ...e,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`Seed ${events.length} event selesai.`);
}

main().catch((err) => {
  console.error('Gagal seed:', err);
  process.exit(1);
});
