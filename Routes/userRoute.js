import express from "express";
import { deleteTeamMember, getAllTeamMembers, getTeamMemberDetails, getUserProfile, loginUser, registerUser, saveFcmToken, updateSuperAdmin, updateTeamMember } from "../Controller/userController.js";
import { authenticate, authorize } from "../Middleware/authentication.js";
import upload from "../Middleware/uploadMiddleware.js";

const app = express();


app.post('/register',upload.single("avatar"),registerUser);
app.post('/save-fcm-token', saveFcmToken);
app.post('/login',loginUser);
app.get("/me", getUserProfile); 
app.get("/team-members", getAllTeamMembers); 

app.put("/team-members/:id", upload.single("avatar"), updateTeamMember);
app.put("/superadmin/:id", upload.single("avatar"), updateSuperAdmin);

app.delete("/team-members/:id", deleteTeamMember);

app.get('/:teamMemberId/details',getTeamMemberDetails);


export default app;