import mongoose from "mongoose";
import Meeting from "../Models/Meeting.js";
import SubCompany from '../Models/SubCompany.js';
import Lead from "../Models/Lead.js";
import Client from "../Models/Client.js";
import cron from "node-cron";
import User from "../Models/userSchema.js";
import { sendToTokens ,dropInvalidTokens } from "../service/push.service.js";
import { saveNotificationsForUsers } from "../utils/saveNotification.js";


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

const toId = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : undefined);
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));
const badReq = (res, message) => res.status(400).json({ success: false, message });
const notFound = (res, message) => res.status(404).json({ success: false, message });

/**
 * Validates presence of at least one of lead/client and checks existence of refs.
 * Returns an object of normalized ids and the existence map.
 */
async function validateRefs({ subCompany, organizer, participants = [], lead, client }) {
  // Basic ID format validation
  if (subCompany && !isId(subCompany)) throw new Error('Invalid subCompany id');
  if (!organizer || !isId(organizer)) throw new Error('Invalid organizer id');
  for (const p of participants) if (!isId(p)) throw new Error('Invalid participant id');
  if (!lead && !client) throw new Error('Either lead or client is required');
  if (lead && !isId(lead)) throw new Error('Invalid lead id');
  if (client && !isId(client)) throw new Error('Invalid client id');

  // Existence checks (only what’s provided)
  const checks = [];
  if (subCompany) checks.push(SubCompany.exists({ _id: subCompany }));
  checks.push(User.exists({ _id: organizer }));
  if (lead) checks.push(Lead.exists({ _id: lead }));
  if (client) checks.push(Client.exists({ _id: client }));

  const results = await Promise.all(checks);
  let i = 0;
  if (subCompany && !results[i++]) throw new Error('SubCompany not found');
  if (!results[i++]) throw new Error('Organizer not found');
  if (lead && !results[i++]) throw new Error('Lead not found');
  if (client && !results[i++]) throw new Error('Client not found');

  // Normalize & de-duplicate participants (exclude organizer if present)
  const orgId = toId(organizer);
  const uniq = Array.from(new Set(participants.map(String))).map(toId).filter(Boolean);
  const filteredParticipants = uniq.filter((p) => !p.equals(orgId));

  return {
    ids: {
      subCompany: subCompany ? toId(subCompany) : undefined,
      organizer: orgId,
      participants: filteredParticipants,
      lead: lead ? toId(lead) : undefined,
      client: client ? toId(client) : undefined,
    },
  };
}

// ---------- CREATE ----------
export const addMeeting = async (req, res) => {
  try {
    const {
      title,
      agenda,
      subCompany,
      organizer,
      participants = [],
      lead,
      client,
      startTime,
      endTime,
      location,
      meetingLink,
      meetingPassword,
      notes,
    } = req.body;

    if (!title) return badReq(res, 'title is required');
    if (!startTime || !endTime) return badReq(res, 'startTime and endTime are required');

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      return badReq(res, 'Invalid startTime or endTime');
    }
    if (start >= end) return badReq(res, 'startTime must be before endTime');

    // Validate IDs & existence; normalize ids
    let ids;
    try {
      ({ ids } = await validateRefs({ subCompany, organizer, participants, lead, client }));
    } catch (e) {
      return badReq(res, e.message);
    }

    // Create meeting (schema pre-validate will set meetingWithType)
    const meeting = await Meeting.create({
      title,
      agenda,
      subCompany: ids.subCompany,
      organizer: ids.organizer,
      participants: ids.participants,
      lead: ids.lead,
      client: ids.client,
      startTime: start,
      endTime: end,
      location,
      meetingLink,
      meetingPassword,
      notes,
      createdNotified: false,
      startNotified: false,
    });

    // Log summary
    console.log('addMeeting => created', {
      meetingId: meeting._id.toString(),
      organizer: ids.organizer.toString(),
      participantsCount: ids.participants.length,
      lead: ids.lead?.toString(),
      client: ids.client?.toString(),
      start: start.toISOString(),
    });

    // ---- Notifications (non-blocking; errors won’t fail the API) ----
    try {
      // Collect user device tokens
      const userIds = [ids.organizer, ...ids.participants];
      const users = await User.find(
        { _id: { $in: userIds } },
        { deviceTokens: 1, fullName: 1 }
      );

      let tokens = users.flatMap((u) => u.deviceTokens || []);

      if (ids.lead) {
        const leadDoc = await Lead.findById(ids.lead, { fcmToken: 1 });
        if (leadDoc?.fcmToken) tokens.push(leadDoc.fcmToken);
      }
      if (ids.client) {
        const clientDoc = await Client.findById(ids.client, { fcmToken: 1 });
        if (clientDoc?.fcmToken) tokens.push(clientDoc.fcmToken);
      }

      tokens = Array.from(new Set(tokens));
      console.log('addMeeting => tokens', { count: tokens.length });

      if (tokens.length > 0) {
        const resp = await sendToTokens({
          tokens,
          title: '📅 New Meeting Scheduled',
          body: `${title} • ${start.toLocaleString()}`,
          data: {
            type: 'meeting',
            meetingId: meeting._id.toString(),
            startTime: start.toISOString(),
            title,
          },
        });
        await saveNotificationsForUsers({
  userIds: [ids.organizer, ...ids.participants],
  title: "📅 New Meeting Scheduled",
  message: `${title} • ${start.toLocaleString()}`,
  type: "meeting"
});


        console.log('addMeeting => FCM result', {
          successCount: resp.successCount,
          failureCount: resp.failureCount,
        });

        if (resp.failureCount > 0) {
          const badTokens = dropInvalidTokens(resp, tokens);
          if (badTokens.length) {
            await User.updateMany(
              { _id: { $in: userIds } },
              { $pull: { deviceTokens: { $in: badTokens } } }
            );
            console.warn('addMeeting => removed invalid tokens', badTokens.length);
          }
        }

        if (resp.successCount > 0) {
          meeting.createdNotified = true;
          await meeting.save();
        }
      }
    } catch (notifyErr) {
      console.warn('addMeeting => notify error (non-blocking):', notifyErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Meeting created',
      data: meeting,
    });
  } catch (err) {
    console.error('❌ addMeeting error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// ---------- UPDATE ----------
export const updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return badReq(res, 'Invalid meeting id');

    const meeting = await Meeting.findById(id);
    if (!meeting) return notFound(res, 'Meeting not found');

    const updates = { ...req.body };

    // Ensure only lead OR client (not both)
    if (updates.lead && updates.client) {
      return badReq(res, 'Meeting can only be linked to either a lead or a client');
    }

    // Time checks if provided
    if (updates.startTime) updates.startTime = new Date(updates.startTime);
    if (updates.endTime) updates.endTime = new Date(updates.endTime);
    if (updates.startTime && Number.isNaN(updates.startTime.valueOf())) {
      return badReq(res, 'Invalid startTime');
    }
    if (updates.endTime && Number.isNaN(updates.endTime.valueOf())) {
      return badReq(res, 'Invalid endTime');
    }
    const s = updates.startTime ?? meeting.startTime;
    const e = updates.endTime ?? meeting.endTime;
    if (s && e && s >= e) return badReq(res, 'startTime must be before endTime');

    // Normalize refs & validate existence if changed
    if (updates.subCompany) {
      if (!isId(updates.subCompany)) return badReq(res, 'Invalid subCompany id');
      const ok = await SubCompany.exists({ _id: updates.subCompany });
      if (!ok) return notFound(res, 'SubCompany not found');
      updates.subCompany = toId(updates.subCompany);
    }
    if (updates.organizer) {
      if (!isId(updates.organizer)) return badReq(res, 'Invalid organizer id');
      const ok = await User.exists({ _id: updates.organizer });
      if (!ok) return notFound(res, 'Organizer not found');
      updates.organizer = toId(updates.organizer);
    }
    if (Array.isArray(updates.participants)) {
      for (const p of updates.participants) if (!isId(p)) return badReq(res, 'Invalid participant id');
      // de-dupe and exclude organizer (new or existing)
      const org = updates.organizer ? toId(updates.organizer) : meeting.organizer;
      const uniq = Array.from(new Set(updates.participants.map(String))).map(toId).filter(Boolean);
      updates.participants = uniq.filter((p) => !p.equals(org));
    }
    if (updates.lead) {
      if (!isId(updates.lead)) return badReq(res, 'Invalid lead id');
      const ok = await Lead.exists({ _id: updates.lead });
      if (!ok) return notFound(res, 'Lead not found');
      updates.lead = toId(updates.lead);
      updates.client = undefined;
    }
    if (updates.client) {
      if (!isId(updates.client)) return badReq(res, 'Invalid client id');
      const ok = await Client.exists({ _id: updates.client });
      if (!ok) return notFound(res, 'Client not found');
      updates.client = toId(updates.client);
      updates.lead = undefined;
    }

    Object.assign(meeting, updates);
    await meeting.save();

    return res.status(200).json({
      success: true,
      message: 'Meeting updated successfully',
      data: meeting,
    });
  } catch (err) {
    console.error('❌ updateMeeting error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
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