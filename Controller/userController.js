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
  import { generateEmployeeId, hashEmployeeId, generateAndSaveEmployeeQr } from '../utils/userHelpers.js';
  import IdCardGen from '../utils/idCardGenerator.js';
  import path from 'path';


  export const registerUser = async (req, res) => {
    const debugMode = process.env.NODE_ENV !== 'production';
    try {
      const {
        fullName, email, phone, city, state, role, subCompany, password, birthDate
      } = req.body;

      // avatar file -> req.files?.avatar[0] if using upload.fields
      let avatarUrl = null;
      if (req.file && req.file.fieldname === 'avatar') {
        avatarUrl = `/uploads/${req.file.filename}`;
      } else if (req.files && req.files.avatar && req.files.avatar[0]) {
        avatarUrl = `/uploads/${req.files.avatar[0].filename}`;
      }

      // aadhar file (optional)
      let aadharUrl = null;
      if (req.files && req.files.aadhar && req.files.aadhar[0]) {
        aadharUrl = `/uploads/${req.files.aadhar[0].filename}`;
      } else if (req.file && req.file.fieldname === 'aadhar') {
        // if single-file middleware used for aadhar
        aadharUrl = `/uploads/${req.file.filename}`;
      }

      // validate...
      if (!fullName || !email || !role || !password) {
        return res.status(400).json({ success:false, message: "Full name, email, role, and password are required." });
      }
      if (!["SUPER_ADMIN","ADMIN","TEAM_MEMBER","CLIENT"].includes(role)) {
        return res.status(400).json({ success:false, message: "Invalid role specified." });
      }

      const exists = await User.findOne({ email });
      if (exists) return res.status(409).json({ success:false, message: "Email already in use." });

      const hashedPassword = await User.hashPassword(password);

      const userObj = {
        fullName, email, phone, city, state, role,
        subCompany: (subCompany && mongoose.Types.ObjectId.isValid(subCompany)) ? subCompany : null,
        passwordHash: hashedPassword,
        avatarUrl, birthDate: birthDate || null,
        aadharUrl
      };

      const newUser = new User(userObj);
      const savedUser = await newUser.save();

      // If employee role -> generate id, hash, qr, and idCard image (best-effort)
      if (role === 'ADMIN' || role === 'TEAM_MEMBER') {
        try {
          const employeeId = await generateEmployeeId();
          const employeeIdHash = hashEmployeeId(employeeId);
          savedUser.employeeId = employeeId;
          savedUser.employeeIdHash = employeeIdHash;
          await savedUser.save();

          const qrRel = await generateAndSaveEmployeeQr(savedUser, { content: employeeIdHash });
          savedUser.employeeQrUrl = qrRel;
          await savedUser.save();

          // generate idCard PNG using your background template and the avatar & QR we have
          const idCardRel = await IdCardGen.generateAndSaveIdCard(savedUser, {
            backgroundImagePath: path.join(process.cwd(), 'assets', 'idcard', 'bg.png'),
            uploadsDir: 'uploads/idcards'
          });
          savedUser.idCardUrl = idCardRel;
          await savedUser.save();

          const payload = {
            success: true,
            message: "User registered successfully.",
            userId: savedUser._id,
            employeeId: savedUser.employeeId,
            employeeQrUrl: savedUser.employeeQrUrl,
            idCardUrl: savedUser.idCardUrl
          };
          if (debugMode) payload.debug = { employeeIdHashSample: employeeIdHash.slice(0,8)+'...' };
          return res.status(201).json(payload);
        } catch (e) {
          console.error('[registerUser] employee generation error', e);
          return res.status(201).json({
            success: true,
            message: "User created but failed to generate employee artefacts.",
            userId: savedUser._id,
            error: e.message || String(e),
          });
        }
      }

      // non-employee
      return res.status(201).json({
        success: true,
        message: "User registered successfully.",
        userId: savedUser._id,
        avatar: avatarUrl,
      });

    } catch (err) {
      console.error('registerUser fatal', err);
      return res.status(500).json({ success:false, message: "Server error.", error: err.message });
    }
  };


  export const getUserEmployeeId = async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid user id." });
      }
      const user = await User.findById(id).select("fullName employeeId employeeQrUrl role");
      if (!user) return res.status(404).json({ success: false, message: "User not found." });

      return res.json({ success: true, user });
    } catch (err) {
      console.error("getUserEmployeeId error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  /**
   * verifyEmployeeHash
   * Accepts { hash } in body. If matches a user -> returns basic info (no sensitive fields).
   * Useful for scanning devices that post the scanned hash to this endpoint.
   */
  export const verifyEmployeeHash = async (req, res) => {
    try {
      const { hash } = req.body;
      if (!hash) return res.status(400).json({ success: false, message: "Missing hash." });

      const user = await User.findOne({ employeeIdHash: hash }).select("fullName email phone city state avatarUrl idCardUrl role employeeId employeeQrUrl isActive");
      if (!user) return res.status(404).json({ success: false, message: "Employee not found." });

      // Optionally, you can check if archived or inactive
      if (user.isArchived || !user.isActive) {
        return res.status(403).json({ success: false, message: "Employee is not active." });
      }

      return res.json({ success: true, employee: user });
    } catch (err) {
      console.error("verifyEmployeeHash error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  };
  export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🧩 Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // 🧩 Find user by email (case-insensitive)
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 🧩 Check if user is archived (block login)
    if (user.isArchived) {
      return res.status(403).json({
        success: false,
        message: "Your id deactivated. Please contact the administrator.",
      });
    }

    // 🧩 Verify password
    const isMatch = await user.verifyPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
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

    // 🧩 Cookie settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    };

    // 🧩 Send response
    return res
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
          isArchived: user.isArchived,
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


  export const updateTeamMember = async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success:false, message: "Invalid team member ID." });

      const existing = await User.findById(id);
      if (!existing) return res.status(404).json({ success:false, message: "Team member not found." });

      // avatar handling
      if (req.files && req.files.avatar && req.files.avatar[0]) {
        existing.avatarUrl = `/uploads/${req.files.avatar[0].filename}`;
      } else if (req.file && req.file.fieldname === 'avatar') {
        existing.avatarUrl = `/uploads/${req.file.filename}`;
      }

      // aadhar handling
      if (req.files && req.files.aadhar && req.files.aadhar[0]) {
        existing.aadharUrl = `/uploads/${req.files.aadhar[0].filename}`;
      } else if (req.file && req.file.fieldname === 'aadhar') {
        existing.aadharUrl = `/uploads/${req.file.filename}`;
      }

      // update other fields if provided...
      const body = req.body;
      if (body.fullName) existing.fullName = body.fullName;
      if (body.phone) existing.phone = body.phone;
      if (body.city) existing.city = body.city;
      if (body.state) existing.state = body.state;
      if (body.role) existing.role = body.role;

      await existing.save();

      // regenerate ID card when avatar / qr / name changed (best-effort)
      try {
        if (existing.employeeId) {
          const idCardRel = await IdCardGen.generateAndSaveIdCard(existing, {
            backgroundImagePath: path.join(process.cwd(), 'assets', 'idcard', 'bg.png'),
            uploadsDir: 'uploads/idcards'
          });
          existing.idCardUrl = idCardRel;
          await existing.save();
        }
      } catch (e) {
        console.warn('Failed to regenerate id card after update:', e && e.message);
        // don't fail whole request
      }

      return res.status(200).json({ success: true, message: "Team member updated.", teamMember: existing });

    } catch (err) {
      console.error('updateTeamMember error', err);
      return res.status(500).json({ success:false, message: "Server error.", error: err.message });
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
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid team member ID.' });
      }

      const member = await User.findById(id);
      if (!member) {
        return res.status(404).json({ success: false, message: 'Team member not found.' });
      }

      // Only archive ADMIN or TEAM_MEMBER
      if (!['ADMIN', 'TEAM_MEMBER'].includes(member.role)) {
        return res.status(400).json({ success: false, message: 'Only team members or admins can be archived.' });
      }

      // set archive fields
      member.isArchived = true;
      member.archivedAt = new Date();
      member.archivedBy = req.user?.userId || null;
      member.archiveReason = req.body?.reason || 'Archived via admin UI';

      await member.save();

      return res.status(200).json({ success: true, message: 'Team member archived successfully.' });
    } catch (err) {
      console.error('Delete team member error:', err);
      return res.status(500).json({ success: false, message: 'Server error while archiving team member.', error: err.message });
    }
  };
  // Qr code integrate

  /**
   * Helper to convert stored relative upload path (e.g. "/uploads/qrcodes/..png")
   * into an absolute URL (https://host/uploads/...)
   */
  function makeAbsoluteUrl(req, possiblePath) {
    if (!possiblePath) return null;
    // if already absolute (starts with http:// or https://) return as-is
    if (possiblePath.startsWith("http://") || possiblePath.startsWith("https://")) return possiblePath;
    // otherwise join with current host
    const protocol = req.protocol;
    const host = req.get("host"); // includes port if present
    // ensure possiblePath starts with '/'
    const normalized = possiblePath.startsWith("/") ? possiblePath : `/${possiblePath}`;
    return `${protocol}://${host}${normalized}`;
  }

  /**
   * GET /team-members (or similar)
   * Returns all TEAM_MEMBER and ADMIN users.
   * Query param: includeArchived=true to only show archived ones.
   */
  export const getAllTeamMembers = async (req, res) => {
    try {
      const includeArchived = String(req.query.includeArchived || "").toLowerCase() === "true";

      // Base query: only admins and team members (always exclude SUPER_ADMIN)
      const q = { role: { $in: ["ADMIN", "TEAM_MEMBER"] } };

      if (includeArchived) {
        // show only archived
        q.isArchived = true;
      } else {
        // show not archived
        q.isArchived = { $ne: true };
      }

      // Fetch users - exclude sensitive fields like passwordHash and employeeIdHash
      const users = await User.find(q)
        .select("-passwordHash -employeeIdHash -deviceTokens")
        .sort({ createdAt: -1 })
        .lean();

      // Convert relative QR URLs to absolute URLs for frontend convenience
      const usersWithQrUrls = users.map((u) => {
        return {
          ...u,
          employeeQrUrl: makeAbsoluteUrl(req, u.employeeQrUrl),
        };
      });

      return res.json({ success: true, data: usersWithQrUrls });
    } catch (err) {
      console.error("getAllTeamMembers error", err);
      return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  };

  /**
   * GET /:teamMemberId/details
   * Returns team member details, grouped client/tasks, and subCompanies used by those clients.
   * Also includes employeeId and employeeQrUrl (absolute URL).
   */
  export const getTeamMemberDetails = async (req, res) => {
    try {
      const { teamMemberId } = req.params;

      // Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(teamMemberId)) {
        return res.status(400).json({ success: false, message: "Invalid Team Member ID" });
      }

      const teamMemberObjectId = new mongoose.Types.ObjectId(teamMemberId);

      // Fetch Team Member: include employeeId and employeeQrUrl for frontend
      const teamMember = await User.findById(teamMemberObjectId)
        .select("fullName email avatarUrl role subCompany employeeId employeeQrUrl isArchived isActive")
        .lean();

      if (!teamMember) {
        return res.status(404).json({ success: false, message: "Team Member not found" });
      }

      // Convert employeeQrUrl to absolute (if exists)
      teamMember.employeeQrUrl = makeAbsoluteUrl(req, teamMember.employeeQrUrl);

      // Fetch assignments linked to this team member
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

      // If no assignments found return member with empty arrays
      if (!assignments.length) {
        return res.json({
          success: true,
          teamMember,
          subCompanies: [],
          clients: [],
        });
      }

      // Group tasks by client and collect subCompany IDs referenced in client.meta
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

      // Fetch SubCompany details for all collected ids
      let subCompanies = [];
      if (subCompanyIdSet.size > 0) {
        subCompanies = await SubCompany.find({
          _id: { $in: Array.from(subCompanyIdSet) },
        })
          .select("_id name logoUrl")
          .lean();
      }

      // Respond
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

      // === Read uploaded files (works with upload.fields) ===
      let avatarUrl = null;
      let aadharUrl = null;

      if (req.files) {
        if (req.files.avatar && req.files.avatar[0]) {
          avatarUrl = `/uploads/${req.files.avatar[0].filename}`;
        }
        if (req.files.aadhar && req.files.aadhar[0]) {
          aadharUrl = `/uploads/${req.files.aadhar[0].filename}`;
        }
      } else if (req.file) {
        // fallback if single-file middleware used
        if (req.file.fieldname === 'avatar') avatarUrl = `/uploads/${req.file.filename}`;
        if (req.file.fieldname === 'aadhar') aadharUrl = `/uploads/${req.file.filename}`;
      }

      // Prepare payload to materialize after OTP verification
      const hashedPassword = await User.hashPassword(password);
      const payload = {
        fullName,
        email,
        phone,
        city,
        state,
        role,
        subCompany: (subCompany && mongoose.Types.ObjectId.isValid(subCompany)) ? subCompany : null,
        passwordHash: hashedPassword,
        avatarUrl,
        aadharUrl // <--- include aadhar in the saved payload
      };

      // Create OTP doc
      const otp = randomOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);

      // One per email: remove old ones
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

      // Extract payload saved at registerInit
      const {
        fullName, phone, city, state, role, subCompany, passwordHash, avatarUrl, aadharUrl
      } = record.payload;

      // Race guard
      const exists = await User.findOne({ email });
      if (exists) {
        await EmailOtp.deleteOne({ _id: record._id });
        return res.status(409).json({ success: false, message: "Email already registered." });
      }

      // Create the user (persist avatarUrl and aadharUrl from payload)
      const user = await User.create({
        fullName,
        email,
        phone,
        city,
        state,
        role,
        subCompany,
        passwordHash,
        avatarUrl,
        aadharUrl,
        isEmailVerified: true
      });

      // Remove OTP record (we're done)
      await EmailOtp.deleteOne({ _id: record._id });

      // If ADMIN or TEAM_MEMBER -> generate employee id/hash/QR and ID card (best-effort)
      if (role === 'ADMIN' || role === 'TEAM_MEMBER') {
        try {
          const employeeId = await generateEmployeeId();
          const employeeIdHash = hashEmployeeId(employeeId);

          user.employeeId = employeeId;
          user.employeeIdHash = employeeIdHash;
          await user.save(); // save before QR so we have fields

          const qrRelativePath = await generateAndSaveEmployeeQr(user, { content: employeeIdHash });
          user.employeeQrUrl = qrRelativePath;
          await user.save();

          // generate ID card png using IdCardGen util (best-effort)
          try {
            const idCardRel = await IdCardGen.generateAndSaveIdCard(user, {
              backgroundImagePath: path.join(process.cwd(), 'assets', 'idcard', 'bg.png'),
              uploadsDir: 'uploads/idcards'
            });
            user.idCardUrl = idCardRel;
            await user.save();
          } catch (e) {
            console.warn('ID card generation failed (non-fatal):', e && e.message);
          }

          return res.status(201).json({
            success: true,
            message: "User registered and verified.",
            userId: user._id,
            avatar: user.avatarUrl,
            employeeId: user.employeeId,
            employeeQrUrl: user.employeeQrUrl,
            idCardUrl: user.idCardUrl || null
          });
        } catch (e) {
          console.error('[registerVerify] employee generation error', e);
          // user created, but failed to generate employee artefacts
          return res.status(201).json({
            success: true,
            message: "User registered and verified, but failed to generate employee id/QR/IDcard.",
            userId: user._id,
            avatar: user.avatarUrl,
            error: e.message || String(e)
          });
        }
      }

      // Non-employee role -> normal response
      return res.status(201).json({
        success: true,
        message: "User registered and verified.",
        userId: user._id,
        avatar: user.avatarUrl
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


  export const restoreTeamMember = async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid team member ID.' });
      }

      const member = await User.findById(id);
      if (!member) {
        return res.status(404).json({ success: false, message: 'Team member not found.' });
      }

      member.isArchived = false;
      member.archivedAt = null;
      member.archivedBy = null;
      member.archiveReason = null;
      await member.save();

      return res.status(200).json({ success: true, message: 'Team member restored successfully.' });
    } catch (err) {
      console.error('restoreTeamMember error:', err);
      return res.status(500).json({ success: false, message: 'Server error while restoring team member.', error: err.message });
    }
  };