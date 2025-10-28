import mongoose from "mongoose";
import Meeting from "../Models/Meeting.js";
import Lead from "../Models/Lead.js";
import Client from "../Models/Client.js";
import cron from "node-cron";

// Helper function to share meeting details (simulate SMS)
const shareMeetingDetails = async (phone, meeting) => {
  if (!phone) {
    console.warn("⚠️ No phone number found for sharing meeting details.");
    return;
  }

  const message = `
📅 *Meeting Scheduled!*

Title: ${meeting.title}
Agenda: ${meeting.agenda || "N/A"}
Date: ${new Date(meeting.startTime).toLocaleString()}
Location: ${meeting.location || "Online"}
Meeting Link: ${meeting.meetingLink || "—"}
${meeting.meetingPassword ? `Password: ${meeting.meetingPassword}` : ""}
`;

  // 🟡 For now, just log to console (replace this with SMS API like Twilio or MSG91)
  console.log(`📲 Sending meeting details to ${phone}:\n${message}`);
};

export const addMeeting = async (req, res) => {
  try {
    const {
      title, agenda, subCompany, organizer, participants,
      lead, client, startTime, endTime, location,
      meetingLink, meetingPassword, notes
    } = req.body;

    if (!title || !startTime || !endTime)
      return res.status(400).json({ success: false, message: "Missing required fields" });

    let targetUser = null;
    let fcmToken = null;

    if (lead) {
      targetUser = await Lead.findById(lead);
      fcmToken = targetUser?.fcmToken;
    } else if (client) {
      targetUser = await Client.findById(client);
      fcmToken = targetUser?.fcmToken;
    }

    const meeting = await Meeting.create({
      title, agenda, subCompany, organizer,
      participants, lead, client,
      startTime, endTime, location, meetingLink, meetingPassword, notes,
    });

    // ✅ Send Push Notification
    if (fcmToken) {
      const payload = {
        notification: {
          title: "📅 New Meeting Scheduled",
          body: `Title: ${meeting.title}\nDate: ${new Date(meeting.startTime).toLocaleString()}`,
        },
        data: {
          meetingId: meeting._id.toString(),
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      };

      await admin.messaging().sendToDevice(fcmToken, payload);
      console.log("✅ Push Notification sent to:", targetUser.name);
    } else {
      console.log("⚠️ No FCM token found for lead/client");
    }

    res.status(201).json({
      success: true,
      message: "Meeting created and notification sent",
      data: meeting,
    });
  } catch (err) {
    console.error("❌ Error adding meeting:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🔄 Other methods remain the same (updateMeeting, deleteMeeting, getAllMeetings, getMeetingById)

export const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid meeting ID" });

    const meeting = await Meeting.findById(id);
    if (!meeting)
      return res.status(404).json({ success: false, message: "Meeting not found" });

    // Ensure either lead or client remains linked
    if (updates.lead && updates.client) {
      return res
        .status(400)
        .json({ success: false, message: "Meeting can only be linked to either a lead or a client" });
    }

    // Validate new references if changed
    if (updates.lead) {
      const leadExists = await Lead.findById(updates.lead);
      if (!leadExists)
        return res.status(404).json({ success: false, message: "Lead not found" });
    }

    if (updates.client) {
      const clientExists = await Client.findById(updates.client);
      if (!clientExists)
        return res.status(404).json({ success: false, message: "Client not found" });
    }

    // Apply updates
    Object.assign(meeting, updates);

    await meeting.save();

    res.status(200).json({
      success: true,
      message: "Meeting updated successfully",
      data: meeting,
    });
  } catch (err) {
    console.error("Error updating meeting:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid meeting ID" });

    const meeting = await Meeting.findById(id);
    if (!meeting)
      return res.status(404).json({ success: false, message: "Meeting not found" });

    await meeting.deleteOne();

    res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting meeting:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getAllMeetings = async (req, res) => {
  try {
    const { meetingWithType, lead, client, subCompany } = req.query;
    const filter = {};

    if (meetingWithType) filter.meetingWithType = meetingWithType;
    if (lead) filter.lead = lead;
    if (client) filter.client = client;
    if (subCompany) filter.subCompany = subCompany;

    const meetings = await Meeting.find(filter)
      .populate("lead", "name email phone")
      .populate("client", "name email phone")
      .populate("organizer", "fullName email")
      .populate("participants", "fullName email")
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: meetings.length,
      data: meetings,
    });
  } catch (err) {
    console.error("Error getting meetings:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getMeetingById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid meeting ID" });

    const meeting = await Meeting.findById(id)
      .populate("lead", "name email phone")
      .populate("client", "name email phone")
      .populate("organizer", "fullName email")
      .populate("participants", "fullName email")

    if (!meeting)
      return res.status(404).json({ success: false, message: "Meeting not found" });

    res.status(200).json({ success: true, data: meeting });
  } catch (err) {
    console.error("Error getting meeting by ID:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

cron.schedule("*/5 * * * *", async () => { // runs every 5 minutes
  const now = new Date();
  const fifteenMinLater = new Date(now.getTime() + 15 * 60000);

  const meetings = await Meeting.find({
    startTime: { $lte: fifteenMinLater, $gte: now },
    startNotified: false,
  });

  for (const meeting of meetings) {
    const target =
      meeting.lead
        ? await Lead.findById(meeting.lead)
        : await Client.findById(meeting.client);

    if (target?.fcmToken) {
      await admin.messaging().sendToDevice(target.fcmToken, {
        notification: {
          title: "⏰ Meeting Reminder",
          body: `Your meeting "${meeting.title}" starts soon!`,
        },
      });

      meeting.startNotified = true;
      await meeting.save();
    }
  }
});