// utils/userHelpers.js
import Counter from '../Models/Counter.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * Atomic increment using a counter document.
 * key can be e.g. "employee_seq_25_11" (year yy, month mm)
 */
export async function getNextSequence(key) {
  const r = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return r.seq;
}

/**
 * generateEmployeeId: format -> RE-<MonthFirstChar><YY>-<NNN>
 * e.g. RE-N25-001 for Nov 2025
 */
export async function generateEmployeeId(date = new Date()) {
  const monthIndex = date.getMonth(); // 0..11
  const yearFull = date.getFullYear();
  const yy = String(yearFull).slice(-2); // '25'
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const monthChar = (monthNames[monthIndex][0] || String(monthIndex + 1)).toUpperCase();

  const monthNum = String(monthIndex + 1).padStart(2, '0'); // '11'
  const counterKey = `employee_seq_${yy}_${monthNum}`;

  const seq = await getNextSequence(counterKey);
  const seqStr = String(seq).padStart(3, '0'); // 001

  return `RE-${monthChar}${yy}-${seqStr}`; // RE-N25-001
}

/**
 * sha256 hash for employeeId
 */
export function hashEmployeeId(employeeId) {
  if (!employeeId) return null;
  return crypto.createHash('sha256').update(employeeId).digest('hex');
}

/**
 * Generates a QR image (png) containing the provided content (default = employeeIdHash).
 * Saves to /uploads/qrcodes/<userId>_<timestamp>.png and returns relative path.
 */
export async function generateAndSaveEmployeeQr(user, { content = null, uploadsDir = 'uploads/qrcodes' } = {}) {
  if (!user) throw new Error('User missing');

  // Ensure directory exists
  const absoluteDir = path.join(process.cwd(), uploadsDir);
  await fs.mkdir(absoluteDir, { recursive: true });

  const timestamp = Date.now();
  const filename = `${user._id}_${timestamp}.png`;
  const filepath = path.join(absoluteDir, filename);
 
  const qrContent = content || user.employeeIdHash || user.employeeId || '';

  // Write PNG file synchronously (QRCode.toFile returns a Promise)
  await QRCode.toFile(filepath, qrContent, { type: 'png', errorCorrectionLevel: 'H', margin: 1, width: 512 });

  // Return a relative path that your express.static will serve (adjust if you serve uploads from other path)
  const relativePath = `/${uploadsDir}/${filename}`; // e.g. /uploads/qrcodes/...
  return relativePath;
}
 