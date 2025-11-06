// src/utils/push.js
import admin from "../config/firebaseAdmin.js";
import User from "../Models/userSchema.js";

// FCM allows up to 500 tokens in a single multicast
const CHUNK_SIZE = 500;

function chunk(arr, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * Send a multicast push to many tokens with title/body/data.
 * Automatically removes invalid/expired tokens from ALL users.
 *
 * @param {Object} param0
 * @param {string[]} param0.tokens
 * @param {string}   param0.title
 * @param {string}   param0.body
 * @param {Object}   param0.data
 * @returns {Promise<{successCount:number, failureCount:number}>}
 */
export async function sendToTokens({ tokens = [], title, body, data = {} }) {
  const uniqueTokens = uniq(tokens);
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0 };

  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [String(k), String(v ?? "")])
    ),
  };

  let successCount = 0;
  let failureCount = 0;
  const invalidTokensToRemove = [];

  for (const batch of chunk(uniqueTokens)) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      ...message,
    });

    successCount += res.successCount;
    failureCount += res.failureCount;

    // Collect tokens that failed with "not registered" etc.
    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.errorInfo?.code || r.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidTokensToRemove.push(batch[idx]);
        }
      }
    });
  }

  // Clean up invalid tokens across all users
  if (invalidTokensToRemove.length) {
    await User.updateMany(
      { deviceTokens: { $in: invalidTokensToRemove } },
      { $pull: { deviceTokens: { $in: invalidTokensToRemove } } }
    );
  }

  return { successCount, failureCount };
}
