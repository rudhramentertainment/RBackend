import mongoose from "mongoose";

const leadLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["created", "updated", "whatsappShare"],
      required: true,
    },
    message: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    token: { type: String, unique: true, required: true }, // ✅ New auto-generated token field

    source: String,
    rawForm: mongoose.Schema.Types.Mixed,
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true },
    businessName: { type: String },
    businessCategory: { type: String },
    subCompanyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "SubCompany" }],
    chosenServices: [
    {
      subCompanyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubCompany', 
        required: true
      },
      title: { type: String, required: true },
      selectedOfferings: [{ type: String, required: true }]
    }
  ],

    // ✅ Optional date fields
    birthDate: { type: Date },
    anniversaryDate: { type: Date },
    companyEstablishDate: { type: Date },

    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "lost"],
      default: "new",
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fcmToken: { type: String },
    logs: [leadLogSchema],
  },
  { timestamps: true }
);

// 📌 Helper: Generate next token
leadSchema.statics.generateToken = async function () {
  const currentYear = new Date().getFullYear();
  const lastLead = await this.findOne().sort({ createdAt: -1 }).exec();

  let nextNumber = 1;
  if (lastLead && lastLead.token) {
    const match = lastLead.token.match(/RE-(\d{4})-(\d+)/);
    if (match && parseInt(match[1]) === currentYear) {
      nextNumber = parseInt(match[2]) + 1;
    }
  }

  const paddedNumber = String(nextNumber).padStart(3, "0");
  return `RE-${currentYear}-${paddedNumber}`;
};

const Lead = mongoose.model("Lead", leadSchema);
export default Lead;
