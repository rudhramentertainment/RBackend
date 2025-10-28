import mongoose from "mongoose";

const TaskAssignmentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // team member specific status
    status: {
      type: String,
      enum: ["not_started", "in_progress", "review", "done", "blocked"],
      default: "not_started",
    },

    notes: [
      {
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    logs: [
      {
        action: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        extra: Object,
      },
    ],

    // Optional extra fields (e.g. progress, estimated time, etc.)
    progress: {
      type: Number, // 0-100%
      default: 0,
    },
  },
  { timestamps: true }
);

TaskAssignmentSchema.index({ user: 1, task: 1 });

const TaskAssignment = mongoose.model("TaskAssignment", TaskAssignmentSchema);

export default TaskAssignment;
