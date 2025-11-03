// src/config/firebaseAdmin.js
import admin from "firebase-admin";

// Use a service account JSON or env var.
// If using JSON file:
import serviceAccount from "../secrets/serviceAccountKey.json" assert { type: "json" };

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
