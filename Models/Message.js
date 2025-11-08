import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: String,
    mime: String,
    size: Number,
    width: Number,
    height: Number,
    thumbUrl: String,
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    message: { type: String, default: "" },

    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    receivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    kind: { type: String, enum: ["text", "image", "file", "mixed"], default: "text" },

    attachments: [FileSchema],

    readBy: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, readAt: Date }],

    channel: { type: String, enum: ["direct", "group"], default: "direct" },
    groupKey: { type: String },

    // NEW: used to replace optimistic items on clients
    clientId: { type: String, index: true },
  },
  { timestamps: true }
);

MessageSchema.index({ channel: 1, groupKey: 1, createdAt: 1 });
MessageSchema.index({ sender: 1, receivers: 1, createdAt: 1 });

export default mongoose.model("Message", MessageSchema);
