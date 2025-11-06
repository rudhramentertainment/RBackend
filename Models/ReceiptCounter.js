// models/ReceiptCounter.js
import mongoose from "mongoose";

const ReceiptCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "global" }, // single row
    lastSeq: { type: Number, default: 0 },
    prefix: { type: String, default: "RUD" },
    pad: { type: Number, default: 3 },
  },
  { versionKey: false, timestamps: false }
);

const ReceiptCounter =
  mongoose.models.ReceiptCounter || mongoose.model("ReceiptCounter", ReceiptCounterSchema);

export default ReceiptCounter;
