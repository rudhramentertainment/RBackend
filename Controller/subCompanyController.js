import SubCompany from "../Models/SubCompany.js";
import Client from "../Models/Client.js";
import Task from "../Models/Task.js";
import TaskAssignment from "../Models/TaskAssignment.js";
import User from "../Models/userSchema.js";
import mongoose from "mongoose";

export const createSubCompany = async (req, res) => {
  try {
    const { name, description, logoUrl, prefix, invoiceFormat, receiptFormat, services } = req.body;

    if (!name || !prefix) {
      return res.status(400).json({ success: false, message: "Name and prefix are required" });
    }

    const existing = await SubCompany.findOne({ name });
    if (existing) {
      return res.status(400).json({ success: false, message: "SubCompany already exists" });
    }

    const subCompany = new SubCompany({
      name,
      description,
      logoUrl,
      prefix, // ← REQUIRED by schema
      invoiceFormat,
      receiptFormat,
      services
    });

    await subCompany.save();

    res.status(201).json({
      success: true,
      message: "SubCompany created successfully",
      data: subCompany
    });
  } catch (error) {
    console.error("Error creating SubCompany:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

export const getAllSubCompanies = async (req, res) => {
  try {
    const subCompanies = await SubCompany.find();

    if (!subCompanies || subCompanies.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sub-companies found", 
      });
    }

    res.status(200).json({
      success: true,
      count: subCompanies.length,
      data: subCompanies,
    });
  } catch (error) {
    console.error("Error fetching SubCompanies:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ✅ GET sub-company by ID
export const getSubCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid SubCompany ID format",
      });
    }

    const subCompany = await SubCompany.findById(id);

    if (!subCompany) {
      return res.status(404).json({
        success: false,
        message: "SubCompany not found",
      });
    }

    res.status(200).json({
      success: true,
      data: subCompany,
    });
  } catch (error) {
    console.error("Error fetching SubCompany by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};



export const getSubCompanyDetailsWithTeamStatus = async (req, res) => {
  try {
    const { subCompanyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(subCompanyId)) {
      return res.status(400).json({ success: false, message: "Invalid SubCompany ID" });
    }

    const subCompanyObjectId = new mongoose.Types.ObjectId(subCompanyId);

    // 🏢 Fetch subCompany
    const subCompany = await SubCompany.findById(subCompanyObjectId);
    if (!subCompany) {
      return res.status(404).json({ success: false, message: "SubCompany not found" });
    }

    // 👥 Fetch clients linked to subCompany
    const clients = await Client.find({
      $or: [
        { subCompanyIds: subCompanyObjectId },
        { subCompanyIds: subCompanyId },
        { "meta.subCompanyIds": subCompanyObjectId },
        { "meta.subCompanyIds": subCompanyId }
      ]
    }).lean();

    if (!clients.length) {
      return res.json({
        success: true,
        subCompany,
        clients: []
      });
    }

    // 📌 Fetch tasks for matched clients
    const clientIds = clients.map(c => c._id);
    const tasks = await Task.find({ client: { $in: clientIds } })
      .populate("client", "name businessName")
      .lean();

    // 🧠 Fetch assignments
    const taskIds = tasks.map(t => t._id);
    const assignments = await TaskAssignment.find({ task: { $in: taskIds } })
      .populate("user", "fullName avatarUrl")
      .lean();

    // 🧭 Index assignments by task
    const assignmentsByTask = {};
    for (const a of assignments) {
      const key = a.task?.toString();
      if (!key) continue;
      (assignmentsByTask[key] ||= []).push({
        userId: a.user?._id,
        fullName: a.user?.fullName,
        avatarUrl: a.user?.avatarUrl,
        assignmentStatus: a.status,
        progress: a.progress,
      });
    }

    // 🧾 Build final structured response
    const clientsData = clients.map(client => {
      const clientTasks = tasks
        .filter(t => t.client?._id?.toString() === client._id.toString())
        .map(t => ({
          _id: t._id,
          title: t.title,
          description: t.description,
          status: t.status,
          assignedTo: assignmentsByTask[t._id.toString()] || [],
        }));

      return { ...client, tasks: clientTasks };
    });

    return res.json({
      success: true,
      subCompany,
      clients: clientsData
    });

  } catch (err) {
    console.error("Error fetching subcompany details (fatal):", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
