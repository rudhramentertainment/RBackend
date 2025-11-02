// notifier.js
import admin from "firebase-admin";
import axios from "axios";

// Initialize admin in your main server once (not here).
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

/**
 * Send push to tokens (multicast)
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object}} payload
 */
export async function sendPushToTokens(tokens = [], payload = {}) {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };

  // Firebase message
  const message = {
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data || {},
  };

  const res = await admin.messaging().sendMulticast(message);
  // Optionally remove invalid tokens from DB by checking res.responses
  return res;
}

/**
 * Send SMS via Infobip/Twilio (placeholder)
 * Replace with your provider's API call (Infobip, Twilio, etc.)
 */
export async function sendSms(phone, text) {
  // Example: Infobip (pseudo)
  // const url = 'https://api.infobip.com/sms/1/text/single';
  // const res = await axios.post(url, {...}, { headers: { Authorization: `App ${INFObip_API_KEY}`, 'Content-Type': 'application/json' }});
  // return res.data;

  // For demo, we'll just log and return success:
  console.log(`(SMS) to ${phone}: ${text}`);
  return { ok: true };
}
