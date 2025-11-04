// src/jobs/taskReminders.cron.js
import cron from "node-cron";
import Task from "../Models/Task.js";
import {
  pushToUsers,
  extractAllAssignees,
  deadlineTitle,
  deadlineBody,
} from "../service/notification.service.js";

const TZ = "Asia/Kolkata";

export function registerTaskReminderCron() {
  // 09:30 IST every day
  cron.schedule("30 9 * * *", async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const oneDay = 24 * 60 * 60 * 1000;

      const tasks = await Task.find({
        status: { $in: ["open", "in_progress", "review"] },
        deadline: { $ne: null },
      });

      for (const t of tasks) {
        const due = new Date(t.deadline);
        const days = Math.floor((due - startOfDay) / oneDay); // negative => overdue
        if (!(days === 3 || days === 1 || days === 0 || days < 0)) continue;

        const userIds = extractAllAssignees(t);
        if (!userIds.length) continue;

        const when =
          days > 1 ? "Upcoming deadline"
          : days === 1 ? "Due tomorrow"
          : days === 0 ? "Due today"
          : "Overdue";

        await pushToUsers({
          userIds,
          title: deadlineTitle(t, when),
          body: deadlineBody(t, days),
          data: {
            type: "task_deadline",
            taskId: String(t._id),
            title: t.title || "",
            deadline: t.deadline ? String(t.deadline) : "",
            days: String(days),
          },
        });
      }
    } catch (e) {
      console.error("task reminder cron error:", e);
    }
  }, { timezone: TZ });

  console.log("Task reminder cron registered @ 09:30 IST (push only)");
}
