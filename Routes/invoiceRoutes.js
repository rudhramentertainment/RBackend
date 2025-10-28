import express from "express";
import { deleteInvoice, downloadInvoicePDF, generateInvoicePDF, getAllInvoices, getInvoiceById, getInvoiceByShareToken, getInvoicePDF, shareInvoice, viewInvoicePDF } from "../Controller/invoiceController.js";

const router = express.Router();

// POST route to generate invoice
router.post("/generate", generateInvoicePDF);
router.get("/", getAllInvoices);

// GET -> one invoice by id
router.get("/:id", getInvoiceById);

// DELETE -> remove invoice + pdf
router.delete("/:id", deleteInvoice);


router.get("/file/:filename", getInvoicePDF); // Serve PDF by filename
router.get("/:id/view", viewInvoicePDF); // View PDF by invoice ID
router.get("/:id/download", downloadInvoicePDF); // Download PDF by invoice ID
router.get("/:id/share", shareInvoice);
router.get("/share/:token", getInvoiceByShareToken);


export default router;
