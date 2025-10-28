import express from "express";
import {
  addTask,
  updateTask,
  deleteTask,
  getAllTasks,
  getTaskById,
  updateTaskProgress,
  getMyTasks,
} from "../Controller/taskController.js";
import { authenticate } from "../Middleware/authentication.js";
// import { authMiddleware } from "../middleware/authMiddleware.js"; // if you have JWT

const router = express.Router();

router.post("/addtask",  addTask);
router.get("/gettask",authenticate, getAllTasks);
router.get("/mytasks",authenticate, getMyTasks);
router.get("/:id", getTaskById);
router.put("/:id",  updateTask);
router.delete("/:id",  deleteTask);

router.put("/assignment/:taskId/progress",authenticate ,updateTaskProgress);

export default router;
