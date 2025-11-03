import express from "express";
import { createSubCompany, getAllSubCompanies, getSubCompanyById, getSubCompanyDetailsWithTeamStatus } from "../Controller/subCompanyController.js";
import { createAddOnService, deleteAddOnService, listAddOnServices } from "../Controller/addOnServiceController.js";

const router = express.Router();


router.post('/addsubcompany',createSubCompany);
router.get("/getsubcompany", getAllSubCompanies);
router.get("/getsubcompany/:id", getSubCompanyById);
router.get("/:subCompanyId/details", getSubCompanyDetailsWithTeamStatus);
router.post(
  "/:id/addon-service",
  createAddOnService
);

router.get(
  "/:id/addon-services",
  listAddOnServices
);
router.delete("/addon-services/:addonId",  deleteAddOnService);

export default router;