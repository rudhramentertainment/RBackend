// models/EmailOtp.js
import mongoose from "mongoose";

const EmailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  payload: { type: Object, required: true }, // user fields to create upon verify
  avatarTempPath: { type: String, default: null }, // if you uploaded file temporarily
}, { timestamps: true });

EmailOtpSchema.index({ email: 1 });
EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-clean

export default mongoose.model("EmailOtp", EmailOtpSchema);
