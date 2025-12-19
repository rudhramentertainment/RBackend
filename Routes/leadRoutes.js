import express from "express";
import {
  addLead,
  getAllLeads,
  getLeadById,
  deleteLead,
  convertLeadToClient,
  updateLeadStatus,
  logLeadWhatsappShare,
  updateLead,
  checkExistingLead,
  downloadLeadPDF,
} from "../Controller/leadController.js";   
import { authenticate } from "../Middleware/authentication.js";

const router = express.Router();

router.post("/addlead",addLead);
router.get("/:id/pdf", downloadLeadPDF);
router.get("/getlead",getAllLeads);
router.get("/:id",getLeadById);
router.delete("/:id", deleteLead);

router.post("/convert/:leadId",  convertLeadToClient);
router.put("/:id/status", updateLeadStatus);
router.put('/update/:id',updateLead);
router.post("/:id/whatsapp-share", logLeadWhatsappShare);

export default router;
