// controllers/barcodeController.js
import User from "../Models/userSchema.js";

import mongoose from "mongoose";

/**
 * GET /api/v1/user/:id/barcode
 * Returns current barcode for a user. If expired, refreshes it and returns the new one.
 * Note: route in your routes file already points here.
 */
export const getUserBarcode = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Only for employee roles
    if (!['ADMIN', 'TEAM_MEMBER'].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Barcode not available for this user role" });
    }

    // If no barcode or expired -> refresh
    const now = new Date();
    if (!user.barcode || !user.barcodeExpiresAt || new Date(user.barcodeExpiresAt) <= now) {
      await generateAndSaveBarcodeForUser(user, 5); // default 5 days expiry
    }

    return res.json({
      success: true,
      userId: user._id,
      barcode: user.barcode,
      barcodeExpiresAt: user.barcodeExpiresAt,
    });
  } catch (err) {
    console.error("getUserBarcode error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/v1/user/verify-barcode
 * Body: { userId, code }
 * Verifies that 'code' equals the user's current barcode and not expired.
 * If expired, returns an error (client can re-request getUserBarcode to refresh)
 */
export const verifyBarcode = async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ success: false, message: "Missing userId or code" });
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid userId" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!['ADMIN', 'TEAM_MEMBER'].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Barcode verification not supported for this role" });
    }

    if (!user.barcode || !user.barcodeExpiresAt) {
      return res.status(400).json({ success: false, message: "No barcode present — ask user to refresh/get barcode first." });
    }

    const now = new Date();
    if (new Date(user.barcodeExpiresAt) <= now) {
      return res.status(400).json({ success: false, message: "Barcode expired" });
    }

    if (user.barcode === String(code).padLeft ? String(code).padLeft(4,'0') : String(code).padStart(4,'0')) {
      // success
      return res.json({ success: true, message: "Barcode valid", userId: user._id, fullName: user.fullName });
    } else {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }
  } catch (err) {
    console.error("verifyBarcode error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
