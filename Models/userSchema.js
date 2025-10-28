import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Roles } from "./enums.js";

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true }, // optional but unique if present
    city : { type: String },
    state : { type: String},
    role: { type: String, enum: Roles, required: true },
    subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany",required : false , default:null}, // for employees if tied to a brand
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: { type: String },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    deviceTokens: { type: [String], default: [] },
}, { timestamps: true });

UserSchema.methods.verifyPassword = function(pw) {
    return bcrypt.compare(pw, this.passwordHash);
};

UserSchema.statics.hashPassword = async function(pw) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(pw, salt);
};

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, subCompany: 1 });

const User = mongoose.model("User", UserSchema);

export default User