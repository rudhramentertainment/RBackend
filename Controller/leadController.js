import Client from "../Models/Client.js";
import Lead from "../Models/Lead.js";
import SubCompany from "../Models/SubCompany.js";
import DriveFolder from "../Models/DriveFolder.js";
import mongoose from "mongoose";
import { sendLeadEmail } from '../utils/emailService.js';
import {
  notifyAllUsersLeadConverted
} from "../service/notification.service.js";
import { generateLeadPDF } from "../utils/pdfGenerator.js";
import fs from "fs";
import path from "path";

// 🟢 Add Lead
// Replace your current addLead function with the following.
// Adjust import paths as needed at top of file.

export const addLead = async (req, res) => {
  try {
    console.log("📥 Received lead request:", { body: req.body, user: req.user?.fullName || "No user" });

    const {
      source,
      rawForm,
      name,
      email,
      phone,
      businessName,
      businessCategory,
      subCompanyIds = [],
      chosenServices = [],
      status,
      assignedTo,
      birthDate,
      anniversaryDate,
      companyEstablishDate,
      project_details,
      clientCreatedAt,      // expected ISO string from frontend
      clientCreatedAtIST,   // expected human-friendly IST string
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone number are required." });
    }

    // find existing lead by unique identifiers
    const existingLead = await Lead.findOne({
      $or: [{ email: email || null }, { phone: phone || null }, { name: name }],
    });

    let lead;
    let isNewLead = false;

    if (existingLead) {
      // --- Update path (do not overwrite createdAt) ---
      console.log("🔁 Existing lead found:", existingLead._id);

      // Merge chosenServices without duplicates (safe dedupe)
      const combined = [...(existingLead.chosenServices || []), ...chosenServices];
      const uniqueServices = [];
      const seen = new Set();
      combined.forEach((item) => {
        try {
          const key = typeof item === 'string' ? item : JSON.stringify(item);
          if (!seen.has(key)) {
            seen.add(key);
            uniqueServices.push(item);
          }
        } catch {
          uniqueServices.push(item);
        }
      });

      // Merge subCompanyIds
      const updatedSubCompanies = Array.from(new Set([...(existingLead.subCompanyIds || []), ...subCompanyIds]));

      // Update fields (preserve createdAt)
      existingLead.source = source || existingLead.source;
      existingLead.rawForm = rawForm || existingLead.rawForm;
      existingLead.businessName = businessName || existingLead.businessName;
      existingLead.businessCategory = businessCategory || existingLead.businessCategory;
      existingLead.subCompanyIds = updatedSubCompanies;
      existingLead.chosenServices = uniqueServices;
      existingLead.assignedTo = assignedTo || existingLead.assignedTo;
      existingLead.birthDate = birthDate || existingLead.birthDate;
      existingLead.anniversaryDate = anniversaryDate || existingLead.anniversaryDate;
      existingLead.companyEstablishDate = companyEstablishDate || existingLead.companyEstablishDate;
      existingLead.project_details = project_details || existingLead.project_details;

      // optionally store clientCreatedAtIST as convenience for display (DO NOT change createdAt)
      if (clientCreatedAtIST) existingLead.clientCreatedAtIST = clientCreatedAtIST;

      existingLead.logs.push({
        action: "updated",
        message: `Lead updated by ${req.user?.fullName || "system"}`,
        performedBy: req.user?._id || null,
      });

      lead = await existingLead.save();
      console.log("✅ Lead updated:", lead._id);

      // sync with client collection if needed (keeps your previous logic)
      try {
        const client = await Client.findOne({ phone: lead.phone });
        if (client) {
          const updatedSubCompanyTitles = Array.from(new Set([...(client.subCompanyTitlesNo || []), ...subCompanyIds]));
          client.name = lead.name;
          client.email = lead.email;
          client.businessName = lead.businessName;
          client.subCompanyTitlesNo = updatedSubCompanyTitles;
          client.meta = {
            ...client.meta,
            chosenServices: Array.from(new Set([...(client.meta?.chosenServices || []), ...(lead.chosenServices || [])])),
          };
          await client.save();
        }
      } catch (err) {
        console.error("Error syncing client after update:", err);
      }
    } else {
      // --- Create path ---
      const token = await Lead.generateToken();
      console.log("🔐 Generated token:", token);

      // Parse clientCreatedAt if provided
      let parsedCreatedAt = null;
      if (clientCreatedAt) {
        const tmp = new Date(clientCreatedAt);
        if (!Number.isNaN(tmp.getTime())) {
          parsedCreatedAt = tmp;
        } else {
          console.warn("⚠️ clientCreatedAt could not be parsed, ignoring:", clientCreatedAt);
        }
      }

      // Compute clientCreatedAtIST server-side if not provided but parsedCreatedAt exists
      let computedClientCreatedAtIST = clientCreatedAtIST || null;
      if (!computedClientCreatedAtIST && parsedCreatedAt) {
        try {
          computedClientCreatedAtIST = parsedCreatedAt.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
        } catch (e) {
          computedClientCreatedAtIST = null;
        }
      }

      const newLeadData = {
        token,
        source,
        rawForm,
        name,
        email,
        phone,
        businessName,
        businessCategory,
        subCompanyIds,
        chosenServices,
        status: status || "new",
        assignedTo,
        birthDate: birthDate || null,
        anniversaryDate: anniversaryDate || null,
        companyEstablishDate: companyEstablishDate || null,
        project_details: project_details || "",
        clientCreatedAtIST: computedClientCreatedAtIST,
        logs: [
          {
            action: "created",
            message: `Lead created by ${req.user?.fullName || "system"}`,
            performedBy: req.user?._id || null,
          },
        ],
      };

      // **CRITICAL**: If client supplied a parsable ISO timestamp, set createdAt to that Date
      if (parsedCreatedAt) {
        newLeadData.createdAt = parsedCreatedAt;
      }

      const newLead = new Lead(newLeadData);
      lead = await newLead.save();
      isNewLead = true;
      console.log("💾 New lead saved:", lead._id);

      // send email notification (non-blocking)
      if (lead.email) {
        try {
          await sendLeadEmail(lead);
        } catch (err) {
          console.error("Error sending lead email:", err);
        }
      }
    }

    // non-blocking client notification
    try {
      const client = await Client.findOne({ phone: lead.phone }).lean();
      if (client && client.email) {
        await sendClientNotification(client, lead);
      }
    } catch (err) {
      console.error("Error sending client notification:", err);
    }

    // Return lead as saved by DB (createdAt will reflect parsedCreatedAt if provided)
    return res.status(200).json({
      success: true,
      message: isNewLead ? "New lead created successfully." : "Existing lead updated successfully.",
      data: lead,
    });
  } catch (error) {
    console.error("💥 addLead error:", error);
    return res.status(500).json({ success: false, message: "Server error while adding/updating lead.", error: error.message });
  }
};

export const downloadLeadPDF = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead id is required",
      });
    }

    const lead = await Lead.findById(id).lean();
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    // 🔥 Load sub-companies (DB or constant)
    const subCompanies = await SubCompany.find().lean();
    // OR if static:
    // const subCompanies = SUBCOMPANIES;

    // ✅ STREAM PDF
    generateLeadPDF(lead, subCompanies, res);
  } catch (error) {
    console.error("PDF download error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate lead PDF",
    });
  }
};



// Add this route to check for existing leads
export const checkExistingLead = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required to check existing leads.",
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    const existingLead = await Lead.findOne({
      $or: [
        { email: email?.toLowerCase().trim(), name: name.trim(), phone: cleanPhone },
        { phone: cleanPhone, name: name.trim() }
      ]
    });

    res.json({
      success: true,
      exists: !!existingLead,
      data: existingLead ? {
        token: existingLead.token,
        businessName: existingLead.businessName,
        existingServices: existingLead.chosenServices
      } : null
    });

  } catch (error) {
    console.error("Error checking existing lead:", error);
    res.status(500).json({
      success: false,
      message: "Server error while checking existing lead.",
      error: error.message,
    });
  }
};

// 🟡 Get All Leads
export const getAllLeads = async (req, res) => {
  try {
    const leads = await Lead.find()
      .populate("assignedTo", "fullName email")
      .populate("subCompanyIds", "name");

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching leads.",
      error: error.message,
    });
  }
};

// 🟢 Get Lead By ID
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id)
      .populate("assignedTo", "fullName email")
      .populate("subCompanyIds", "name");

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }
    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    console.error("Error fetching lead by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching lead.",
      error: error.message,
    });
  }
};

export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Find and delete the Lead
    const deletedLead = await Lead.findByIdAndDelete(id);

    if (!deletedLead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found or already deleted.",
      });
    }

    // Step 2: Delete related Client(s) where leadId matches
    const deletedClients = await Client.deleteMany({ leadId: id });

    // Step 3: Return response
    res.status(200).json({
      success: true,
      message: `Lead deleted successfully. ${deletedClients.deletedCount} related client(s) also removed.`,
      data: {
        lead: deletedLead,
        deletedClientsCount: deletedClients.deletedCount,
      },
    });
  } catch (error) {
    console.error("Error deleting lead and related clients:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting lead and related clients.",
      error: error.message,
    });
  }
};

export const convertLeadToClient = async (req, res) => {
  try {
    const { leadId } = req.params;
    const userId = req.user?._id;

    // 1️⃣ Find the lead with subcompany details
    const lead = await Lead.findById(leadId).populate("subCompanyIds", "name prefix currentClientCount");
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    // 2️⃣ Check if lead already converted
    const existingClient = await Client.findOne({ leadId: lead._id });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: "Lead has already been converted to a client.",
      });
    }

    // 3️⃣ Prepare meta data
    const subCompanyNames = lead.subCompanyIds.map((s) => s.name);
    const metaData = {
      source: lead.source,
      businessCategory: lead.businessCategory,
      chosenServices: lead.chosenServices,
      subCompanyIds: lead.subCompanyIds.map((s) => s._id),
      subCompanyNames,
    };

    // 4️⃣ Generate token
    const token = lead.token || `CLIENT-${lead._id.toString().slice(-6)}`;

    // 5️⃣ Generate subCompanyTitlesNo (e.g. AGH-001, DAM-002)
    const subCompanyTitlesNo = [];

    for (const subCompany of lead.subCompanyIds) {
      // Increment the count
      subCompany.currentClientCount += 1;

      // Format: PREFIX-XXX (3 digits)
      const formattedNo = `${subCompany.prefix}-${String(subCompany.currentClientCount).padStart(3, "0")}`;
      subCompanyTitlesNo.push(formattedNo);

      // Save updated count
      await subCompany.save();
    }

    // 6️⃣ Create client entry
    const newClient = new Client({
      clientId: token,
      leadId: lead._id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      businessName: lead.businessName,
      meta: metaData,
      subCompanyTitlesNo, // ✅ store generated codes here
      createdBy: userId,
    });

    await newClient.save();

    // 7️⃣ Update lead status and logs
    lead.status = "converted";
    lead.logs.push({
      action: "updated",
      message: "Lead converted to client",
      performedBy: userId,
    });
    await lead.save();

    // 8️⃣ Create Drive folders for each sub-company
    const createdFolders = [];
    for (const subCompany of lead.subCompanyIds) {
      const exists = await DriveFolder.findOne({
        subCompany: subCompany._id,
        name: token,
      });

      if (!exists) {
        const folder = await DriveFolder.create({
          subCompany: subCompany._id,
          name: token,
          createdBy: userId,
          type: "folder",
        });
        createdFolders.push(folder);
      }
    }

    // 🔟 NEW: Fire notifications (push + DB) to ALL users
    try {
      await notifyAllUsersLeadConverted({
        lead,
        client: newClient,
        actorId: userId, // optional: exclude the converter from notification
      });
    } catch (notifyErr) {
      console.warn("convertLeadToClient => notifyAllUsersLeadConverted failed:", notifyErr);
      // Do not fail the main request if notifications fail
    }

    // 1️⃣1️⃣ Send success response
    res.status(201).json({
      success: true,
      message: "Lead successfully converted to client with sub-company IDs and folders created.",
      client: newClient,
      createdFolders,
    });
  } catch (error) {
    console.error("Error converting lead:", error);
    res.status(500).json({
      success: false,
      message: "Server error while converting lead.",
      error: error.message,
    });
  }
};



// 🟢 Update Lead Status
export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["new", "contacted", "qualified", "converted", "lost"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status value. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }

    lead.status = status;
    lead.logs.push({
      action: "updated",
      message: `Status updated to ${status}`,
      performedBy: req.user?._id || null,
    });
    await lead.save();

    res.status(200).json({
      success: true,
      message: "Lead status updated successfully.",
      data: lead,
    });
  } catch (error) {
    console.error("Error updating lead status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating lead status.",
      error: error.message,
    });
  }
};

// 🟢 Update Lead (All Fields)
export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      source,
      rawForm,
      name,
      email,
      phone,
      businessName,
      businessCategory,
      subCompanyIds,
      chosenServices,
      status,
      assignedTo,
      birthDate,
      anniversaryDate,
      companyEstablishDate,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone number are required.",
      });
    }

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    lead.source = source || lead.source;
    lead.rawForm = rawForm || lead.rawForm;
    lead.name = name;
    lead.email = email || lead.email;
    lead.phone = phone;
    lead.businessName = businessName || lead.businessName;
    lead.businessCategory = businessCategory || lead.businessCategory;
    lead.subCompanyIds = subCompanyIds?.length ? subCompanyIds : lead.subCompanyIds;
    lead.chosenServices = chosenServices?.length ? chosenServices : lead.chosenServices;
    lead.status = status || lead.status;
    lead.assignedTo = assignedTo || lead.assignedTo;
    lead.birthDate = birthDate || lead.birthDate;
    lead.anniversaryDate = anniversaryDate || lead.anniversaryDate;
    lead.companyEstablishDate = companyEstablishDate || lead.companyEstablishDate;

    lead.logs.push({
      action: "updated",
      message: `Lead updated by ${req.user?.fullName || "system"}`,
      performedBy: req.user?._id || null,
    });

    const updatedLead = await lead.save();

    res.status(200).json({
      success: true,
      message: "Lead updated successfully.",
      data: updatedLead,
    });
  } catch (error) {
    console.error("Error updating lead:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating lead.",
      error: error.message,
    });
  }
};

// 📱 Log Lead WhatsApp Share
export const logLeadWhatsappShare = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found." });

    lead.logs.push({
      action: "whatsappShare",
      message: "Lead shared on WhatsApp",
      performedBy: req.user?._id || null,
    });
    await lead.save();

    res.status(200).json({
      success: true,
      message: "WhatsApp share logged successfully.",
      data: lead,
    });
  } catch (error) {
    console.error("Error logging WhatsApp share:", error);
    res.status(500).json({
      success: false,
      message: "Server error while logging WhatsApp share.",
      error: error.message,
    });
  }
};
