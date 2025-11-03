import express from "express";
import { deleteTeamMember, getAllMembers, getAllTeamMembers, getTeamMemberDetails, getUserProfile, loginUser, registerInit, registerResendOtp, registerUser, registerVerify, removeDeviceToken, saveFcmToken, updateSuperAdmin, updateTeamMember } from "../Controller/userController.js";
import auth, { authenticate, authorize } from "../Middleware/authentication.js";
import upload from "../Middleware/uploadMiddleware.js";
import { saveDeviceToken } from "../Controller/device.controller.js";

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



export default app;