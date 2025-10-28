import mongoose from "mongoose";
import DriveFolder from "../Models/DriveFolder.js";

export const addDriveFolder = async (req, res) => {
  try {
    const {
      subCompany,
      name,
      parentFolder,
      externalLink,
      linkMeta,
      type,
    } = req.body;

    if (!subCompany)
      return res.status(400).json({ success: false, message: "SubCompany is required" });
    if (!name)
      return res.status(400).json({ success: false, message: "Folder name is required" });

    if (type === "link" && !externalLink)
      return res.status(400).json({ success: false, message: "External link is required for link type" });

    if (parentFolder && !mongoose.Types.ObjectId.isValid(parentFolder))
      return res.status(400).json({ success: false, message: "Invalid parent folder ID" });

    const folder = await DriveFolder.create({
      subCompany,
      name,
      parentFolder: parentFolder || null,
      externalLink: externalLink || null,
      linkMeta: linkMeta || {},
      createdBy: req.user?._id || null,
      type: type || (externalLink ? "link" : "folder"),
    });

    res.status(201).json({
      success: true,
      message: "Folder/Link created successfully",
      data: folder,
    });
  } catch (err) {
    console.error("Error creating folder:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateDriveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid folder ID" });

    const folder = await DriveFolder.findById(id);
    if (!folder)
      return res.status(404).json({ success: false, message: "Folder not found" });

    if (updates.type === "link" && !updates.externalLink)
      return res.status(400).json({
        success: false,
        message: "External link is required for link-type folders",
      });

    Object.assign(folder, updates);
    await folder.save();

    res.status(200).json({
      success: true,
      message: "Folder/Link updated successfully",
      data: folder,
    });
  } catch (err) {
    console.error("Error updating folder:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteDriveFolder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid folder ID" });

    // Check if folder has child folders before deleting
    const children = await DriveFolder.find({ parentFolder: id });
    if (children.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete folder with subfolders. Delete child folders first.",
      });
    }

    const deleted = await DriveFolder.findByIdAndDelete(id);
    if (!deleted)
      return res.status(404).json({ success: false, message: "Folder not found" });

    res.status(200).json({
      success: true,
      message: "Folder/Link deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting folder:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllDriveFolders = async (req, res) => {
  try {
    const { subCompany, parentFolder } = req.query;
    const filter = {};

    if (subCompany) filter.subCompany = subCompany;
    if (parentFolder) filter.parentFolder = parentFolder;
    else filter.parentFolder = null; // Default: only root folders

    const folders = await DriveFolder.find(filter)
      .populate("parentFolder", "name type")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: folders.length,
      data: folders,
    });
  } catch (err) {
    console.error("Error fetching folders:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getDriveFolderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid folder ID" });
    
    const folder = await DriveFolder.findById(id)
      .populate("parentFolder", "name")
      .populate("createdBy", "fullName email");

    if (!folder)
      return res.status(404).json({ success: false, message: "Folder not found" });

    const subFolders = await DriveFolder.find({ parentFolder: id })
      .populate("createdBy", "fullName email");

    res.status(200).json({
      success: true,
      data: {
        folder,
        subFolders,
      },
    });
  } catch (err) {
    console.error("Error getting folder:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
