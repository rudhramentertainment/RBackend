// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true },
  city: { type: String },
  state: { type: String },
  role: { type: String, enum: ["SUPER_ADMIN","ADMIN","TEAM_MEMBER","CLIENT"], required: true },
  subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany", required: false, default: null },

  passwordHash: { type: String, required: true, select: false },
  avatarUrl: { type: String },
  birthDate: { type: Date },
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
  deviceTokens: { type: [String], default: [] },

  // Soft-delete/archive
  isArchived: { type: Boolean, default: false, index: true },
  passwordChangedAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  archiveReason: { type: String, default: null },

  // Employee ID (RE-N25-001) - only for ADMIN & TEAM_MEMBER
  employeeId: { type: String, index: true, unique: true, sparse: true },
  // Hash of employeeId (sha256)
  employeeIdHash: { type: String, default: null, select: false },
  // optional stored QR image path/url
  employeeQrUrl: { type: String, default: null },
   aadharUrl: { type: String, default: null },   // uploaded aadhar image (optional)
  idCardUrl: { type: String, default: null },   // generated final ID card image path/url

  // previously barcode fields removed
}, { timestamps: true });

// Password helpers
UserSchema.methods.verifyPassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

UserSchema.statics.hashPassword = async function (pw) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pw, salt);
};

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, subCompany: 1 });

const User = mongoose.model("User", UserSchema);

export default User;
