import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String },
    mime: { type: String },
    size: { type: Number },
    width: Number,
    height: Number,
    thumbUrl: String,
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    // text message
    message: { type: String, default: "" },

    // who sent it
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // direct chat: one or more receivers; for group we keep [] and set channel/groupKey
    receivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // "text" | "image" | "file" | "mixed" (text + attachments)
    kind: { type: String, enum: ["text", "image", "file", "mixed"], default: "text" },

    // optional attachments
    attachments: [FileSchema],

    // read receipts (future-proof)
    readBy: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, readAt: Date }],

    // group channel
    channel: { type: String, enum: ["direct", "group"], default: "direct" },
    groupKey: { type: String }, // e.g. "RUDHRAM"
  },
  { timestamps: true }
);

MessageSchema.index({ channel: 1, groupKey: 1, createdAt: 1 });
MessageSchema.index({ sender: 1, receivers: 1, createdAt: 1 });

export default mongoose.model("Message", MessageSchema);
