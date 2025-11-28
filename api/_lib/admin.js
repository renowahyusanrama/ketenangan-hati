const admin = require("firebase-admin");

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env is missing");
  const credential =
    typeof raw === "string"
      ? admin.credential.cert(JSON.parse(raw))
      : admin.credential.applicationDefault();
  return admin.initializeApp({ credential });
}

function getDb() {
  return getApp().firestore();
}

module.exports = { admin, getDb };
