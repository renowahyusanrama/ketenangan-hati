// set-admin.js - Set custom claim admin untuk akun tertentu.
// Pakai: node set-admin.js email@example.com
// Env opsional:
//   ADMIN_EMAIL=... SERVICE_ACCOUNT=./serviceAccountKey.json node set-admin.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Email target dari argumen atau env
const email = process.argv[2] || process.env.ADMIN_EMAIL;
if (!email) {
  console.error('Harap isi email admin. Contoh: node set-admin.js email@example.com');
  process.exit(1);
}

// Lokasi file service account
const keyPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error(`serviceAccountKey.json tidak ditemukan di: ${keyPath}`);
  console.error('Unduh dari Firebase Console > Project Settings > Service accounts > Generate new private key');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

async function main() {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Berhasil set claim admin untuk ${email}`);
  console.log('Silakan logout/login ulang di admin.html agar token baru terambil.');
}

main().catch((err) => {
  console.error('Gagal set admin:', err.message || err);
  process.exit(1);
});
