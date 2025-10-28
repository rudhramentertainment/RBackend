import Project from "../Models/Project.js";
import Client from "../Models/Client.js";
import SubCompany from "../Models/SubCompany.js";
import mongoose from "mongoose";

export const addProject = async (req, res) => {
  try {
    const {
      title,
      client,
      subCompany,
      description,
      status,
      startDate,
      endDate,
      budget,
      tags,
      files,
    } = req.body;

    // ✅ Validate required fields
    if (!title || !client || !subCompany) {
      return res.status(400).json({
        success: false,
        message: "Title, client, and subCompany are required fields.",
      });
    }
    // ✅ Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(client)) {
      return res.status(400).json({ success: false, message: "Invalid client ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(subCompany)) {
      return res.status(400).json({ success: false, message: "Invalid subCompany ID" });
    }
    // ✅ Ensure referenced Client & SubCompany exist
    const existingClient = await Client.findById(client);
    if (!existingClient)
      return res.status(404).json({ success: false, message: "Client not found" });

    const existingSubCompany = await SubCompany.findById(subCompany);
    if (!existingSubCompany)
      return res.status(404).json({ success: false, message: "SubCompany not found" });

    // ✅ Create project
    const project = await Project.create({
      title,
      client,
      subCompany,
      description,
      status: status || "prospect",
      startDate,
      endDate,
      budget,
      tags,
      files: files || [],
      createdBy: req.user?._id || null, // assuming JWT middleware
    });

    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (err) {
    console.error("Error creating project:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

export const getAllProjects = async (req, res) => {
  try {
    const { status, client, subCompany, search } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (client) filter.client = client;
    if (subCompany) filter.subCompany = subCompany;
    if (search) filter.title = { $regex: search, $options: "i" };

    const projects = await Project.find(filter)
      .populate("client", "name email phone")
      .populate("subCompany", "name")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: projects.length,
      data: projects,
    });
  } catch (err) {
    console.error("Error fetching projects:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};


export const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid project ID" });

    const project = await Project.findById(id)
      .populate("client", "name email phone")
      .populate("subCompany", "name")
      .populate("createdBy", "fullName email");

    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (err) {
    console.error("Error getting project:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid project ID" });

    const project = await Project.findById(id);
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });

    // ✅ Prevent overwriting critical fields accidentally
    const allowedFields = [
      "title",
      "description",
      "status",
      "startDate",
      "endDate",
      "budget",
      "tags",
      "files",
      "client",
      "subCompany",
    ];

    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) project[key] = updates[key];
    }

    await project.save();

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      data: project,
    });
  } catch (err) {
    console.error("Error updating project:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid project ID" });

    const project = await Project.findById(id);
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });

    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting project:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
