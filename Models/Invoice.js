import mongoose from "mongoose";

const InvoiceServiceSchema = new mongoose.Schema({
  description: { type: String, required: true },
  qty: { type: Number, required: true },
  rate: { type: Number, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true }, // e.g. AGH006
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany", required: true },
  services: [InvoiceServiceSchema],

  subtotal: { type: Number, required: true },
  gstRate: { type: Number, default: 18 },
  gstAmount: { type: Number },
  totalAmount: { type: Number },

  invoiceDate: { type: Date, default: Date.now },
  dueDate: { type: Date },
  notes: { type: String },
  pdfUrl: { type: String },

  status: { 
    type: String, 
    enum: ["Pending", "Paid", "Cancelled"], 
    default: "Pending" 
  }
}, { timestamps: true });

const Invoice = mongoose.model("Invoice", InvoiceSchema);
export default Invoice;
