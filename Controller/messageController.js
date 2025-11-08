import Message from "../Models/Message.js";
import User from "../Models/userSchema.js";
import path from "path";
import mongoose from "mongoose";

const GROUP_KEY = "RUDHRAM";
const fileUrl = (req, filename) =>
  `${req.protocol}://${req.get("host")}/uploads/chat/${filename}`;

// ---------- SEND DIRECT ----------
export const sendMessage = async (req, res) => {
  try {
    const { message = "", receivers, clientId } = req.body;

    // ---- normalize receivers (keeps your robust logic) ----
    let raw = receivers;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);               // '["id1","id2"]'
      } catch {
        raw = raw.split(",").map(s => s.trim()).filter(Boolean); // "id1,id2"
      }
    }
    if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === "string" && raw[0].trim().startsWith("[")) {
      try { raw = JSON.parse(raw[0]); } catch {}
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, message: "receivers required" });
    }
    const receiverIds = [...new Set(raw.map(String).filter(Boolean))];

    // ---- attachments ----
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

    // ---- create message ----
    const doc = await Message.create({
      sender: req.user.userId,
      receivers: receiverIds,
      message,
      attachments,
      kind,
      channel: "direct",
      // store clientId so the frontend can replace the optimistic bubble
      ...(clientId ? { clientId } : {}),
    });

    await doc.populate("sender", "fullName avatarUrl role");
    // you can also populate receivers if you need

    // ---- emit via socket.io ----
    const io = req.app.get("io");
if (io) {
  const payload = {
    type: "direct",
    message: doc.toObject(),
  };

  console.log("🔴 SOCKET EMIT DIRECT");
  console.log(" Sender:", req.user.userId);
  console.log(" Receivers:", receiverIds);
  console.log(" Payload ID:", payload.message._id);

  io.to(`user:${req.user.userId}`).emit("message:new", payload);
  receiverIds.forEach((rid) => {
    io.to(`user:${rid}`).emit("message:new", payload);
  });
} else {
  console.log("❌ SOCKET IO NOT INIT");
}


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
    const { message = "", clientId } = req.body;

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
      ...(clientId ? { clientId } : {}),
    });

    await doc.populate("sender", "fullName avatarUrl role");

    const io = req.app.get("io");
    if (io) {
      io.to(`group:${GROUP_KEY}`).emit("message:new", {
        type: "group",
        message: doc.toObject(),
      });
    }

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
