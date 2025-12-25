const { admin } = require("./admin");

async function getUserFromAuthHeader(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    return null;
  }
}

module.exports = { getUserFromAuthHeader };
