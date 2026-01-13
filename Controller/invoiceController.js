import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import axios from "axios";
import Invoice from "../Models/Invoice.js";
import Client from "../Models/Client.js";
import SubCompany from "../Models/SubCompany.js";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
import { executablePath } from "puppeteer";
import { sendInvoiceEmail } from "../utils/emailService.js";

function numberToWords(num) {
  if (num == null || isNaN(num)) return "Zero Rupees";
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  const ones = ["", "One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["", "", "Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function conv(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " Hundred " + (n%100 ? conv(n%100) : "");
    if (n < 100000) return conv(Math.floor(n/1000)) + " Thousand " + (n%1000 ? conv(n%1000) : "");
    if (n < 10000000) return conv(Math.floor(n/100000)) + " Lakh " + (n%100000 ? conv(n%100000) : "");
    return conv(Math.floor(n/10000000)) + " Crore " + (n%10000000 ? conv(n%10000000) : "");
  }
  let w = conv(rupees) + " Rupees";
  if (paise > 0) w += " and " + conv(paise) + " Paise";
  return w;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstLine(s) {
  if (!s) return "";
  return String(s).split(/\r?\n/)[0].slice(0, 120);
}

function escapeRegExp(s = "") {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


async function allocateInvoiceNumber({ client, subCompany }) {
  // Get all invoices of this pair sorted oldest -> newest (lightweight select)
  const pairInvoices = await Invoice.find({
    client: client._id,
    subCompany: subCompany._id,
  })
    .select("invoiceNo createdAt")
    .sort({ createdAt: 1 })
    .lean();

  // If no invoice exists for this pair, bump subCompany counter and issue new base.
  if (pairInvoices.length === 0) {
    const updatedSc = await SubCompany.findByIdAndUpdate(
      subCompany._id,
      { $inc: { currentInvoiceCount: 1 } },
      { new: true }
    ).lean();

    const paddedCount = String(Number(updatedSc.currentInvoiceCount)).padStart(
      3,
      "0"
    );
    const prefix =
      updatedSc.prefix ||
      ((client.subCompanyTitlesNo || [])[0]) ||
      "PAN";

    const invoiceBase = `${prefix}-${paddedCount}`;
    return { invoiceNo: invoiceBase, invoiceBase, bumpedCounter: true };
  }

  // There are existing invoices – keep the base of the oldest invoice.
  const firstNo = pairInvoices[0].invoiceNo || "";
  const m = firstNo.match(/^([A-Za-z]+-\d+)/); // "JOG-006"
  const invoiceBase = m ? m[1] : firstNo.split(/\s*\(/)[0].trim();

  // Find highest suffix used so far for this base
  const baseRe = new RegExp(
    `^${escapeRegExp(invoiceBase)}(?:\\s*\\((\\d+)\\))?$`
  );

  let maxSuffix = 0;
  for (const inv of pairInvoices) {
    const mm = (inv.invoiceNo || "").match(baseRe);
    if (mm) {
      const n = mm[1] ? parseInt(mm[1], 10) : 0; // bare base counts as 0
      if (!isNaN(n)) maxSuffix = Math.max(maxSuffix, n);
    }
  }

  const nextSuffix = maxSuffix + 1;
  const invoiceNo = `${invoiceBase} (${nextSuffix})`;
  return { invoiceNo, invoiceBase, bumpedCounter: false };
}

export const generateInvoicePDF = async (req, res) => {
  try {
    const {
      clientId: rawClientId,
      subCompanyId,
      items = [],
      dueDate,
      notes = "",
      includeGst = true,
      // ✅ MANUALLY ENTERED FIELDS BY ADMIN
      clientName,
      clientGstNumber,
      clientAddress,
      clientCity,
      clientState,
    } = req.body;

    // === Lookup client (ObjectId or business code) ===
    let client = null;
    if (rawClientId && mongoose.Types.ObjectId.isValid(rawClientId)) {
      client = await Client.findById(rawClientId).lean();
    }
    if (!client && rawClientId) {
      client = await Client.findOne({
        $or: [
          { clientId: rawClientId },
          { clientCode: rawClientId },
          { businessId: rawClientId },
          { email: rawClientId },
        ],
      }).lean();
    }

    // === Lookup subCompany ===
    let subCompany = null;
    if (subCompanyId && mongoose.Types.ObjectId.isValid(subCompanyId)) {
      subCompany = await SubCompany.findById(subCompanyId).lean();
    }
    if (!subCompany && subCompanyId) {
      subCompany = await SubCompany.findOne({ _id: subCompanyId })
        .lean()
        .catch(() => null);
    }

    if (!client || !subCompany) {
      return res
        .status(404)
        .json({ message: "Client or Sub-company not found" });
    }

    // === Normalize items: ensure {title, description, qty, rate, amount} ===
    const normalizedItems = (Array.isArray(items) ? items : []).map((i) => {
      const title = (i.title ?? i.serviceTitle ?? "").toString().trim();
      const description = (i.description ?? i.desc ?? i.service ?? "")
        .toString()
        .trim();
      const qty = Number(i.qty) || 0;
      const rate = Number(i.rate) || 0;
      const amount = parseFloat((qty * rate).toFixed(2));
      return {
        title: title || firstLine(description) || "-",
        description: description || title || "-",
        qty,
        rate,
        amount,
      };
    });

    const subtotal = parseFloat(
      normalizedItems
        .reduce((acc, s) => acc + (s.amount || 0), 0)
        .toFixed(2)
    );
    const gstRate = Number(subCompany.gstRate ?? 18);
    const gstAmount = includeGst
      ? parseFloat(((subtotal * gstRate) / 100).toFixed(2))
      : 0;
    const total = parseFloat((subtotal + gstAmount).toFixed(2));
    const createdAt = new Date();

    // === Helper: embed any local image as data URI ===
    function embedLocalImageAsDataUri(possiblePaths) {
      if (!possiblePaths) return null;
      const arr = Array.isArray(possiblePaths) ? possiblePaths : [possiblePaths];
      for (let p of arr) {
        if (!p) continue;
        if (p.startsWith("/")) p = p.replace(/^\/+/, "");
        const candidates = [
          path.join(process.cwd(), p),
          path.join(process.cwd(), "public", p),
          path.join(process.cwd(), "assets", p),
          path.join(process.cwd(), "uploads", p),
          path.join(process.cwd(), p),
        ];
        for (const c of candidates) {
          try {
            if (fs.existsSync(c)) {
              const buff = fs.readFileSync(c);
              const ext = path.extname(c).toLowerCase();
              let mime = "image/png";
              if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
              if (ext === ".svg") mime = "image/svg+xml";
              const base64 = buff.toString("base64");
              return `data:${mime};base64,${base64}`;
            }
          } catch {
            continue;
          }
        }
      }
      return null;
    }

    const mainLogoCandidates = [
      "logo.png",
      "/logo.png",
      "public/logo.png",
      "assets/logo.png",
    ];
    const mainLogoData = embedLocalImageAsDataUri(mainLogoCandidates);
    const subLogoData = embedLocalImageAsDataUri([
      subCompany.logoUrl,
      subCompany.logo,
      `uploads/${subCompany.logoUrl?.replace(/^\/+/, "")}`,
    ]);

    // === Allocate invoice number according to your rules (with retry on duplicates) ===
    let invoiceNo, invoiceBase;
    const maxRetries = 3;
    let attempt = 0;

    async function computeInvoiceNo() {
      const { invoiceNo: no, invoiceBase: base } = await allocateInvoiceNumber({
        client,
        subCompany,
      });
      invoiceNo = no;
      invoiceBase = base;
    }

    // Build HTML generator that uses current invoiceNo
    const buildHtml = () => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(invoiceNo)}</title>
<style>
  @page { size: A4; margin: 6mm 6mm; }
  body{font-family: Arial, Helvetica, sans-serif; margin:0; color:#222; -webkit-print-color-adjust:exact;}
  .page{width:100%;height:100%;padding:6mm;box-sizing:border-box;}
  .container{border:1px solid #ddd;height:calc(297mm - 12mm);box-sizing:border-box;padding:6mm;position:relative;}
  .header{display:flex;align-items:flex-start;gap:12px;}
  .logo-left{width:110px;}
  .logo-left img{width:100%;height:auto;object-fit:contain;display:block;}
  .center{flex:1;text-align:center;padding-top:6px;}
  .center .name{color:#a36a2c;font-weight:700;font-size:18px;}
  .center .tag{font-size:10px;color:#666;margin-top:2px;}
  .right{width:160px;text-align:right;}
  .sub-logo{width:120px;height:60px;display:inline-block;}
  .sub-logo img{max-width:100%;max-height:100%;display:block;margin:6px auto;}
  .invoice-title{font-size:24px;font-weight:700;margin-top:4px;}
  .meta{font-size:11px;color:#333;margin-top:4px;}
  .bill{margin-top:12px;font-size:12px;}
  table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed;font-size:12px;}
  thead th{background:#f5f5f5;padding:8px;border:1px solid #e6e6e6;text-align:left;font-weight:700;}
  tbody td{padding:8px;border:1px solid #eee;vertical-align:top;}
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .col-sr{width:6%;}
  .col-services{width:56%;word-wrap:break-word;}
  .col-qty{text-align:right;width:8%;}
  .col-rate{text-align:right;width:15%;}
  .col-amount{text-align:right;width:15%;}
  .service-title{font-weight:700;font-size:12px;}
  .service-desc{font-size:11px;color:#444;margin-top:4px;white-space:pre-wrap;}
  .bottom{display:flex;gap:12px;margin-top:12px;align-items:flex-start;}
  .bank{width:58%;background:#fafafa;padding:10px;border:1px solid #eee;font-size:11px;line-height:1.45;}
  .bank strong{color:#a36a2c;}
  .totals{width:40%;padding:10px;border:1px solid #eee;font-size:12px;}
  .totals .row{display:flex;justify-content:space-between;margin-bottom:8px;}
  .totals .total{font-weight:700;color:#a36a2c;font-size:14px;margin-top:6px;}
  .amount-words{margin-top:10px;font-size:11px;}
  .notes{margin-top:6px;font-size:11px;}
  .terms{margin-top:10px;font-size:10px;color:#333;}
  .signature{position:absolute;right:14mm;bottom:20mm;text-align:center;font-size:11px;}
  .signature .line{border-top:1px solid #999;width:160px;margin-bottom:6px;}
  .footer{position:absolute;left:0;right:0;bottom:6mm;text-align:center;color:#a36a2c;font-size:10px;}
</style>
</head>
<body>
  <div class="page">
    <div class="container">

      <div class="header">
        <div class="logo-left">
          ${
            mainLogoData
              ? `<img src="${mainLogoData}" alt="main-logo">`
              : `<div style="width:100px;height:60px;border:1px solid #eee;"></div>`
          }
        </div>

        <div class="center">
          <div class="name">${escapeHtml(
            subCompany.name || "Rudhram Entertainment"
          )}</div>
          <div class="tag">${escapeHtml(
            subCompany.tagline || "Leading What's Next..!"
          )}</div>
        </div>

        <div class="right">
          <div class="sub-logo">${
            subLogoData ? `<img src="${subLogoData}" alt="sub-logo">` : ""
          }</div>

          <div class="meta">
            <div style="font-size:11px;color:#666">Client ID: <strong>${escapeHtml(
              client.clientId || client.clientCode || ""
            )}</strong></div>
            <div class="invoice-title">INVOICE</div>
            <div>Invoice No: ${escapeHtml(invoiceNo)}</div>
            <div>Date: ${escapeHtml(createdAt.toLocaleDateString())}</div>
            <div>DUE Date: ${
              dueDate
                ? escapeHtml(new Date(dueDate).toLocaleDateString())
                : "-"
            }</div>
          </div>
        </div>
      </div>

      <div class="bill">
        <div><strong>To,</strong></div>
        <div style="margin-top:6px;line-height:1.3">
         ${escapeHtml(clientName || "N/A")}<br/>
          ${escapeHtml(client.businessName || "")}<br/>
          ${escapeHtml(client.email || "")}<br/>
          ${escapeHtml(client.phone || "")}<br/>
          ${escapeHtml(clientAddress || "-")}<br/>
          ${escapeHtml(clientCity || "")}${clientState ? ", " + escapeHtml(clientState) : ""}<br/>
          GST No: ${escapeHtml(clientGstNumber || "-")}<br/>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="col-sr">Sr. No.</th>
            <th class="col-services">Services</th>
            <th class="col-qty">Qty.</th>
            <th class="col-rate">Rate</th>
            <th class="col-amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${normalizedItems
            .map(
              (s, i) => `
            <tr>
              <td class="col-sr">${i + 1}</td>
              <td class="col-services">
                <div class="service-title">${escapeHtml(s.title || "-")}</div>
                <div class="service-desc">${escapeHtml(
                  s.description || ""
                )}</div>
              </td>
              <td class="col-qty">${s.qty}</td>
              <td class="col-rate">₹${Number(s.rate || 0).toFixed(2)}</td>
              <td class="col-amount">₹${Number(s.amount || 0).toFixed(2)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <div class="bottom">
        <div class="bank">
          <div style="color:#a36a2c;font-weight:700;margin-bottom:6px">Bank Details</div>
          <div>Bank Name: HDFC Bank</div>
          <div>Account Holder: Rudhram Entertainment</div>
          <div>Account Type: Current Account</div>
          <div>Account Number: 50200095934904</div>
          <div>IFSC Code: HDFC0006679</div>
          <div>UPI ID: 7285833101@hdfcbank</div>
        </div>

        <div class="totals">
          <div class="row"><div>Subtotal</div><div>₹${subtotal.toFixed(
            2
          )}</div></div>
          <div class="row"><div>GST (${
            includeGst ? gstRate : 0
          }%)</div><div>₹${gstAmount.toFixed(2)}</div></div>
          <div class="row total"><div>Total</div><div>₹${total.toFixed(
            2
          )}</div></div>
        </div>
      </div>

      <div class="amount-words"><strong>Amount in words:</strong> ${escapeHtml(
        numberToWords(total)
      )} only.</div>
      ${
        notes
          ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(notes)}</div>`
          : ""
      }

      <div class="terms">
        <div style="color:#a36a2c;font-weight:700;margin-top:8px">Terms & Conditions of Payment</div>
        <div style="margin-top:6px;line-height:1.3">
          1. Payment is due within 7 days of invoice date.<br/>
          2. Late payments may incur a 5% monthly interest fee.<br/>
          3. All prices are exclusive of applicable taxes unless stated otherwise.<br/>
          <strong>GST : ${escapeHtml(
            subCompany.gstNumber || "27CYSPG6483K1ZK"
          )}</strong>
        </div>
      </div>

      <div class="signature">
        <div class="line"></div>
        <div>${escapeHtml(
          subCompany.authorisedSignatory || "Authorised Signatory"
        )}</div>
      </div>

      <div class="footer">
        ${escapeHtml(
          subCompany.addressLine1 ||
            "SNS PLATINA, HG1, nr. University Road, Someshwara Enclave, Vesu"
        )} • ${escapeHtml(
      subCompany.addressLine2 || "Surat, Gujarat 395007"
    )} • ${escapeHtml(
      subCompany.contactEmail || "info@rudhram.co.in / 6358219521"
    )}
      </div>

    </div>
  </div>
</body>
</html>`;

    // Prepare output folder
    const invoicesDir = path.resolve("invoices");
    if (!fs.existsSync(invoicesDir))
      fs.mkdirSync(invoicesDir, { recursive: true });

    // Try up to maxRetries to avoid rare duplicate-key races
    while (attempt < maxRetries) {
      attempt += 1;
      await computeInvoiceNo(); // sets invoiceNo & invoiceBase

      // PDF filenames are based on invoiceNo
      const safeName = invoiceNo.replace(/[^\w\-() ]+/g, "").replace(/\s+/g, " ");
      const fileName = `${safeName}.pdf`;
      const filePath = path.join(invoicesDir, fileName);
      const pdfUrl = `/api/invoices/file/${fileName}`;

      // Render PDF via puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath(),
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(buildHtml(), { waitUntil: "networkidle0" });
        await page.emulateMediaType("screen");
        await page.pdf({
          path: filePath,
          format: "A4",
          printBackground: true,
          margin: { top: "6mm", bottom: "10mm", left: "6mm", right: "6mm" },
        });
      } finally {
        await browser.close();
      }

      // Try to save invoice (unique index on invoiceNo may throw)
      try {
        const invoiceDoc = await Invoice.create({
          invoiceNo,
          client: client._id,
          subCompany: subCompany._id,
          services: normalizedItems.map((s) => ({
            title: s.title,
            description: s.description,
            qty: s.qty,
            rate: s.rate,
            amount: s.amount,
          })),
          subtotal,
          gstRate: includeGst ? gstRate : 0,
          gstAmount,
          totalAmount: total,
          invoiceDate: createdAt,
          dueDate,
          notes,
          pdfUrl,
          status: "Pending",
        });

        // Email (best-effort; non-blocking for API result)
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const publicUrl = `${baseUrl}${pdfUrl}`;
        try {
          await sendInvoiceEmail({
            client,
            invoice: invoiceDoc.toObject(),
            filePath,
            publicUrl,
          });
        } catch (e) {
          console.warn("⚠️ sendInvoiceEmail failed:", e.message);
        }

        return res.status(201).json({
          success: true,
          message: "Invoice generated successfully",
          invoiceNo,
          pdfUrl,
          invoiceId: invoiceDoc._id,
        });
      } catch (err) {
        // If duplicate key on invoiceNo, loop and try again with a fresh allocation.
        const isDup =
          err?.code === 11000 ||
          /duplicate key/i.test(err?.message || "");
        if (isDup && attempt < maxRetries) {
          // Remove the just-created (conflicting) PDF file to keep folder clean
          try {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
          } catch {}
          continue; // retry
        }
        console.error("Invoice save failed:", err);
        return res
          .status(500)
          .json({ success: false, message: err.message || "Server error" });
      }
    }

    // If we exhausted retries (very unlikely)
    return res.status(500).json({
      success: false,
      message:
        "Could not allocate a unique invoice number after multiple attempts. Please try again.",
    });
  } catch (err) {
    console.error("Invoice generation failed:", err);
    return res
      .status(500)
      .json({ success: false, message: err.message || "Server error" });
  }
};

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