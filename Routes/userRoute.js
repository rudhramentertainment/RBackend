import express from "express";
import { deleteTeamMember, getAllMembers, getAllTeamMembers, getTeamMemberDetails, getUserProfile, loginUser, registerInit, registerResendOtp, registerUser, registerVerify, removeDeviceToken, saveFcmToken, updateSuperAdmin, updateTeamMember } from "../Controller/userController.js";
import auth, { authenticate, authorize } from "../Middleware/authentication.js";
import upload from "../Middleware/uploadMiddleware.js";
import { saveDeviceToken } from "../Controller/device.controller.js";
import Notification from "../Models/Notification.js";

const app = express();


app.get("/users", getAllMembers);

app.post('/register',upload.single("avatar"),registerUser);
app.post('/save-fcm-token', saveFcmToken);
app.post('/login',loginUser);
app.get("/me", getUserProfile); 
app.get("/team-members", getAllTeamMembers); 

app.put("/team-members/:id", upload.single("avatar"), updateTeamMember);
app.put("/superadmin/:id", upload.single("avatar"), updateSuperAdmin);

app.delete("/team-members/:id", deleteTeamMember);

app.get('/:teamMemberId/details',getTeamMemberDetails);

//OTP
app.post("/register-init", upload.single("avatar"), registerInit);

app.post("/register-verify", registerVerify);

app.post("/register-resend-otp", registerResendOtp);




app.post("/device-token",  saveDeviceToken);
app.delete("/device-token", auth, removeDeviceToken); 
// src/routes/user.routes.js
app.get("/my-tokens",auth,  async (req, res) => {
  const u = await User.findById(req.user.userId, { fullName: 1, deviceTokens: 1 });
  res.json({ success: true, userId: u?._id, fullName: u?.fullName, deviceTokens: u?.deviceTokens || [] });
});



//notification

// GET /api/v1/user/notifications
app.get("/notifications", auth, async (req, res) => {
  try {
    const userId = req.user?.userId;               // <- FIX: use userId
    if (!userId) return res.status(401).json({ success:false, message:"Unauthorized" });

    const q = { user: userId };

    // Optional per-device filter (only if header is present)
    if (req.userDeviceToken) {
      q.$or = [
        { deviceToken: req.userDeviceToken },
        { deviceToken: { $exists: false } }, // also return old records without deviceToken
      ];
    }

    const noti = await Notification.find(q).sort({ createdAt: -1 });
    return res.json({ success: true, data: noti });
  } catch (e) {
    console.error("GET /notifications error:", e);
    return res.status(500).json({ success:false, message:"Server error" });
  }
});

// DELETE /api/v1/user/notifications/:id
app.delete("/notifications/:id", auth, async (req, res) => {
  try {
    const userId = req.user?.userId;               // <- FIX: use userId
    if (!userId) return res.status(401).json({ success:false, message:"Unauthorized" });

    await Notification.findOneAndDelete({ _id: req.params.id, user: userId });
    return res.json({ success: true });
  } catch (e) {
    console.error("DELETE /notifications/:id error:", e);
    return res.status(500).json({ success:false, message:"Server error" });
  }
});

export default app;