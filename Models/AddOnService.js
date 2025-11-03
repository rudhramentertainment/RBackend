import mongoose from "mongoose";

const AddOnServiceSchema = new mongoose.Schema(
  {
    subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany", required: true },
    title: { type: String, required: true, trim: true },
    offerings: [{ type: String, trim: true }],
    startDate: { type: Date },
    endDate: { type: Date },
    // computed or set explicitly
    status: {
      type: String,
      enum: ["scheduled", "active", "expired"],
      default: "scheduled",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// keep status in sync by dates
AddOnServiceSchema.pre("save", function (next) {
  if (this.startDate && this.endDate) {
    const now = new Date();
    if (now < this.startDate) this.status = "scheduled";
    else if (now > this.endDate) this.status = "expired";
    else this.status = "active";
  }
  next();
});

const AddOnService = mongoose.model("AddOnService", AddOnServiceSchema);
export default AddOnService;
