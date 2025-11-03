// src/controllers/device.controller.js
import User from "../Models/userSchema.js";
import jwt from "jsonwebtoken";


export const saveDeviceToken = async (req, res) => {
  try {
    let userId = req.user?.userId;
    const { token } = req.body;

    // Fallback decode if middleware missed
    if (!userId) {
      const hdr = req.headers["authorization"] || "";
      const cookieToken = req.cookies?.auth_token;
      let jwtToken = null;
      if (hdr.startsWith("Bearer ")) jwtToken = hdr.substring(7).trim();
      else if (cookieToken) jwtToken = cookieToken;
      if (jwtToken) {
        try {
          const payload = jwt.verify(jwtToken, process.env.JWT_SECRET || "your_jwt_secret");
          userId = payload?.userId;
        } catch (e) {
          console.warn("saveDeviceToken => fallback decode failed:", e.message);
        }
      }
    }

    if (!userId || !token) {
      console.warn("saveDeviceToken => missing", { userId, token });
      return res.status(400).json({ success: false, message: "Missing user or token." });
    }

    // ⬇️ NEW: remove this token from any other accounts first
    await User.updateMany(
      { deviceTokens: token, _id: { $ne: userId } },
      { $pull: { deviceTokens: token } }
    );

    const before = await User.findById(userId, { fullName: 1, deviceTokens: 1 });
    console.log("saveDeviceToken => before", {
      userId,
      fullName: before?.fullName,
      tokens: before?.deviceTokens?.length || 0,
    });

    const updated = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { deviceTokens: token } },
      { new: true, projection: { fullName: 1, deviceTokens: 1 } }
    );

    console.log("saveDeviceToken => after", {
      userId,
      fullName: updated?.fullName,
      tokens: updated?.deviceTokens?.length || 0,
      lastTokenTail: token.slice(-8),
    });

    return res.json({ success: true, message: "Device token saved." });
  } catch (e) {
    console.error("saveDeviceToken error:", e);
    res.status(500).json({ success: false, message: "Failed to save token." });
  }
};