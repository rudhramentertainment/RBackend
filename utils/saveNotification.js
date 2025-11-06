// src/utils/saveNotification.js
import Notification from "../Models/Notification.js";

/**
 * Store one notification for multiple users.
 */
export async function saveNotificationsForUsers({ userIds, title, message, type }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const docs = userIds.map((uid) => ({
    user: uid,
    title,
    message,
    type,
    isRead: false, // <-- match the schema
  }));

  await Notification.insertMany(docs);
}

/**
 * Store a single notification for one user (handy helper).
 */
export async function saveNotificationForUser({ userId, title, message, type, deviceToken }) {
  await Notification.create({
    user: userId,
    title,
    message,
    type,
    isRead: false,
    deviceToken: deviceToken || undefined,
  });
}
