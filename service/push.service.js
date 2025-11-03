// src/services/push.service.js
import admin from "../config/firebaseAdmin.js";

export const sendToTokens = async ({ tokens, title, body, data = {} }) => {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0, responses: [] };

  const uniqueTokens = [...new Set(tokens)];
  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries({
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      }).map(([k, v]) => [k, String(v ?? "")])
    ),
    tokens: uniqueTokens,
  };

  const resp = await admin.messaging().sendEachForMulticast(message);

  // Detailed logging to find common FCM issues
  resp.responses.forEach((r, idx) => {
    if (!r.success) {
      console.warn("FCM send error", {
        tokenTail: uniqueTokens[idx].slice(-10),
        code: r.error?.code,
        message: r.error?.message,
      });
    }
  });

  return resp;
};

// Helper to detect invalid tokens (to remove from DB)
export const dropInvalidTokens = (resp, tokens) => {
  const bads = [];
  resp.responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (
      code.includes("invalid-registration-token") ||
      code.includes("registration-token-not-registered") ||
      code.includes("mismatch-credential") ||
      code.includes("sender-id-mismatch")
    ) {
      bads.push(tokens[i]);
    }
  });
  return bads;
};