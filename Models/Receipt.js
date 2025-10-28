import mongoose from "mongoose";

const ReceiptSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true }, // e.g. RUD-001
  receiptDate: { type: Date, default: Date.now },

  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },

  amount: { type: Number, required: true },
  amountInWords: { type: String, required: true },
  paymentType: { type: String, enum: ["Cash", "Online", "Cheque","cash","online","Cheque"], required: true },
  chequeOrTxnNo: { type: String },

  notes: { type: String },

  pdfUrl: { type: String },
}, { timestamps: true });

const Receipt = mongoose.model("Receipt", ReceiptSchema);
export default Receipt;
