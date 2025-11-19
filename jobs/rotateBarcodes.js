// // jobs/rotateBarcodes.js
// import cron from 'node-cron';
// import User from '../Models/userSchema.js';
// import { generateAndSaveBarcodeForUser } from '../utils/userHelpers.js';

// export function startBarcodeRotationJob() {
//   // run daily at midnight (adjust as desired)
//   cron.schedule('0 0 * * *', async () => {
//     try {
//       const now = new Date();
//       const users = await User.find({
//         $or: [
//           { barcodeExpiresAt: { $lte: now } },
//           { barcode: null },
//         ],
//         role: { $in: ['ADMIN', 'TEAM_MEMBER'] },
//       });

//       for (const u of users) {
//         await generateAndSaveBarcodeForUser(u, 5);
//       }
//       console.log(`barcode rotation job: refreshed ${users.length} users`);
//     } catch (err) {
//       console.error('barcode rotation job error', err);
//     }
//   });
// }
