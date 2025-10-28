import mongoose from "mongoose";


const ProjectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  subCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCompany', required: true },
  description: { type: String },
  status: { type: String, enum: ['prospect','active','paused','completed','archived'], default: 'prospect' },
  startDate: Date,
  endDate: Date,
  budget: Number,
  tags: [String],
  files: [{ name: String, url: String, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, uploadedAt: Date }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Project = mongoose.model('Project', ProjectSchema);

export default Project;