import express from 'express';
// import bodyParser from 'body-parser';
// import cors from 'cors';
// import mongoose from 'mongoose';
 import dotenv from 'dotenv';
import dbConnection from './Connection/dbConnection.js';
import userRoutes from './Routes/userRoute.js';
import subCompanyRoutes from './Routes/subCompanyRoutes.js';
import leadRoutes from './Routes/leadRoutes.js';
import projectRoutes from './Routes/projectRoutes.js';
import taskRoutes from './Routes/taskRoutes.js';
import meetingRoutes from './Routes/meetingRoutes.js';
import driveRoutes from './Routes/driveFolderRoutes.js';
import clientRoutes from './Routes/clientRoutes.js';
import invoiceRoute from './Routes/invoiceRoutes.js';
import receiptRoutes from './Routes/receiptRoutes.js';
import cookieParser from "cookie-parser";
import cors from 'cors';

let app = express();

dotenv.config({ path: './.env/.env' });


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // Add your frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cors());

app.use('/api/v1/user',userRoutes);
app.use('/api/v1/subcompany',subCompanyRoutes);
app.use('/api/v1/lead',leadRoutes);
app.use('/api/v1/project',projectRoutes);
app.use('/api/v1/task',taskRoutes);
app.use('/api/v1/meeting',meetingRoutes);
app.use('/api/v1/drive',driveRoutes);
app.use('/api/v1/client',clientRoutes);
app.use('/api/v1/invoice',invoiceRoute);
app.use('/api/v1/receipts',receiptRoutes);

app.use("/uploads", express.static("uploads"));

app.use((err, req, res, next) => {
  console.error("❌ Global error:", err);
  if (err instanceof multer.MulterError || err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message || "Image upload failed.",
    });
  }
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});



app.listen(process.env.PORT ||9000, "0.0.0.0", () => {
  console.log(`✅ Server is running on http://0.0.0.0:${process.env.PORT}`);
});
dbConnection();