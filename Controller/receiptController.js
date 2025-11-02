import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import Receipt from "../Models/Receipt.js";
import Invoice from "../Models/Invoice.js";
import Client from "../Models/Client.js";
// ⛔ remove: import { toWords } from "number-to-words";
// ✅ correct:
// import numberToWords from "number-to-words";
import puppeteer from "puppeteer";
import mongoose from "mongoose";

// Function to convert number to words (for amount in words)
// const numberToWords = (num) => {
//   const a = [
//     "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
//     "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
//     "Sixteen", "Seventeen", "Eighteen", "Nineteen"
//   ];
//   const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

//   if ((num = num.toString()).length > 9) return "Overflow";
//   let n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
//   if (!n) return;
//   let str = "";
//   str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " Crore " : "";
//   str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " Lakh " : "";
//   str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " Thousand " : "";
//   str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + " Hundred " : "";
//   str += (n[5] != 0) ? ((str != "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) + " " : "";
//   return str + "Only";
// };

function numberToWords(num) {
  if (num == null || isNaN(num)) return "Zero";
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  const ones = ["", "One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["", "", "Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function conv(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + conv(n%100) : "");
    if (n < 100000) return conv(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + conv(n%1000) : "");
    if (n < 10000000) return conv(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + conv(n%100000) : "");
    return conv(Math.floor(n/10000000)) + " Crore" + (n%10000000 ? " " + conv(n%10000000) : "");
  }
  let w = conv(rupees) + " Rupees";
  if (paise > 0) w += " and " + conv(paise) + " Paise";
  return w;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function embedLocalImageAsDataUri(possiblePaths) {
  if (!possiblePaths) return null;
  const arr = Array.isArray(possiblePaths) ? possiblePaths : [possiblePaths];
  const candidates = [];
  for (let p of arr) {
    if (!p) continue;
    if (p.startsWith("/")) p = p.replace(/^\/+/, "");
    candidates.push(path.join(process.cwd(), p));
    candidates.push(path.join(process.cwd(), "public", p));
    candidates.push(path.join(process.cwd(), "assets", p));
    candidates.push(path.join(process.cwd(), "uploads", p));
    candidates.push(path.join(process.cwd(), p));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const buff = fs.readFileSync(c);
        const ext = (path.extname(c) || ".png").toLowerCase();
        let mime = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        if (ext === ".svg") mime = "image/svg+xml";
        const base64 = buff.toString("base64");
        return `data:${mime};base64,${base64}`;
      }
    } catch (err) {
      continue;
    }
  }
  return null;
}
// -------------------- end helpers --------------------

// Helper to get atomic incrementing sequence value
async function getNextSequenceValue(sequenceName) {
  // use native collection to avoid creating a model
  const coll = mongoose.connection.collection('counters');
  const result = await coll.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' } // returnDocument:'after' works with Node MongoDB driver >=4.0
  );
  // If result.value is missing (very unlikely), default to 1
  const seq = (result && result.value && result.value.seq) ? result.value.seq : 1;
  return seq;
}


export const generateReceipt = async (req, res) => {
  try {
    const { invoiceNo, paymentType, chequeOrTxnNo, notes, amount } = req.body;

    // 1) find invoice and populate client
    const invoice = await Invoice.findOne({ invoiceNo }).populate("client");
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const client = invoice.client || {};

    // 2) receipt number
   const seq = await getNextSequenceValue('receiptSeq'); // name the counter key
const receiptNo = `RUD-${String(seq).padStart(3, '0')}`;

    // 3) amount and words
    const paymentAmount = (typeof amount !== "undefined" && amount !== null) ? Number(amount) : Number(invoice.totalAmount || 0);
    const amountRounded = Number(paymentAmount.toFixed(2));
    const amountWords = numberToWords(amountRounded);

    // 4) save receipt doc (we'll update pdfUrl and save after pdf generation)
    const receipt = new Receipt({
      receiptNo,
      client: client._id || null,
      invoice: invoice._id,
      amount: amountRounded,
      amountInWords: amountWords,
      paymentType: paymentType || "cash",
      chequeOrTxnNo: chequeOrTxnNo || "",
      notes: notes || "",
      receiptDate: new Date()
    });

    // 5) prepare receipts dir
    const receiptsDir = path.resolve("receipts");
    if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
    const pdfFilename = `${receiptNo}.pdf`;
    const pdfPath = path.join(receiptsDir, pdfFilename);

    // 6) embed logo (try common locations)
    const mainLogoCandidates = ["logo.png", "/logo.png", "public/logo.png", "assets/logo.png", "public/assets/logo.png"];
    const mainLogoData = embedLocalImageAsDataUri(mainLogoCandidates);

    // 7) format dates
    const invoiceDateStr = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB') : "";
    const receiptDateStr = new Date().toLocaleDateString('en-GB');

    // get clientId to print (fall back if different field name used)
    const clientIdToPrint = client.clientId || client.clientCode || clientId || "";

    // 8) build HTML (professional layout) — clientId included under client name, amount in words not italic
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt ${receiptNo}</title>
<style>
  @page { size: A4; margin: 10mm 10mm; }
  body{font-family: Arial, Helvetica, sans-serif; margin:0; color:#222; -webkit-print-color-adjust:exact;}
  .page{padding:12mm;box-sizing:border-box;}
  .card{border:1px solid #e6e6e6;padding:18px;border-radius:6px;}
  .top {display:flex;align-items:center;gap:16px;}
  .logo {width:72px;height:72px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#f3e9e0;display:flex;align-items:center;justify-content:center;}
  .brand {color:#B87333;font-weight:700;font-size:20px;line-height:1;}
  .tag {font-size:11px;color:#999;margin-top:4px;}
  .title {flex:1;text-align:center;}
  .title h1{margin:0;font-size:26px;}
  .meta {text-align:right;font-size:12px;color:#333;}
  .content {margin-top:18px;font-size:13px;line-height:1.45;}
  .muted {color:#666;}
  .grid {display:grid;grid-template-columns: 1fr auto;gap:8px;align-items:start;}
  .amount-box {border:1px solid #e6e6e6;padding:10px;width:180px;font-weight:700;font-size:18px;background:#fff;}
  .sig {text-align:right;margin-top:22px;}
  .sig .line{border-top:1px solid #aaa;width:200px;margin-left:auto;padding-top:6px;}
  .footer {margin-top:30px;text-align:center;color:#B87333;font-size:11px;}
  .divider {height:1px;background:linear-gradient(90deg,#fff,#e6d6c6,#fff);margin:12px 0;border-radius:1px;}
  .small {font-size:11px;color:#777;}
  /* amount words normal (no italic) */
  .amount-words { margin-top:6px; font-style: normal; font-size:13px; color:#444; }
</style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="top">
        <div class="logo">
          ${ mainLogoData ? `<img src="${mainLogoData}" style="width:100%;height:auto;display:block" />` : `<div style="font-weight:700;color:#B87333">R</div>` }
        </div>

        <div>
          <div class="brand">RUDHRAM</div>
          <div class="tag">entertainment — Leading What's Next..!</div>
        </div>

        <div class="title">
          <h1>Receipt</h1>
        </div>

        <div class="meta">
          <div><strong>Receipt No:</strong> ${escapeHtml(receiptNo)}</div>
          <div><strong>Date:</strong> ${escapeHtml(receiptDateStr)}</div>
        </div>
      </div>

      <div class="content">
        <div class="muted">Received with thanks from</div>
        <div style="font-weight:700;margin-top:6px">${escapeHtml(client.name || client.customerName || "—")}</div>
        ${ clientIdToPrint ? `<div class="small" style="margin-top:4px">Client ID: <strong>${escapeHtml(clientIdToPrint)}</strong></div>` : "" }

        <div style="margin-top:10px" class="muted">a sum of Rupees</div>
        <div class="amount-words">${escapeHtml(amountWords)} Only</div>

        <div style="margin-top:12px" class="grid">
          <div>
            <div class="small"><strong>Against Invoice Number</strong></div>
            <div style="margin-top:6px">${escapeHtml(invoice.invoiceNo || "-")}</div>

            <div style="margin-top:10px" class="small"><strong>Dated</strong></div>
            <div style="margin-top:6px">${escapeHtml(invoiceDateStr || "-")}</div>

            <div style="margin-top:10px" class="small"><strong>Through</strong></div>
            <div style="margin-top:6px">${escapeHtml(paymentType || "N/A")}</div>

            <div style="margin-top:10px" class="small"><strong>Txn/Cheque No</strong></div>
            <div style="margin-top:6px">${escapeHtml(chequeOrTxnNo || "-")}</div>
          </div>

          <div>
            <div class="small">Amount</div>
            <div class="amount-box">₹ ${amountRounded.toFixed(2)}</div>
          </div>
        </div>

        <div class="divider"></div>

        ${ notes ? `<div class="small"><strong>Notes:</strong> ${escapeHtml(String(notes).slice(0, 800))}</div>` : "" }

        <div class="sig">
          <div class="line">Authorised Signatory</div>
        </div>

      </div>

      <div class="footer">
        SNS PLATINA, HG1, nr. University Road, Someshwara Enclave, Vesu • Surat, Gujarat 395007<br/>
        info@rudhram.co.in • 6358219521
      </div>
    </div>
  </div>
</body>
</html>
`;

    // 9) render PDF with puppeteer (use safe wait)
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      // small pause to let image/data-URI reflows happen on some systems
      await new Promise((r) => setTimeout(r, 120)); // compatible with all puppeteer versions

      await page.emulateMediaType("screen");
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }
      });
    } finally {
      await browser.close();
    }

    // 10) persist pdfUrl and save receipt
    receipt.pdfUrl = `/receipts/${pdfFilename}`;
    await receipt.save();

    return res.status(201).json({
      success: true,
      message: "Receipt generated successfully",
      data: receipt
    });

  } catch (error) {
    console.error("Receipt generation error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate receipt", error: error.message });
  }
};

export const getAllReceipts = async (req, res) => {
  try {
    const receipts = await Receipt.find()
      .populate("client", "name email phone")
      .populate("invoice", "invoiceNo totalAmount");
    res.status(200).json({ success: true, data: receipts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch receipts" });
  }
};


export const updateReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Receipt.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Receipt not found" });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update receipt" });
  }
};


export const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await Receipt.findByIdAndDelete(id);
    if (!receipt) return res.status(404).json({ success: false, message: "Receipt not found" });

    if (fs.existsSync(receipt.pdfUrl)) fs.unlinkSync(receipt.pdfUrl);

    res.status(200).json({ success: true, message: "Receipt deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete receipt" });
  }
};


// ✅ View Receipt PDF by receipt number
export const viewReceiptPDF = async (req, res) => {
  try {
    const { receiptNo } = req.params;

    const receiptsDir = path.resolve("receipts");
    const filePath = path.join(receiptsDir, `${receiptNo}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Receipt PDF not found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Error viewing receipt PDF:", error);
    res.status(500).json({ success: false, message: "Failed to view receipt PDF" });
  }
};

// ✅ Share Receipt (Return shareable link)
export const shareReceipt = async (req, res) => {
  try {
    const { receiptNo } = req.params;
    const receipt = await Receipt.findOne({ receiptNo });
    if (!receipt)
      return res.status(404).json({ success: false, message: "Receipt not found" });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const pdfUrl = `${baseUrl}${receipt.pdfUrl}`;

    res.status(200).json({
      success: true,
      message: "Receipt share link generated successfully",
      pdfUrl,
    });
  } catch (error) {
    console.error("Error generating share link:", error);
    res.status(500).json({ success: false, message: "Failed to share receipt" });
  }
};
