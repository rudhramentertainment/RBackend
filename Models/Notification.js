import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: String,
  message: String,
  type: { type: String, enum: ["task","meeting","birthday","system", "lead_converted",], default:"system" },
  isRead: { type: Boolean, default: false },
  deviceToken: String, // store device token of login user
}, { timestamps:true });

export default mongoose.model("Notification", notificationSchema);
