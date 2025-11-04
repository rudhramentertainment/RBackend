// src/services/notification.service.js
import User from "../Models/userSchema.js";
import { sendToTokens, dropInvalidTokens } from "./push.service.js";

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
