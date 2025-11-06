// src/jobs/birthdayNotifier.js
import cron from "node-cron";
import User from "../Models/userSchema.js";
import { sendToTokens } from "../utils/push.js";
import { saveNotificationsForUsers, saveNotificationForUser } from "../utils/saveNotification.js";

/** Return today's day & month in IST */
function getTodayIST() {
  const nowIST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  return { day: nowIST.getDate(), month: nowIST.getMonth() + 1 };
}

export async function sendBirthdayNotifications() {
  const { day, month } = getTodayIST();

  // All active users (for both: find birthday people + who to broadcast to)
  const users = await User.find(
    { isActive: true },
    { fullName: 1, birthDate: 1, deviceTokens: 1 } // projection
  );

  // Find who has birthday today (IST)
  const birthdayUsers = users.filter((u) => {
    if (!u.birthDate) return false;
    const bd = new Date(u.birthDate);
    return bd.getDate() === day && bd.getMonth() + 1 === month;
  });

  if (birthdayUsers.length === 0) {
    console.log("🎂 No birthdays today (IST).");
    return;
  }

  console.log(`🎂 Birthdays today: ${birthdayUsers.map(u => u.fullName).join(", ")}`);

  // For each birthday user:
  for (const bUser of birthdayUsers) {
    const bTokens = Array.isArray(bUser.deviceTokens) ? bUser.deviceTokens : [];

    // 1) PERSONAL push to the birthday user (if they have tokens)
    if (bTokens.length) {
      await sendToTokens({
        tokens: bTokens,
        title: "🎉 Happy Birthday!",
        body: `Wishing you a wonderful day, ${bUser.fullName}!`,
        data: {
          type: "birthday",
          userId: String(bUser._id),
          scope: "self", // custom flag
        },
      });
    }

    // Store the personal notification in DB (even if no tokens, so it shows in in-app bell)
    await saveNotificationForUser({
      userId: bUser._id,
      title: "🎉 Happy Birthday!",
      message: `Wishing you a wonderful day, ${bUser.fullName}!`,
      type: "birthday",
    });

    // 2) BROADCAST to all other active users (exclude birthday user)
    const others = users.filter((u) => String(u._id) !== String(bUser._id));
    const otherUserIds = others.map((u) => u._id);
    const otherTokens = others.flatMap((u) => u.deviceTokens || []);

    const broadcastTitle = "🎂 Team Birthday";
    const broadcastBody = `It's ${bUser.fullName}'s birthday today—send your wishes!`;

    if (otherTokens.length) {
      await sendToTokens({
        tokens: otherTokens,
        title: broadcastTitle,
        body: broadcastBody,
        data: {
          type: "birthday",
          birthdayUserId: String(bUser._id),
          scope: "broadcast",
        },
      });
    }

    // Store broadcast notifications (one per "other" user)
    await saveNotificationsForUsers({
      userIds: otherUserIds,
      title: broadcastTitle,
      message: broadcastBody,
      type: "birthday",
    });
  }

  console.log("✅ Birthday push + DB notifications completed.");
}

/** Schedule at 09:05 IST every day */
export function scheduleBirthdayJob() {
  cron.schedule("5 9 * * *", sendBirthdayNotifications, {
    timezone: "Asia/Kolkata",
  });
  console.log("⏰ Birthday job scheduled for 09:05 IST daily");
}
