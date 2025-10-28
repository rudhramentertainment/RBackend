import express from "express";
import {
  getClients,
  getClientById,
  updateClient,
  deleteClient
} from "../Controller/clientController.js";

const router = express.Router();

// Routes
router.get("/getclient", getClients);          // Fetch all clients
router.get("/:id", getClientById);    // Fetch client by ID
router.put("/:id", updateClient);     // Update client
router.delete("/:id", deleteClient);  // Delete client

export default router;
