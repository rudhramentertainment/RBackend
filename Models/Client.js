import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
  // client id is Mongo ObjectId: shared across system
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }, // optional link back to lead
  clientId : { type: String,  required: true }, // unique client identifier
  name: { type: String, required: true, index: true },
  email: { type: String, index: true },
  phone: { type: String, index: true },
  businessName: { type: String },
  fcmToken: { type: String },
  meta: { type: Object },
  subCompanyTitlesNo: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });


const Client = mongoose.model('Client', ClientSchema);

export default Client;