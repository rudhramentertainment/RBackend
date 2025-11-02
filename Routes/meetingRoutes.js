import express from "express";
import {
  addMeeting,
  updateMeeting,
  deleteMeeting,
  getAllMeetings,
  getMeetingById,
} from "../Controller/meetingController.js";
// import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/addmeeting", addMeeting);
router.get("/getmeeting", getAllMeetings);
router.get("/:id",  getMeetingById);
router.put("/:id",  updateMeeting);
router.delete("/:id", deleteMeeting);

export default router;
