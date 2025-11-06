import express from "express";
import User from "../Models/userSchema.js";
import SubCompany from "../Models/SubCompany.js";
import Client from "../Models/Client.js";
import Task from "../Models/Task.js";
import TaskAssignment from "../Models/TaskAssignment.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import EmailOtp from "../Models/EmailOtp.js";
import { sendEmailVerificationOtp } from "../utils/emailService.js";
import { parseBirthDate } from "./_helpers/date.js";

   export const registerUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      city,
      state,
      role,
      subCompany,
      password,
      birthDate, // ✅ new
    } = req.body;

    let subCompanyId = null;
    if (subCompany && mongoose.Types.ObjectId.isValid(subCompany)) {
      subCompanyId = subCompany;
    }

    // Avatar upload (if file present via multer)
    let avatarUrl = null;
    if (req.file) {
      avatarUrl = `/uploads/${req.file.filename}`;
    }

    // Basic validation
    if (!fullName || !email || !role || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, role, and password are required.",
      });
    }

    if (!["SUPER_ADMIN", "ADMIN", "TEAM_MEMBER", "CLIENT"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role specified." });
    }

    // Check for existing user by email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already in use." });
    }

    // Optional: guard phone uniqueness if provided
    if (phone) {
      const phoneInUse = await User.findOne({ phone });
      if (phoneInUse) {
        return res.status(409).json({ success: false, message: "Phone already in use." });
      }
    }

    // Parse birthDate if provided
    const parsedBirthDate = parseBirthDate(birthDate);

    // Hash password
    const hashedPassword = await User.hashPassword(password);

    // Create and save user
    const newUser = new User({
      fullName,
      email,
      phone,
      city,
      state,
      role,
      subCompany: subCompanyId,
      passwordHash: hashedPassword,
      avatarUrl,
      birthDate: parsedBirthDate, // ✅ store
    });

    const savedUser = await newUser.save();

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      userId: savedUser._id,
      avatar: avatarUrl,
      birthDate: savedUser.birthDate, // optional to return
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during registration.",
      error: err.message,
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { fullName, password } = req.body;

    // 🧩 Validate input
    if (!fullName || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name and password are required.",
      });
    }

    // 🧩 Find user (case-insensitive)
    const user = await User.findOne({
      fullName: { $regex: new RegExp(`^${fullName}$`, "i") },
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid name or password.",
      });
    }

    // 🧩 Verify password
    const isMatch = await user.verifyPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid name or password.",
      });
    }

    // 🧩 Generate JWT Token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // 🧩 Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // 🧩 Cookie options
    const cookieOptions = {
      httpOnly: true, // ✅ can't be accessed via JS
      secure: process.env.NODE_ENV === "production", // ✅ HTTPS only in prod
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/", // cookie available for entire site
    };

    // 🧩 Send cookie + response
    res
      .cookie("auth_token", token, cookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Login successful.",
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          subCompany: user.subCompany,
          avatarUrl: user.avatarUrl,
        },
      });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during login.",
      error: err.message,
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    // 🧩 Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided or invalid format.",
      });
    }

    const token = authHeader.split(" ")[1];

    // 🧩 Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret"
    );

    // 🧩 Find user by ID
    const user = await User.findById(decoded.userId).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // 🧩 Send user data
    return res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user.",
      error: err.message,
    });
  }
};

// ✅ Get all users where role = TEAM_MEMBER
export const getAllTeamMembers = async (req, res) => {
  try {
    // 🧩 Fetch users with role TEAM_MEMBER
    const teamMembers = await User.find({ role: "TEAM_MEMBER" }).select(
      "-passwordHash" // exclude sensitive field
    );

    // 🧩 If no team members found
    if (!teamMembers || teamMembers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No team members found.",
      });
    }

    // 🧩 Success response
    return res.status(200).json({
      success: true,
      count: teamMembers.length,
      teamMembers,
    });
  } catch (err) {
    console.error("Error fetching team members:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching team members.",
      error: err.message,
    });
  }
};

export const updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid team member ID." });
    }

    const existingMember = await User.findOne({ _id: id, role: "TEAM_MEMBER" }).select("+passwordHash");
    if (!existingMember) {
      return res.status(404).json({ success: false, message: "Team member not found." });
    }

    const { fullName, email, phone, city, state, subCompany, password, role, birthDate } = req.body;

    // 🧩 Avatar upload
    let avatarUrl = existingMember.avatarUrl;
    if (req.file) {
      avatarUrl = `/uploads/${req.file.filename}`;
    }

    // 🧩 Optional uniqueness checks if email/phone change
    if (email && email !== existingMember.email) {
      const emailInUse = await User.findOne({ email });
      if (emailInUse) {
        return res.status(409).json({ success: false, message: "Email already in use." });
      }
    }
    if (phone && phone !== existingMember.phone) {
      const phoneInUse = await User.findOne({ phone });
      if (phoneInUse) {
        return res.status(409).json({ success: false, message: "Phone already in use." });
      }
    }

    // 🔐 Update password if provided
    let passwordHash = existingMember.passwordHash;
    if (password && password.trim().length > 0) {
      passwordHash = await User.hashPassword(password);
    }

    // 🗓️ Parse birthDate (accepts empty to unset)
    const parsedBirthDate = birthDate === "" ? null : parseBirthDate(birthDate);

    // 🧩 Update fields
    if (fullName) existingMember.fullName = fullName;
    if (email) existingMember.email = email;
    if (phone) existingMember.phone = phone;
    if (city) existingMember.city = city;
    if (state) existingMember.state = state;
    if (typeof parsedBirthDate !== "undefined") existingMember.birthDate = parsedBirthDate;
    if (subCompany) existingMember.subCompany = subCompany;
    existingMember.avatarUrl = avatarUrl;
    existingMember.passwordHash = passwordHash;
    if (role) existingMember.role = role;

    const updatedMember = await existingMember.save();

    return res.status(200).json({
      success: true,
      message: "Team member updated successfully.",
      teamMember: updatedMember,
    });
  } catch (err) {
    console.error("Update team member error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while updating team member.",
      error: err.message,
    });
  }
};

export const updateSuperAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Super Admin ID." });
    }

    const existingSuperAdmin = await User.findOne({ _id: id, role: "SUPER_ADMIN" }).select("+passwordHash");
    if (!existingSuperAdmin) {
      return res.status(404).json({ success: false, message: "Super Admin not found." });
    }

    const { fullName, email, phone, city, state, password, role, birthDate } = req.body;

    // 🧾 Avatar upload
    let avatarUrl = existingSuperAdmin.avatarUrl;
    if (req.file) {
      avatarUrl = `/uploads/${req.file.filename}`;
    }

    // Optional uniqueness checks if email/phone change
    if (email && email !== existingSuperAdmin.email) {
      const emailInUse = await User.findOne({ email });
      if (emailInUse) {
        return res.status(409).json({ success: false, message: "Email already in use." });
      }
    }
    if (phone && phone !== existingSuperAdmin.phone) {
      const phoneInUse = await User.findOne({ phone });
      if (phoneInUse) {
        return res.status(409).json({ success: false, message: "Phone already in use." });
      }
    }

    // 🔐 Handle password update
    let passwordHash = existingSuperAdmin.passwordHash;
    if (password && password.trim().length > 0) {
      passwordHash = await User.hashPassword(password);
    }

    // 🗓️ Parse birthDate
    const parsedBirthDate = birthDate === "" ? null : parseBirthDate(birthDate);

    // 🧩 Update fields
    if (fullName) existingSuperAdmin.fullName = fullName;
    if (email) existingSuperAdmin.email = email;
    if (phone) existingSuperAdmin.phone = phone;
    if (city) existingSuperAdmin.city = city;
    if (state) existingSuperAdmin.state = state;
    if (typeof parsedBirthDate !== "undefined") existingSuperAdmin.birthDate = parsedBirthDate;
    existingSuperAdmin.avatarUrl = avatarUrl;
    existingSuperAdmin.passwordHash = passwordHash;
    if (role) existingSuperAdmin.role = role;

    const updatedSuperAdmin = await existingSuperAdmin.save();

    return res.status(200).json({
      success: true,
      message: "Super Admin updated successfully.",
      superAdmin: updatedSuperAdmin,
    });
  } catch (err) {
    console.error("Update Super Admin error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while updating Super Admin.",
      error: err.message,
    });
  }
};

// ✅ Delete a team member by ID
export const deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    // 🧩 Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid team member ID.",
      });
    }

    // 🧩 Check if user exists and is a TEAM_MEMBER
    const member = await User.findOne({ _id: id, role: "TEAM_MEMBER" });
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Team member not found.",
      });
    }

    // 🧩 Delete user
    await User.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Team member deleted successfully.",
    });
  } catch (err) {
    console.error("Delete team member error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting team member.",
      error: err.message,
    });
  }
};


export const getTeamMemberDetails = async (req, res) => {
  try {
    const { teamMemberId } = req.params;

    // ✅ 1. Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(teamMemberId)) {
      return res.status(400).json({ success: false, message: "Invalid Team Member ID" });
    }

    const teamMemberObjectId = new mongoose.Types.ObjectId(teamMemberId);

    // ✅ 2. Fetch Team Member
    const teamMember = await User.findById(teamMemberObjectId)
      .select("fullName email avatarUrl role subCompanyIds")
      .lean();

    if (!teamMember) {
      return res.status(404).json({ success: false, message: "Team Member not found" });
    }

    // ✅ 3. Fetch all assignments linked to this team member
    const assignments = await TaskAssignment.find({ user: teamMemberObjectId })
      .populate({
        path: "task",
        populate: {
          path: "client",
          select: "name businessName meta.subCompanyIds meta.subCompanyNames",
        },
        select: "title description status client",
      })
      .lean();

    // If no assignments found
    if (!assignments.length) {
      return res.json({
        success: true,
        teamMember,
        subCompanies: [],
        clients: [],
      });
    }

    // ✅ 4. Group tasks by client
    const clientMap = {};
    const subCompanyIdSet = new Set();

    for (const a of assignments) {
      const task = a.task;
      const client = task?.client;
      if (!client) continue;

      const clientId = client._id.toString();
      const metaSubCompanyIds = client.meta?.subCompanyIds || [];
      const metaSubCompanyNames = client.meta?.subCompanyNames || [];

      // collect subcompany IDs
      for (const id of metaSubCompanyIds) {
        if (mongoose.Types.ObjectId.isValid(id)) {
          subCompanyIdSet.add(id.toString());
        }
      }

      if (!clientMap[clientId]) {
        clientMap[clientId] = {
          _id: client._id,
          name: client.name,
          businessName: client.businessName,
          subCompanyIds: metaSubCompanyIds,
          subCompanyNames: metaSubCompanyNames,
          tasks: [],
        };
      }

      clientMap[clientId].tasks.push({
        _id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        assignmentStatus: a.status,
        progress: a.progress,
      });
    }

    const clientsData = Object.values(clientMap);

    // ✅ 5. Fetch SubCompany details for all meta.subCompanyIds
    let subCompanies = [];
    if (subCompanyIdSet.size > 0) {
      subCompanies = await SubCompany.find({
        _id: { $in: Array.from(subCompanyIdSet) },
      })
        .select("_id name logoUrl")
        .lean();
    }

    // ✅ 6. Response
    return res.json({
      success: true,
      teamMember,
      subCompanies,
      clients: clientsData,
    });

  } catch (err) {
    console.error("❌ Error fetching team member details:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
export const saveFcmToken = async (req, res) => {
  try {
    const { userId, fcmToken, type } = req.body; // type = "lead" or "client"
    if (!userId || !fcmToken) return res.status(400).json({ message: "Missing data" });

    if (type === "lead") {
      await Lead.findByIdAndUpdate(userId, { fcmToken }, { new: true });
    } else if (type === "client") {
      await Client.findByIdAndUpdate(userId, { fcmToken }, { new: true });
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    res.status(200).json({ success: true, message: "Token saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

const randomOtp = () => (Math.floor(100000 + Math.random() * 900000)).toString();

export const registerInit = async (req, res) => {
  try {
    const {
      fullName, email, phone, city, state, role, subCompany, password
    } = req.body;

    // Basic validation
    if (!fullName || !email || !role || !password) {
      return res.status(400).json({ success: false, message: "Full name, email, role, and password are required." });
    }
    if (!["SUPER_ADMIN","ADMIN","TEAM_MEMBER","CLIENT"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role specified." });
    }

    // Duplicate check
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already in use." });
    }

    // Avatar (store path if uploaded, we'll move/attach later if you need)
    let avatarUrl = null;
    if (req.file) {
      avatarUrl = `/uploads/${req.file.filename}`;
    }

    // Prepare payload to materialize after OTP verification
    const hashedPassword = await User.hashPassword(password);
    const payload = {
      fullName, email, phone, city, state, role,
      subCompany: (subCompany && mongoose.Types.ObjectId.isValid(subCompany)) ? subCompany : null,
      passwordHash: hashedPassword,
      avatarUrl
    };

    // Create OTP doc
    const otp = randomOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

    // One per email: remove old ones (optional but nice)
    await EmailOtp.deleteMany({ email });

    const otpDoc = await EmailOtp.create({
      email,
      otpHash,
      expiresAt,
      payload
    });

    // Send email
    const mailed = await sendEmailVerificationOtp(email, otp, fullName);
    if (!mailed) {
      // if email fails, clean doc
      await EmailOtp.deleteOne({ _id: otpDoc._id });
      return res.status(500).json({ success: false, message: "Failed to send verification email. Please try again." });
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent to email.",
      tempId: otpDoc._id, // return for client to verify
      expiresInSec: OTP_TTL_MIN * 60
    });

  } catch (err) {
    console.error("registerInit error:", err);
    return res.status(500).json({ success: false, message: "Server error.", error: err.message });
  }
};


export const registerVerify = async (req, res) => {
  try {
    const { tempId, email, otp } = req.body;
    if (!tempId || !email || !otp) {
      return res.status(400).json({ success: false, message: "tempId, email and otp are required." });
    }

    const record = await EmailOtp.findById(tempId);
    if (!record || record.email !== email) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification session." });
    }

    if (record.expiresAt < new Date()) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, message: "OTP expired. Please start again." });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(429).json({ success: false, message: "Too many attempts. Please restart." });
    }

    const ok = await bcrypt.compare(otp, record.otpHash);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: "Incorrect OTP." });
    }

    // Create user
    const {
      fullName, phone, city, state, role, subCompany, passwordHash, avatarUrl
    } = record.payload;

    // Final duplicate guard (race)
    const exists = await User.findOne({ email });
    if (exists) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const user = await User.create({
      fullName, email, phone, city, state, role, subCompany, passwordHash, avatarUrl,
      isEmailVerified: true
    });

    await EmailOtp.deleteOne({ _id: record._id });

    return res.status(201).json({
      success: true,
      message: "User registered and verified.",
      userId: user._id,
      avatar: avatarUrl
    });

  } catch (err) {
    console.error("registerVerify error:", err);
    return res.status(500).json({ success: false, message: "Server error.", error: err.message });
  }
};


export const registerResendOtp = async (req, res) => {
  try {
    const { tempId, email } = req.body;
    if (!tempId || !email) {
      return res.status(400).json({ success: false, message: "tempId and email are required." });
    }
    const record = await EmailOtp.findById(tempId);
    if (!record || record.email !== email) {
      return res.status(400).json({ success: false, message: "Invalid verification session." });
    }

    // new OTP
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    record.otpHash = await bcrypt.hash(otp, 10);
    record.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    record.attempts = 0;
    await record.save();

    const mailed = await sendEmailVerificationOtp(email, otp, record.payload?.fullName);
    if (!mailed) {
      return res.status(500).json({ success: false, message: "Failed to send OTP." });
    }

    return res.status(200).json({ success: true, message: "OTP resent.", expiresInSec: 10 * 60 });

  } catch (err) {
    console.error("registerResendOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error.", error: err.message });
  }
};



export const getAllMembers = async (req, res) => {
  try {
    console.log("📥 Fetching all members with query:", req.query);

    const { role, subCompany, isActive, page = 1, limit = 20 } = req.query;

    // --- Build dynamic filter ---
    const filter = {};
    if (role) filter.role = role;
    if (subCompany) filter.subCompany = subCompany;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    // --- Pagination setup ---
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // --- Fetch users excluding sensitive fields ---
    const users = await User.find(filter)
      .select("-passwordHash -deviceTokens") // exclude sensitive fields
      .populate("subCompany", "name") // populate subCompany name if needed
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: "Members fetched successfully",
      total: totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit),
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching members:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching members",
      error: error.message,
    });
  }
};


// src/controllers/device.controller.js (append)
export const removeDeviceToken = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ success: false, message: "Missing user or token." });
    }
    await User.findByIdAndUpdate(userId, { $pull: { deviceTokens: token } });
    return res.json({ success: true, message: "Device token removed." });
  } catch (e) {
    console.error("removeDeviceToken error:", e);
    res.status(500).json({ success: false, message: "Failed to remove token." });
  }
};
