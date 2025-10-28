import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin/superadmin
    assignedTo: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    ],

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "review", "done", "blocked"],
      default: "open",
    },
    deadline: Date,

    comments: [
      {
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    attachments: [{ name: String, url: String }],

    logs: [
      {
        action: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        extra: Object,
      },
    ],
    // models/Task.js
deadlineNotified: { type: Boolean, default: false },
assignedNotified: { type: Boolean, default: false },

  },
  
  { timestamps: true }
);

TaskSchema.index({ assignedTo: 1, status: 1 });

const Task = mongoose.model("Task", TaskSchema);

export default Task;
