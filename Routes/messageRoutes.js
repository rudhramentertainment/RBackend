import express from "express";
import auth from "../Middleware/authentication.js";
import { uploadMessage } from "../Middleware/uploadMessage.js";
import {
  sendMessage,
  getMyMessages,
  getConversation,
  deleteMessage,
  deleteThread,
  sendGroupMessage,
  getGroupMessages,
  clearGroup,
  getUnreadCounts,
} from "../Controller/messageController.js";

const app = express();

/** GROUP (Rudhram) — put BEFORE any :id routes */
app.post("/group", auth, uploadMessage.array("files"), sendGroupMessage);
app.get("/group/rudhram", auth, getGroupMessages);
app.delete("/group/rudhram", auth, clearGroup);

/** DIRECT THREAD (super admin) — also BEFORE :id */
app.delete("/thread", auth, deleteThread);

/** DIRECT MESSAGES */
app.post("/", auth, uploadMessage.array("files"), sendMessage);
app.get("/", auth, getMyMessages);

// NO inline regex here — validate in controller instead
app.get("/:id", auth, getConversation);
app.delete("/:id", auth, deleteMessage);
app.get("/unread", auth, getUnreadCounts
  
); 

export default app;
