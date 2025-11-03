// config/firebaseAdmin.js (ESM)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_KEY_PATH = path.join(__dirname, "../secrets/serviceAccountKey.json");

function loadCreds() {
  const b64 = process.env.SERVICE_ACCOUNT_BASE64;
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (b64) {
    try {
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json);
    } catch {
      throw new Error("SERVICE_ACCOUNT_BASE64 is invalid base64 or JSON.");
    }
  }

  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
  }

  if (fs.existsSync(LOCAL_KEY_PATH)) {
    try {
      const json = fs.readFileSync(LOCAL_KEY_PATH, "utf8");
      return JSON.parse(json);
    } catch {
      throw new Error("Failed to read secrets/serviceAccountKey.json.");
    }
  }

  throw new Error(
    "No Firebase credentials found. Set SERVICE_ACCOUNT_BASE64 or GOOGLE_SERVICE_ACCOUNT_JSON env, or add secrets/serviceAccountKey.json (ignored by git)."
  );
}

// Initialize once and export the app
export const app = (() => {
  if (!getApps().length) {
    const creds = loadCreds();
    return initializeApp({
      credential: cert(creds),
    });
  }
  return getApps()[0];
})();

export default app;
