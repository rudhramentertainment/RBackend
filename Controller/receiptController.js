import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import Receipt from "../Models/Receipt.js";
import Invoice from "../Models/Invoice.js";
import Client from "../Models/Client.js";

// Function to convert number to words (for amount in words)
const numberToWords = (num) => {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if ((num = num.toString()).length > 9) return "Overflow";
  let n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return;
  let str = "";
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " Crore " : "";
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " Lakh " : "";
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " Thousand " : "";
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + " Hundred " : "";
  str += (n[5] != 0) ? ((str != "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) + " " : "";
  return str + "Only";
};


export const generateReceipt = async (req, res) => {
  try {
   const { invoiceNo, paymentType, chequeOrTxnNo, notes, amount } = req.body;

    const invoice = await Invoice.findOne({ invoiceNo }).populate("client subCompany");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    const client = invoice.client; // FIXED

    const receiptCount = await Receipt.countDocuments();
    const receiptNo = `RUD-${(receiptCount + 1).toString().padStart(3, "0")}`;

    const paymentAmount = amount || invoice.totalAmount;
    const amountInWords = numberToWords(paymentAmount);

    const receipt = new Receipt({
      receiptNo,
      client: client._id,
      invoice: invoice._id,
      amount: paymentAmount,
      amountInWords,
      paymentType,
      chequeOrTxnNo,
      notes
    });

    const receiptsDir = path.resolve("receipts");
    if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir);

    const pdfPath = path.join(receiptsDir, `${receiptNo}.pdf`);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(fs.createWriteStream(pdfPath));

    // Logo & Title
    doc.fontSize(18).fillColor("#B66A28").text("RUDHRAM entertainment", 50, 50);
    doc.fontSize(10).fillColor("gray").text("Leading What's Next..!", 50, 70);
    doc.fontSize(16).fillColor("black").text("Receipt", { align: "center" });

    // Details
    doc.moveDown();
    doc.fontSize(10).text(`Receipt No: ${receiptNo}`, { align: "right" });
    doc.text(`Date: ${new Date(receipt.receiptDate).toLocaleDateString()}`, { align: "right" });

    doc.moveDown(1.5);
    doc.text(`Received with thanks from ${client.name}`);
    doc.text(`a sum of Rupees ${amountInWords}`);
    doc.text(`against Invoice Number: ${invoice.invoiceNo}`);
    doc.text(`Dated: ${new Date(invoice.invoiceDate).toLocaleDateString()}`);
    doc.text(`through ${paymentType}${chequeOrTxnNo ? ` no. ${chequeOrTxnNo}` : ""}`);
    doc.text(`Dated: ${new Date().toLocaleDateString()}`);

    doc.moveDown();
    doc.fontSize(12).text(`Amount: ₹ ${amount}`, { continued: false });
    doc.moveDown(3);
    doc.text("Authorised Signatory", { align: "right" });

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#B66A28").text(
      "SNS PLATINA, HG1, nr. University Road, Someshwara Enclave, Vesu, Surat, Gujarat 395007",
      { align: "center" }
    );
    doc.text("info@rudhram.co.in / 6358219521", { align: "center" });

    doc.end();

    receipt.pdfUrl = `/receipts/${receiptNo}.pdf`; 
    await receipt.save();

    res.status(201).json({
      success: true,
      message: "Receipt generated successfully",
      data: receipt,
    });
  } catch (error) {
    console.error("Receipt generation error:", error);
    res.status(500).json({ success: false, message: "Failed to generate receipt" });
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
