import express from "express";
import {
  addDriveFolder,
  updateDriveFolder,
  deleteDriveFolder,
  getAllDriveFolders,
  getDriveFolderById,
} from "../Controller/driveFolderController.js";
// import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/adddrivefolder",  addDriveFolder);
router.put("/:id",  updateDriveFolder);
router.delete("/:id", deleteDriveFolder);
router.get("/getdrivefolder", getAllDriveFolders);
router.get("/:id",  getDriveFolderById);

export default router;
