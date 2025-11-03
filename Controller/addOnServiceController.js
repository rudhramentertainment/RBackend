import mongoose from "mongoose";
import SubCompany from "../Models/SubCompany.js";
import AddOnService from "../Models/AddOnService.js";


export const createAddOnService = async (req, res) => {
  try {
    const { id: subCompanyId } = req.params;
    const { title, offerings = [], startDate, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(subCompanyId)) {
      return res.status(400).json({ success: false, message: "Invalid subCompany id" });
    }
    const sc = await SubCompany.findById(subCompanyId).select("_id");
    if (!sc) return res.status(404).json({ success: false, message: "Sub-company not found" });

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    // normalize offerings
    const cleanOfferings = (offerings || [])
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter((s) => s.length);

    const addOn = await AddOnService.create({
      subCompany: subCompanyId,
      title: title.trim(),
      offerings: cleanOfferings,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      createdBy: req.user?._id,
    });

    res.status(201).json({ success: true, data: addOn });
  } catch (err) {
    console.error("createAddOnService error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listAddOnServices = async (req, res) => {
  try {
    const { id: subCompanyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(subCompanyId)) {
      return res.status(400).json({ success: false, message: "Invalid subCompany id" });
    }

    const items = await AddOnService.find({ subCompany: subCompanyId })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (err) {
    console.error("listAddOnServices error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteAddOnService = async (req, res) => {
  try {
    const { addonId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({ success: false, message: "Invalid add-on id" });
    }
    const item = await AddOnService.findById(addonId);
    if (!item) return res.status(404).json({ success: false, message: "Add-on not found" });

    await item.deleteOne();
    res.status(200).json({ success: true, message: "Add-on deleted" });
  } catch (err) {
    console.error("deleteAddOnService error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};