import express from "express";
import {
  addProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../Controller/projectController.js";
import { authenticate } from "../Middleware/authentication.js"; // optional if you use JWT

const router = express.Router();

// CRUD Routes
router.post("/addproject",  addProject);
router.get("/getproject", getAllProjects);
router.get("/:id", getProjectById);
router.put("/:id",  updateProject);
router.delete("/:id", deleteProject);

export default router;
