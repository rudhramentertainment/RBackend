import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import Invoice from "../Models/Invoice.js";
import Client from "../Models/Client.js";
import SubCompany from "../Models/SubCompany.js";

export const generateInvoicePDF = async (req, res) => {
  try {
    const { clientId, subCompanyId, items, dueDate, notes } = req.body;
    const services = items || [];

    const client = await Client.findOne({ clientId });
    const subCompany = await SubCompany.findById(subCompanyId);
    if (!client || !subCompany) {
      return res.status(404).json({ message: "Client or Sub‑company not found" });
    }

    subCompany.currentInvoiceCount = (Number(subCompany.currentInvoiceCount) || 0) + 1;
    const paddedCount = String(subCompany.currentInvoiceCount).padStart(3, "0");
    const subCompanyCode = (client.subCompanyTitlesNo || []).find(code =>
      code.startsWith(subCompany.prefix)
    ) || subCompany.prefix || "PAN";
    const invoiceNo = `${subCompanyCode}-${paddedCount}`;
    await subCompany.save();

    const subtotal = services.reduce((acc, s) => acc + (Number(s.qty) || 0) * (Number(s.rate) || 0), 0);
    const gstRate = Number(subCompany.gstRate ?? 18);
    const gstAmount = parseFloat(((subtotal * gstRate) / 100).toFixed(2));
    const total = parseFloat((subtotal + gstAmount).toFixed(2));

    const servicesWithAmount = services.map(s => ({
      ...s,
      amount: (Number(s.qty) || 0) * (Number(s.rate) || 0),
    }));

    // Create invoices directory if it doesn't exist
    const invoicesDir = path.resolve("invoices");
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    
    const fileName = `${invoiceNo}.pdf`;
    const filePath = path.join(invoicesDir, fileName);
    const pdfUrl = `/api/invoices/file/${fileName}`;

    const doc = new PDFDocument({ 
      margin: 40, 
      size: "A4",
      bufferPages: true
    });
    
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const brandBrown = "#a36a2c";
    const darkGray = "#333";

    // Outer border
    doc.lineWidth(0.7).rect(36, 36, 523, 740).stroke("#999");

    // Try multiple paths for main logo
    const possibleLogoPaths = [
      path.resolve("logo.png"),
      path.resolve("../logo.png"),
      path.resolve("./logo.png"),
      path.resolve("public/logo.png"),
      path.resolve("../public/logo.png"),
      path.resolve("assets/logo.png"),
      path.resolve("../assets/logo.png")
    ];

    let logoFound = false;
    let mainLogoPath = null;

    for (const logoPath of possibleLogoPaths) {
      try {
        if (fs.existsSync(logoPath)) {
          mainLogoPath = logoPath;
          logoFound = true;
          break;
        }
      } catch (err) {
        continue;
      }
    }

    // Top‑left main logo
    if (logoFound && mainLogoPath) {
      try {
        doc.image(mainLogoPath, 48, 48, { width: 80, height: 60 });
      } catch (err) {
        doc.rect(48, 48, 80, 60).stroke("#ccc");
        doc.fontSize(8).fillColor("#666").text("Logo Error", 58, 75);
      }
    } else {
      doc.rect(48, 48, 80, 60).stroke("#ccc");
      doc.fontSize(8).fillColor("#666").text("Company Logo", 58, 75);
    }

    // Top‑center: sub company name + tagline
    doc.fontSize(16).fillColor(brandBrown).font("Helvetica-Bold")
      .text(subCompany.name || "PANIGRAHNA", 140, 55, { 
        width: 250,
        align: "center"
      });
      
    doc.fontSize(9).fillColor("#666").font("Helvetica")
      .text(subCompany.tagline || "Leading What's Next..!", 140, 75, {
        width: 250,
        align: "center"
      });

    // Top‑right sub‑company logo placeholder
    doc.rect(420, 48, 120, 60).stroke("#ccc");
    doc.fontSize(8).fillColor("#666").text("[Sub-company logo]", 430, 75, {
      width: 100,
      align: "center"
    });

    // Top‑right: "INVOICE" and invoice meta
    doc.fontSize(24).fillColor("#000").font("Helvetica-Bold")
      .text("INVOICE", 0, 50, { align: "right" });
      
    const createdAt = new Date();
    doc.fontSize(9).fillColor(darkGray).font("Helvetica")
      .text(`Invoice No: ${invoiceNo}`, 0, 85, { align: "right" })
      .text(`Date: ${createdAt.toLocaleDateString()}`, 0, 100, { align: "right" })
      .text(`DUE Date: ${new Date(dueDate).toLocaleDateString()}`, 0, 115, { align: "right" });

    // Client details section
    let currentY = 140;
    doc.fontSize(10).fillColor("#000").font("Helvetica-Bold").text("Bill To:", 48, currentY);
    
    currentY += 15;
    doc.font("Helvetica").fontSize(10).fillColor("#000");
    
    const clientDetails = [
      client.name,
      client.businessName,
      client.email,
      client.phone,
      client.address
    ].filter(Boolean);
    
    clientDetails.forEach((detail, index) => {
      if (currentY + (index * 15) < 220) {
        doc.text(detail, 48, currentY + (index * 15));
      }
    });

    // Table header
    const tableTop = 220;
    const tableLeft = 48;
    const tableWidth = 500;
    const rowHeight = 25;

    // Draw table header background
    doc.rect(tableLeft, tableTop, tableWidth, rowHeight).fill("#f5f5f5").stroke();
    
    const col = {
      sr: tableLeft + 5,
      desc: tableLeft + 40,
      qty: tableLeft + 320,
      rate: tableLeft + 380,
      amount: tableLeft + 440
    };
    
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("#", col.sr, tableTop + 8);
    doc.text("Description", col.desc, tableTop + 8);
    doc.text("Qty", col.qty, tableTop + 8, { width: 50, align: "right" });
    doc.text("Rate", col.rate, tableTop + 8, { width: 50, align: "right" });
    doc.text("Amount", col.amount, tableTop + 8, { width: 50, align: "right" });

    // Draw vertical lines for header
    doc.strokeColor("#000")
       .lineWidth(0.5)
       .moveTo(col.desc - 5, tableTop)
       .lineTo(col.desc - 5, tableTop + rowHeight)
       .stroke()
       .moveTo(col.qty - 5, tableTop)
       .lineTo(col.qty - 5, tableTop + rowHeight)
       .stroke()
       .moveTo(col.rate - 5, tableTop)
       .lineTo(col.rate - 5, tableTop + rowHeight)
       .stroke()
       .moveTo(col.amount - 5, tableTop)
       .lineTo(col.amount - 5, tableTop + rowHeight)
       .stroke();

    // Table body rows
    let y = tableTop + rowHeight;
    let pageNumber = 1;
    
    const drawTableRow = (item, index, currentY) => {
      // Check if we need a new page
      if (currentY > 650 && index < servicesWithAmount.length - 1) {
        doc.addPage();
        pageNumber++;
        currentY = 100;
        
        // Redraw table header on new page
        doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill("#f5f5f5").stroke();
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
        doc.text("#", col.sr, currentY + 8);
        doc.text("Description", col.desc, currentY + 8);
        doc.text("Qty", col.qty, currentY + 8, { width: 50, align: "right" });
        doc.text("Rate", col.rate, currentY + 8, { width: 50, align: "right" });
        doc.text("Amount", col.amount, currentY + 8, { width: 50, align: "right" });
        
        currentY += rowHeight;
      }

      // Draw row background (alternating colors)
      if (index % 2 === 0) {
        doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill("#fafafa").stroke("#eee");
      } else {
        doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill("#fff").stroke("#eee");
      }

      doc.font("Helvetica").fontSize(9).fillColor("#000");
      doc.text(String(index + 1), col.sr, currentY + 8);
      
      // Handle long descriptions with word wrapping
      const description = item.description || "-";
      doc.text(description, col.desc, currentY + 8, { 
        width: 270,
        ellipsis: true
      });
      
      doc.text(item.qty != null ? String(item.qty) : "-", col.qty, currentY + 8, { width: 50, align: "right" });
      doc.text(item.rate != null ? `₹${Number(item.rate).toFixed(2)}` : "-", col.rate, currentY + 8, { width: 50, align: "right" });
      doc.text(item.amount != null ? `₹${Number(item.amount).toFixed(2)}` : "-", col.amount, currentY + 8, { width: 50, align: "right" });

      return currentY + rowHeight;
    };

    // Draw all service rows
    servicesWithAmount.forEach((item, index) => {
      y = drawTableRow(item, index, y);
    });

    // Ensure we have enough space for the summary section
    if (y > 500) {
      doc.addPage();
      y = 100;
    }

    // Summary section
    const summaryTop = y + 20;

    // Bank details box (left side)
    const bankBoxTop = summaryTop;
    const bankBoxLeft = tableLeft;
    const bankBoxWidth = 280;
    const bankBoxHeight = 90;

    doc.rect(bankBoxLeft, bankBoxTop, bankBoxWidth, bankBoxHeight)
       .fill("#f9f9f9")
       .stroke("#ddd");
    
    doc.fontSize(10).font("Helvetica-Bold").fillColor(brandBrown)
       .text("Bank Details", bankBoxLeft + 10, bankBoxTop + 10);
    
    doc.fontSize(8).font("Helvetica").fillColor("#000");
    const bd = subCompany.bankDetails || {};
    const bankDetails = [
      `Bank: ${bd.bankName || "HDFC Bank"}`,
      `Account: ${bd.accountHolder || subCompany.name || "Panigrahna"}`,
      `Type: ${bd.accountType || "Current Account"}`,
      `A/C No: ${bd.accountNumber || "50200095934904"}`,
      `IFSC: ${bd.ifscCode || "HDFC0006679"}`,
      `UPI: ${bd.upiId || "7285833101@hdfcbank"}`
    ];

    bankDetails.forEach((detail, index) => {
      doc.text(detail, bankBoxLeft + 10, bankBoxTop + 25 + (index * 12));
    });

    // Totals box (right side)
    const totalsBoxLeft = tableLeft + bankBoxWidth + 20;
    const totalsBoxTop = bankBoxTop;
    const totalsBoxWidth = 150;
    const totalsBoxHeight = bankBoxHeight;

    doc.rect(totalsBoxLeft, totalsBoxTop, totalsBoxWidth, totalsBoxHeight)
       .fill("#f9f9f9")
       .stroke("#ddd");

    // Draw totals content
    const totalsY = totalsBoxTop + 15;
    doc.fontSize(9).font("Helvetica").fillColor("#000");
    
    // Subtotal
    doc.text("Subtotal:", totalsBoxLeft + 10, totalsY);
    doc.text(`₹${subtotal.toFixed(2)}`, totalsBoxLeft + 10, totalsY, { 
      align: "right", 
      width: totalsBoxWidth - 20 
    });
    
    // GST
    doc.text(`GST (${gstRate}%):`, totalsBoxLeft + 10, totalsY + 15);
    doc.text(`₹${gstAmount.toFixed(2)}`, totalsBoxLeft + 10, totalsY + 15, { 
      align: "right", 
      width: totalsBoxWidth - 20 
    });
    
    // Total
    doc.font("Helvetica-Bold").fillColor(brandBrown);
    doc.text("Total:", totalsBoxLeft + 10, totalsY + 35);
    doc.text(`₹${total.toFixed(2)}`, totalsBoxLeft + 10, totalsY + 35, { 
      align: "right", 
      width: totalsBoxWidth - 20 
    });

    // Amount in words
    const wordsTop = bankBoxTop + bankBoxHeight + 15;
    doc.fontSize(9).font("Helvetica").fillColor("#000")
       .text(`Amount in words: ${numberToWords(total)} only.`, tableLeft, wordsTop, {
         width: tableWidth
       });

    // Notes section if provided
    if (notes) {
      const notesTop = wordsTop + 25;
      doc.fontSize(9).font("Helvetica-Bold").fillColor(brandBrown)
         .text("Notes:", tableLeft, notesTop);
      doc.font("Helvetica").fillColor("#000")
         .text(notes, tableLeft + 25, notesTop, {
           width: tableWidth - 25
         });
    }

    // Terms & Conditions
    const termsTop = wordsTop + (notes ? 45 : 25);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandBrown)
       .text("Terms & Conditions:", tableLeft, termsTop);
    
    doc.font("Helvetica").fontSize(8).fillColor("#000")
       .text("1. Payment is due within 7 days of invoice date.", tableLeft, termsTop + 12)
       .text("2. Late payments may incur a 5% monthly interest fee.", tableLeft, termsTop + 24)
       .text("3. All prices are exclusive of applicable taxes unless stated otherwise.", tableLeft, termsTop + 36);

    // GST number
    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandBrown)
       .text(`GST: ${subCompany.gstNumber || "27CYSPG6483K1ZK"}`, tableLeft, termsTop + 55);

    // Footer section
    const footerY = 750;
    
    // Company address
    doc.fontSize(8).fillColor(brandBrown).font("Helvetica-Bold")
       .text(subCompany.addressLine1 || "SNS PLATINA, HG1, nr. University Road, Someshwara Enclave, Vesu", 
             0, footerY, { align: "center" });
             
    doc.fontSize(8).fillColor(brandBrown).font("Helvetica-Bold")
       .text(subCompany.addressLine2 || "Surat, Gujarat 395007", 0, footerY + 12, { align: "center" });

    // Contact info
    doc.fontSize(8).fillColor(darkGray).font("Helvetica")
       .text(subCompany.contactEmail || "info@rudhram.co.in / 6358219521", 0, footerY + 26, { align: "center" });

    // Authorized signature
    doc.moveTo(430, footerY + 15).lineTo(540, footerY + 15).stroke();
    doc.fontSize(8).font("Helvetica").text("Authorised Signatory", 430, footerY + 18);

    // Page number
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#666")
         .text(`Page ${i + 1} of ${pageRange.count}`, 500, 780);
    }

    doc.end();

    // Wait for PDF generation to complete
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // Create invoice with PDF URL
    const invoice = await Invoice.create({
      invoiceNo,
      client: client._id,
      subCompany: subCompany._id,
      services: servicesWithAmount,
      subtotal,
      gstRate,
      gstAmount,
      totalAmount: total,
      dueDate,
      notes,
      pdfUrl, // Save PDF URL to database
      status: "Pending"
    });

    res.status(201).json({
      success: true,
      message: "Invoice generated successfully",
      invoiceNo,
      pdfUrl,
      invoiceId: invoice._id,
    });

  } catch (error) {
    console.error("Invoice generation failed:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Enhanced number to words function for Indian numbering system
function numberToWords(num) {
  if (num == null || isNaN(num)) return "";
  
  // Handle decimal values
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convertLessThanThousand = (n) => {
    if (n === 0) return "";
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
  };

  const convert = (n) => {
    if (n === 0) return "Zero";
    
    let str = "";
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const hundred = n % 1000;

    if (crore > 0) {
      str += convertLessThanThousand(crore) + " Crore ";
    }
    if (lakh > 0) {
      str += convertLessThanThousand(lakh) + " Lakh ";
    }
    if (thousand > 0) {
      str += convertLessThanThousand(thousand) + " Thousand ";
    }
    if (hundred > 0) {
      str += convertLessThanThousand(hundred);
    }

    return str.trim();
  };

  let result = convert(rupees) + " Rupees";
  
  if (paise > 0) {
    result += " and " + convertLessThanThousand(paise) + " Paise";
  }
  
  return result;
}

export const getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate("client", "name clientId businessName email phone")
      .populate("subCompany", "name prefix logoUrl")
      .sort({ createdAt: -1 });

    if (!invoices || invoices.length === 0) {
      return res.status(404).json({ success: false, message: "No invoices found" });
    }

    res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id)
      .populate("client", "name clientId businessName email phone address")
      .populate("subCompany", "name prefix logoUrl addressLine1 addressLine2 contactEmail gstNumber bankDetails");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice
    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Build file path
    const invoicesDir = path.resolve("invoices");
    const filePath = path.join(invoicesDir, `${invoice.invoiceNo}.pdf`);

    // Remove the PDF file if exists
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Deleted PDF: ${filePath}`);
      } catch (err) {
        console.error("Failed to delete PDF:", err);
      }
    }

    // Delete invoice document from DB
    await Invoice.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Invoice and PDF deleted successfully",
      deletedInvoiceNo: invoice.invoiceNo,
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ FIXED: Serve PDF file by filename
export const getInvoicePDF = async (req, res) => {
  try {
    const { filename } = req.params;

    // Security check: prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: "Invalid filename" });
    }

    const invoicesDir = path.resolve("invoices");
    const filePath = path.join(invoicesDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "PDF file not found" });
    }

    // Set headers for PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    // Stream the PDF file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("Error serving PDF:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ FIXED: Download PDF by invoice ID
export const downloadInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params; // Changed from filename to id

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const invoicesDir = path.resolve("invoices");
    const filePath = path.join(invoicesDir, `${invoice.invoiceNo}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "PDF file not found" });
    }

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNo}.pdf"`);

    // Stream the PDF file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("Error downloading PDF:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ FIXED: View PDF by invoice ID
export const viewInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const invoicesDir = path.resolve("invoices");
    const filePath = path.join(invoicesDir, `${invoice.invoiceNo}.pdf`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "PDF file not found" });
    }

    // Set headers for PDF viewing
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNo}.pdf"`);

    // Stream the PDF file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("Error viewing PDF:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Share Invoice (Get shareable link)
export const shareInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id)
      .populate("client", "name businessName email")
      .populate("subCompany", "name");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Generate shareable link
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const shareableLink = `${baseUrl}/invoices/share/${invoice._id}`;
    
    const shareToken = Buffer.from(`${invoice._id}:${Date.now()}`).toString("base64");
    const secureShareLink = `${baseUrl}/invoices/share/${shareToken}`;

    res.status(200).json({
      success: true,
      message: "Invoice share details retrieved successfully",
      shareableLink,
      secureShareLink,
      pdfUrl: invoice.pdfUrl,
      invoice: {
        invoiceNo: invoice.invoiceNo,
        client: invoice.client,
        subCompany: invoice.subCompany,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate,
        status: invoice.status
      },
      shareToken,
      expiresIn: "30 days"
    });

  } catch (error) {
    console.error("Error sharing invoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get Invoice by Share Token
export const getInvoiceByShareToken = async (req, res) => {
  try {
    const { token } = req.params;

    // Decode the token
    const decoded = Buffer.from(token, "base64").toString("ascii");
    const [invoiceId, timestamp] = decoded.split(":");

    // Optional: Check if token is expired (e.g., 30 days)
    const tokenAge = Date.now() - parseInt(timestamp);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (tokenAge > thirtyDays) {
      return res.status(410).json({ success: false, message: "Share link has expired" });
    }

    const invoice = await Invoice.findById(invoiceId)
      .populate("client", "name clientId businessName email phone address")
      .populate("subCompany", "name prefix logoUrl addressLine1 addressLine2 contactEmail gstNumber bankDetails");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    res.status(200).json({
      success: true,
      invoice: {
        _id: invoice._id,
        invoiceNo: invoice.invoiceNo,
        client: invoice.client,
        subCompany: invoice.subCompany,
        services: invoice.services,
        subtotal: invoice.subtotal,
        gstRate: invoice.gstRate,
        gstAmount: invoice.gstAmount,
        totalAmount: invoice.totalAmount,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        pdfUrl: invoice.pdfUrl,
        status: invoice.status,
        createdAt: invoice.createdAt
      },
      isShared: true
    });

  } catch (error) {
    console.error("Error accessing shared invoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};