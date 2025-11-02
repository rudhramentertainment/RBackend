import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema({
  title: { type: String, required: true }, // e.g. "Social Media Strategy & Management"
  offerings: [{ type: String }], // e.g. ["Content creation", "Scheduling & publishing"]
}, { _id: false });

const FormatSchema = new mongoose.Schema({
  color: { type: String },
  headerLayout: { type: String },
  footerLayout: { type: String },
  customFields: { type: Map, of: String }, // for flexible key-value custom settings
}, { _id: false });

const SubCompanySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g. "Aghhori"
  description: { type: String },
  logoUrl: { type: String },

    // Unique prefix for invoices (e.g., AGH, DMR)
  prefix: { type: String, required: true, uppercase: true },

  // Running sequence for invoice numbering per sub-company
  currentInvoiceCount: { type: Number, default: 0 },
   currentClientCount: { type: Number, default: 0 },
  
  // Format configurations
  invoiceFormat: { type: FormatSchema },
  receiptFormat: { type: FormatSchema },
  // Predefined services list
  services: [ServiceSchema],
}, { timestamps: true });

const SubCompany = mongoose.model('SubCompany', SubCompanySchema);

export default SubCompany;