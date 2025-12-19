import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export const generateLeadPDF = (lead, subCompanies, res) => {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  // Headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=Rudhram-Inquiry-${lead.token}.pdf`
  );

  doc.pipe(res);

  const pageWidth = doc.page.width;
  const margin = 40;

  const primary = "#B87333";
  const accent = "#D1A574";
  const background = "#F5E6D3";
  const text = "#111";
  const gray = "#444";

  let y = 40;

  /* ================= LOGO ================= */
  try {
    const logoPath = path.join(process.cwd(), "public/logo.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, margin, y, { width: 60 });
    }
  } catch {}

  /* ================= HEADER ================= */
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(primary)
    .text("Rudhram Entertainment", margin + 80, y + 10);

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(gray)
    .text("Inquiry Confirmation Document", margin + 80, y + 35);

  y += 80;

  doc
    .strokeColor(accent)
    .lineWidth(1)
    .moveTo(margin, y)
    .lineTo(pageWidth - margin, y)
    .stroke();

  y += 30;

  /* ================= LEAD INFORMATION ================= */
  doc.font("Helvetica-Bold").fontSize(14).fillColor(primary);
  doc.text("Lead Information", margin, y);
  y += 15;

  const details = [
    ["Inquiry Token", lead.token],
    ["Name", lead.name],
    ["Email", lead.email || "-"],
    ["Phone", lead.phone || "-"],
    ["Business Name", lead.businessName || "-"],
    ["Business Category", lead.businessCategory || "-"],
    [
      "Created At",
      lead.clientCreatedAtIST ||
        new Date(lead.createdAt).toLocaleString("en-IN"),
    ],
  ];

  y = drawTable(doc, {
    x: margin,
    y,
    widths: [200, pageWidth - margin * 2 - 200],
    head: ["Field", "Value"],
    body: details,
    primary,
    background,
  });

  y += 25;

  /* ================= SERVICES ================= */
  doc.font("Helvetica-Bold").fontSize(14).fillColor(primary);
  doc.text("Selected Services", margin, y);
  y += 15;

  const serviceRows = [];

  if (Array.isArray(lead.chosenServices)) {
    lead.chosenServices.forEach((svc) => {
      const sc = subCompanies.find(
        (s) => s._id.toString() === svc.subCompanyId?.toString()
      );

      if (Array.isArray(svc.selectedOfferings) && svc.selectedOfferings.length) {
        svc.selectedOfferings.forEach((o) => {
          serviceRows.push([
            sc?.name || "Unknown",
            o,
          ]);
        });
      } else {
        serviceRows.push([
          sc?.name || "Unknown",
          "No specific offerings",
        ]);
      }
    });
  }

  if (serviceRows.length > 0) {
    y = drawTable(doc, {
      x: margin,
      y,
      widths: [200, pageWidth - margin * 2 - 200],
      head: ["Service", "Offering"],
      body: serviceRows,
      primary,
      background,
    });
  } else {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(text);
    doc.text("No services selected", margin, y);
    y += 20;
  }

  y += 25;

  /* ================= PROJECT DETAILS ================= */
  doc.font("Helvetica-Bold").fontSize(14).fillColor(primary);
  doc.text("Project Details", margin, y);
  y += 15;

  doc.font("Helvetica").fontSize(11).fillColor(text);
  doc.text(lead.project_details || "N/A", margin, y, {
    width: pageWidth - margin * 2,
    lineGap: 4,
  });

  /* ================= FOOTER ================= */
  const footerY = doc.page.height - 60;

  doc
    .strokeColor(accent)
    .lineWidth(0.5)
    .moveTo(margin, footerY)
    .lineTo(pageWidth - margin, footerY)
    .stroke();

  doc
    .fontSize(10)
    .fillColor("#666")
    .text("Thank you for choosing Rudhram Entertainment.", margin, footerY + 10)
    .text(
      `Generated on: ${new Date(lead.createdAt).toLocaleString("en-IN")}`,
      margin,
      footerY + 25
    );

  doc.end();
};

/* ================= TABLE HELPER ================= */
function drawTable(doc, config) {
  const { x, y, widths, head, body, primary, background } = config;
  let rowY = y;
  const rowHeight = 24;

  // Header
  doc.rect(x, rowY, widths[0] + widths[1], rowHeight)
    .fill(primary);

  doc
    .fillColor("#fff")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(head[0], x + 8, rowY + 7, { width: widths[0] - 16 })
    .text(head[1], x + widths[0] + 8, rowY + 7, {
      width: widths[1] - 16,
    });

  rowY += rowHeight;

  // Rows
  body.forEach((row, index) => {
    if (index % 2 === 0) {
      doc.rect(x, rowY, widths[0] + widths[1], rowHeight).fill(background);
    }

    doc
      .fillColor("#111")
      .font("Helvetica")
      .fontSize(10)
      .text(row[0], x + 8, rowY + 7, { width: widths[0] - 16 })
      .text(row[1], x + widths[0] + 8, rowY + 7, {
        width: widths[1] - 16,
      });

    rowY += rowHeight;
  });

  return rowY;
}
