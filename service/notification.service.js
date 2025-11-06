// src/services/notification.service.js
import User from "../Models/userSchema.js";
import { sendToTokens, dropInvalidTokens } from "./push.service.js";
import { saveNotificationsForUsers } from "../utils/saveNotification.js";


/** Collect unique FCM tokens for given users */
export async function getUserTokens(userIds = []) {
  if (!userIds || userIds.length === 0) return [];
  const users = await User.find(
    { _id: { $in: userIds } },
    { deviceTokens: 1 }
  );
  const tokens = new Set();
  for (const u of users) {
    (u.deviceTokens || []).forEach(t => t && tokens.add(t));
  }
  return [...tokens];
}

/** Extract all unique assignee userIds from task, including nested service members */
export function extractAllAssignees(task) {
  const a = new Set((task.assignedTo || []).map(String));
  for (const s of task.chosenServices || []) {
    for (const m of s.assignedTeamMembers || []) a.add(String(m));
  }
  return [...a];
}

/** Titles/Bodies */
export function taskAssignTitle(task) {
  return `New task: ${task.title}`;
}
export function taskAssignBody(task, deadline) {
  const d = deadline ? new Date(deadline).toLocaleString("en-IN") : "N/A";
  return `You have been assigned: ${task.title}\nDeadline: ${d}`;
}

export function deadlineTitle(task, when = "Upcoming deadline") {
  return `${when}: ${task.title}`;
}
export function deadlineBody(task, days) {
  const d = task.deadline ? new Date(task.deadline).toLocaleString("en-IN") : "N/A";
  if (days > 1) return `${task.title} is due in ${days} days. Due: ${d}`;
  if (days === 1) return `${task.title} is due tomorrow. Due: ${d}`;
  if (days === 0) return `${task.title} is due today. Due: ${d}`;
  return `${task.title} is overdue by ${Math.abs(days)} day(s). Due: ${d}`;
}

/** Send push to users; auto-remove invalid tokens */
export async function pushToUsers({ userIds, title, body, data = {} }) {
  const tokens = await getUserTokens(userIds);
  if (!tokens.length) return { successCount: 0, failureCount: 0, responses: [] };

  const resp = await sendToTokens({
    tokens,
    title,
    body,
    data: {
      ...data,
      type: data.type || "generic",
    },
  });

  const badTokens = dropInvalidTokens(resp, tokens);
  if (badTokens.length) {
    await User.updateMany(
      { deviceTokens: { $in: badTokens } },
      { $pull: { deviceTokens: { $in: badTokens } } }
    );
    console.log("FCM: removed invalid tokens", badTokens.map(t => t.slice(-10)));
  }

  return resp;
}

export function leadConvertedTitle(lead, client) {
  // Prefer clientId/token as "code" if available
  const code = client?.clientId || lead?.token || "";
  const display = [lead?.name, code].filter(Boolean).join(" • ");
  return `Lead converted to client${display ? `: ${display}` : ""}`;
}

export function leadConvertedBody(lead, client) {
  const lines = [];
  if (client?.clientId) lines.push(`Client Code: ${client.clientId}`);
  if (lead?.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead?.businessName) lines.push(`Business: ${lead.businessName}`);
  if (lead?.businessCategory) lines.push(`Category: ${lead.businessCategory}`);
  return lines.join("\n") || "A lead has been converted to a client.";
}

/**
 * Notify ALL users when a lead is converted to a client.
 * - Saves Notification documents for each user
 * - Sends FCM push to all devices
 * Pass actorId if you want to *exclude* the converter (optional).
 */
export async function notifyAllUsersLeadConverted({ lead, client, actorId = null }) {
  // 1) Get all users (you can filter by active=true if your schema has it)
  const allUsers = await User.find({}, { _id: 1 }).lean();
  let userIds = allUsers.map(u => u._id);

  // Optional: exclude the user who performed the action
  if (actorId) {
    const a = String(actorId);
    userIds = userIds.filter(id => String(id) !== a);
  }

  if (!userIds.length) return;

  // 2) Build notification content
  const title = leadConvertedTitle(lead, client);
  const body = leadConvertedBody(lead, client);

  // 3) Persist notifications for in-app center
  await saveNotificationsForUsers({
    userIds,
    title,
    message: body,
    type: "lead_converted",
  });

  // 4) Push to devices
  await pushToUsers({
    userIds,
    title,
    body,
    data: {
      type: "lead_converted",
      leadId: String(lead?._id || ""),
      clientId: String(client?._id || ""),
      clientCode: String(client?.clientId || ""),
      // Optional fields apps often use to deep-link:
      screen: "client_details",
      params: JSON.stringify({
        clientId: String(client?._id || ""),
        leadId: String(lead?._id || ""),
      }),
    },
  });
}