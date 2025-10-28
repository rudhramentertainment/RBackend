import express from "express";
import { createSubCompany, getAllSubCompanies, getSubCompanyById, getSubCompanyDetailsWithTeamStatus } from "../Controller/subCompanyController.js";

const router = express.Router();


router.post('/addsubcompany',createSubCompany);
router.get("/getsubcompany", getAllSubCompanies);
router.get("/getsubcompany/:id", getSubCompanyById);
router.get("/:subCompanyId/details", getSubCompanyDetailsWithTeamStatus);

export default router;