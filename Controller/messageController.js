import Message from "../Models/Message.js";
import User from "../Models/userSchema.js";
import path from "path";
import mongoose from "mongoose";

const GROUP_KEY = "RUDHRAM";

// helper: URL for a saved file
const fileUrl = (req, filename) =>
  `${req.protocol}://${req.get("host")}/uploads/chat/${filename}`;

// ---------- SEND DIRECT (text + files) ----------
// ---------- SEND DIRECT (text + files) ----------
export const sendMessage = async (req, res) => {
  try {
    const { message = "", receivers } = req.body;

    // 1) Normalize receivers to an array of string ids
    let raw = receivers;

    // If multer gave us a stringified JSON, parse it.
    if (typeof raw === "string") {
      // case-1: raw is '["id1","id2"]'
      try {
        const parsed = JSON.parse(raw);
        raw = parsed;
      } catch {
        // case-2: raw is "id1,id2" or "id1"
        raw = raw.split(",").map(s => s.trim()).filter(Boolean);
      }
    }

    // case-3: raw is ["[\"id1\",\"id2\"]"] (array with single JSON string)
    if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === "string" && raw[0].trim().startsWith("[")) {
      try {
        raw = JSON.parse(raw[0]);
      } catch {
        // leave as-is
      }
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, message: "receivers required" });
    }

    // dedupe & sanitize
    const receiverIds = [...new Set(raw.map(String).filter(Boolean))];

    // 2) Build attachments (unchanged)
    const attachments = (req.files || []).map((f) => ({
      url: fileUrl(req, path.basename(f.path)),
      name: f.originalname,
      mime: f.mimetype,
      size: f.size,
    }));

    let kind = "text";
    if (attachments.length && message) kind = "mixed";
    else if (attachments.length) {
      const isAllImages = attachments.every(a => (a.mime || "").startsWith("image/"));
      kind = isAllImages ? "image" : "file";
    }

    // 3) Create message
    const doc = await Message.create({
      sender: req.user.userId,
      receivers: receiverIds,
      message,
      attachments,
      kind,
      channel: "direct",
    });

    await doc.populate("sender", "fullName avatarUrl role");
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.warn("sendMessage error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ---------- LIST MY MESSAGES (inbox view) ----------
export const getMyMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const me = await User.findById(userId);

    let query = {
      $or: [{ sender: userId }, { receivers: userId }],
    };

    if (me?.role === "SUPER_ADMIN") {
      // super admin can see all
      query = {};
    }

    const msgs = await Message.find(query)
      .sort({ createdAt: -1 })
      .populate("sender", "fullName avatarUrl role")
      .populate("receivers", "fullName avatarUrl role");

    return res.json({ success: true, data: msgs });
  } catch (err) {
    console.error("getMyMessages error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------- GET 1-1 THREAD ----------
export const getConversation = async (req, res) => {
  try {
    const { id: other } = req.params;
    if (!mongoose.Types.ObjectId.isValid(other)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    const userId = req.user.userId;

    const msgs = await Message.find({
      channel: "direct",
      $or: [
        { sender: userId, receivers: other },
        { sender: other,  receivers: userId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("sender", "fullName avatarUrl role");

    return res.json({ success: true, data: msgs });
  } catch (err) {
    console.error("getConversation error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------- DELETE SINGLE (own message) or Admin can delete any ----------
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid message id" });
    }

    const msg = await Message.findById(id).populate("sender", "role");
    if (!msg) return res.status(404).json({ success: false, message: "Not found" });

    if (String(msg.sender._id) !== req.user.userId && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    await Message.findByIdAndDelete(msg._id);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("deleteMessage error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ---------- SUPER ADMIN: DELETE ENTIRE DIRECT THREAD ----------
export const deleteThread = async (req, res) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Admins only" });
    }
    const userA = req.query.userA; // required
    const userB = req.query.userB; // required
    if (!userA || !userB) {
      return res.status(400).json({ success: false, message: "userA & userB required" });
    }

    const result = await Message.deleteMany({
      channel: "direct",
      $or: [
        { sender: userA, receivers: userB },
        { sender: userB, receivers: userA },
      ],
    });

    res.json({ success: true, message: "Thread cleared", deleted: result.deletedCount });
  } catch (err) {
    console.error("deleteThread error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ---------- GROUP ----------
export const sendGroupMessage = async (req, res) => {
  try {
    const { message = "" } = req.body;

    const attachments = (req.files || []).map((f) => ({
      url: fileUrl(req, path.basename(f.path)),
      name: f.originalname,
      mime: f.mimetype,
      size: f.size,
    }));

    let kind = "text";
    if (attachments.length && message) kind = "mixed";
    else if (attachments.length) {
      const isAllImages = attachments.every(a => (a.mime || "").startsWith("image/"));
      kind = isAllImages ? "image" : "file";
    }

    const doc = await Message.create({
      sender: req.user.userId,
      message,
      attachments,
      kind,
      channel: "group",
      groupKey: GROUP_KEY,
      receivers: [],
    });

    await doc.populate("sender", "fullName avatarUrl role");
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("sendGroupMessage error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const docs = await Message.find({ channel: "group", groupKey: GROUP_KEY })
      .sort({ createdAt: 1 })
      .populate("sender", "fullName avatarUrl role");

    return res.json({ success: true, data: docs });
  } catch (err) {
    console.error("getGroupMessages error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------- SUPER ADMIN: CLEAR GROUP ----------
export const clearGroup = async (req, res) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Admins only" });
    }
    const result = await Message.deleteMany({ channel: "group", groupKey: GROUP_KEY });
    return res.json({ success: true, message: "Group cleared", deleted: result.deletedCount });
  } catch (err) {
    console.error("clearGroup error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// add this at bottom of controller file
export const getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user.userId;

    // DIRECT: count unread per partner
    const directAgg = await Message.aggregate([
      {
        $match: {
          channel: "direct",
          receivers: mongoose.Types.ObjectId.createFromHexString(userId),
          sender: { $ne: mongoose.Types.ObjectId.createFromHexString(userId) },
          $expr: {
            $not: [
              {
                $in: [
                  mongoose.Types.ObjectId.createFromHexString(userId),
                  { $map: { input: "$readBy", as: "rb", in: "$$rb.user" } },
                ],
              },
            ],
          },
        },
      },
      { $group: { _id: "$sender", count: { $sum: 1 } } },
    ]);

    const direct = {};
    directAgg.forEach((row) => {
      direct[String(row._id)] = row.count;
    });

    // GROUP: count unread for the single Rudhram group
    const groupAgg = await Message.aggregate([
      {
        $match: {
          channel: "group",
          groupKey: "RUDHRAM",
          sender: { $ne: mongoose.Types.ObjectId.createFromHexString(userId) },
          $expr: {
            $not: [
              {
                $in: [
                  mongoose.Types.ObjectId.createFromHexString(userId),
                  { $map: { input: "$readBy", as: "rb", in: "$$rb.user" } },
                ],
              },
            ],
          },
        },
      },
      { $count: "count" },
    ]);

    const groupCount = groupAgg.length ? groupAgg[0].count : 0;

    res.json({
      success: true,
      data: { direct, group: { RUDHRAM: groupCount } },
    });
  } catch (err) {
    console.error("getUnreadCounts error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
