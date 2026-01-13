import mongoose from "mongoose";

const InvoiceServiceSchema = new mongoose.Schema({
  // store main title and separate description
  title: { type: String, required: false },       // main service title (optional but recommended)
  description: { type: String, required: true },  // detailed description or service line
  qty: { type: Number, required: true },
  rate: { type: Number, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
  subCompany: { type: mongoose.Schema.Types.ObjectId, ref: "SubCompany", required: true },

   clientName: { type: String },     // Client name at invoice time
    gstNumber: { type: String },      // GST number
    address: { type: String },        // Address
    city: { type: String },           // City
    state: { type: String },          // State
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
