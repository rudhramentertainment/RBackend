import mongoose from "mongoose";

const MeetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    agenda: String,

    subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany" },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    location: String,
    meetingLink: String,
    meetingPassword: { type: String }, // ✅ NEW OPTIONAL FIELD
    notes: String,

    meetingWithType: {
      type: String,
      enum: ["lead", "client"],
      required: true,
    },
    // models/Meeting.js
startNotified: { type: Boolean, default: false },
createdNotified: { type: Boolean, default: false }, // optional: notify on creation

  },
  { timestamps: true }
);

// Validation — one of lead/client must exist
MeetingSchema.pre("validate", function (next) {
  if (!this.lead && !this.client) {
    return next(new Error("Meeting must be associated with either a Lead or a Client"));
  }

  // Auto-set meeting type
  if (this.lead && !this.client) this.meetingWithType = "lead";
  else if (this.client && !this.lead) this.meetingWithType = "client";

  next();
});

const Meeting = mongoose.model("Meeting", MeetingSchema);
export default Meeting;
