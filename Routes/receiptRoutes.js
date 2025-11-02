import express from "express";
import {
  generateReceipt,
  getAllReceipts,
  updateReceipt,
  deleteReceipt,
  shareReceipt,
  viewReceiptPDF
} from "../Controller/receiptController.js";

const router = express.Router();

router.post("/generate", generateReceipt);
router.get("/all", getAllReceipts);
router.put("/update/:id", updateReceipt);
router.delete("/delete/:id", deleteReceipt);
router.get("/view/:receiptNo", viewReceiptPDF);
router.post("/share", shareReceipt);

export default router;
