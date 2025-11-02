import mongoose from "mongoose";

const DriveFolderSchema = new mongoose.Schema(
  {
    subCompany: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCompany",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    // ✅ Can contain nested folders
    parentFolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriveFolder",
      default: null,
    },

    // ✅ If it’s a link-type folder (e.g., Google Drive / Dropbox)
    externalLink: {
      type: String,
      default: null,
    },

    // ✅ Optional metadata for the link (like driveId, owner, permission)
    linkMeta: {
      type: Object,
      default: {},
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: true,
    },

    // ✅ New field to differentiate between normal folder or external link
    type: {
      type: String,
      enum: ["folder", "link"],
      default: "folder",
    },
  },
  { timestamps: true }
);

// Helps query unique folder names inside same parent and subCompany
DriveFolderSchema.index(
  { subCompany: 1, parentFolder: 1, name: 1 },
  { unique: false }
);

const DriveFolder = mongoose.model("DriveFolder", DriveFolderSchema);
export default DriveFolder;
