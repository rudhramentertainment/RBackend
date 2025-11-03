// services/emailService.js
import nodemailer from 'nodemailer';
import util from 'util';

// ---------- SMTP config (direct credentials) ----------
const SMTP_CONFIG = {
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'info@rudhramentertainment.com',
    pass: 'Rudhr@m0606' // app password
  },
   connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,

};

let transporter;
try {
  transporter = nodemailer.createTransport(SMTP_CONFIG);
  transporter.verify((err, success) => {
    if (err) {
      console.error('❌ SMTP verify failed:', err);
    } else {
      console.log('✅ SMTP ready to send emails');
    }
  });
} catch (err) {
  console.error('❌ failed creating transporter:', err);
  transporter = null;
}

// Colour palette mapped to CSS
const COLORS = {
  primary: '#B87333',    // Color(0xFFB87333)
  bg: '#F5E6D3',         // Color(0xFFF5E6D3)
  accent: '#D1A574'      // Color(0xFFD1A574)
};

// Helper: escape HTML to avoid injection
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Render chosenServices -> clear markup: each service on its own block, offerings line-by-line
function renderChosenServices(services) {
  if (!services || !Array.isArray(services) || services.length === 0) {
    return `<div style="color:#374151">No services selected</div>`;
  }

  return services.map(service => {
    const title = escapeHtml(service.title || service.serviceTitle || 'Service');
    const offerings = Array.isArray(service.selectedOfferings) ? service.selectedOfferings : [];
    const offeringHtml = offerings.length
      ? `<ul style="margin:6px 0 0 18px;color:#1f2937">
           ${offerings.map(o => `<li>${escapeHtml(o)}</li>`).join('')}
         </ul>`
      : '';

    return `
      <div style="background:#fff7ed;border-left:4px solid ${COLORS.primary};padding:12px;border-radius:8px;margin-bottom:10px;">
        <div style="font-weight:700;color:#1f2937;font-size:15px;margin-bottom:6px;">${title}</div>
        ${offeringHtml}
      </div>
    `;
  }).join('');
}

// Lead email template (uses your palette)
export function generateLeadEmailTemplate(lead = {}) {
  const formatDate = (d) => {
    if (!d) return 'Not provided';
    try { return new Date(d).toLocaleDateString('en-IN'); } catch { return 'Invalid date'; }
  };

  const servicesHtml = renderChosenServices(lead.chosenServices || lead.services || []);

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Lead Created - ${escapeHtml(lead.name || '')}</title>
    <style>
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial; background:${COLORS.bg}; margin:0; padding:24px; color:#111827; }
      .card { max-width:720px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 30px rgba(16,24,40,0.08); }
      .header { background: linear-gradient(90deg, ${COLORS.primary}, ${COLORS.accent}); color: #fff; padding:28px 24px; text-align:center; }
      .header h1 { margin:0; font-size:20px; letter-spacing:0.2px; }
      .sub { margin-top:6px; opacity:0.95; font-size:13px; }
      .content { padding:20px 24px; }
      .token { background:#fff7ed; border-left:4px solid ${COLORS.primary}; padding:12px; font-weight:700; color:${COLORS.primary}; border-radius:8px; display:inline-block; margin-bottom:14px; }
      .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
      .field-label { font-size:13px; color:#4b5563; font-weight:600; margin-bottom:6px; }
      .field-value { font-size:15px; color:#111827; }
      .section-title { font-size:16px; font-weight:700; color:#0f172a; margin:12px 0; padding-bottom:8px; border-bottom:1px dashed #e6e6e6; }
      .footer { padding:16px 24px; background:#f8fafc; border-top:1px solid #eef2f7; font-size:13px; color:#6b7280; text-align:center; }
      @media(max-width:640px){ .grid{grid-template-columns:1fr} .content{padding:16px} .header{padding:20px} }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h1>🎯 Inquiry Received — Thank you, ${escapeHtml(lead.name || '')}</h1>
        <div class="sub">We've captured your details and someone will reach out soon.</div>
      </div>

      <div class="content">
        <div style="margin-top:8px">
          <div class="token">Reference: ${escapeHtml(lead.token || 'N/A')}</div>
        </div>

        <div style="margin-top:16px;">
          <div class="section-title">Personal Information</div>
          <div class="grid">
            <div>
              <div class="field-label">Full Name</div>
              <div class="field-value">${escapeHtml(lead.name || 'Not provided')}</div>
            </div>
            <div>
              <div class="field-label">Email</div>
              <div class="field-value">${escapeHtml(lead.email || 'Not provided')}</div>
            </div>
            <div>
              <div class="field-label">Phone</div>
              <div class="field-value">${escapeHtml(lead.phone || 'Not provided')}</div>
            </div>
            <div>
              <div class="field-label">Source</div>
              <div class="field-value">${escapeHtml(lead.source || 'Not specified')}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="section-title">Business Information</div>
          <div class="grid">
            <div>
              <div class="field-label">Business Name</div>
              <div class="field-value">${escapeHtml(lead.businessName || 'Not provided')}</div>
            </div>
            <div>
              <div class="field-label">Category</div>
              <div class="field-value">${escapeHtml(lead.businessCategory || 'Not provided')}</div>
            </div>
            <div>
              <div class="field-label">Est. / Company Date</div>
              <div class="field-value">${formatDate(lead.companyEstablishDate)}</div>
            </div>
            <div>
              <div class="field-label">Assigned To</div>
              <div class="field-value">${escapeHtml((lead.assignedTo && lead.assignedTo.fullName) || lead.assignedTo || 'Unassigned')}</div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="section-title">Selected Services</div>
          ${servicesHtml}
        </div>

        <div style="margin-top:16px;">
          <div class="section-title">Additional Details & Dates</div>
          <div class="grid">
            <div>
              <div class="field-label">Status</div>
              <div class="field-value">${escapeHtml(lead.status || 'New')}</div>
            </div>
            <div>
              <div class="field-label">Birth Date</div>
              <div class="field-value">${formatDate(lead.birthDate)}</div>
            </div>
            <div>
              <div class="field-label">Anniversary Date</div>
              <div class="field-value">${formatDate(lead.anniversaryDate)}</div>
            </div>
            <div>
              <div class="field-label">Project Details</div>
              <div class="field-value">${escapeHtml(lead.project_details || 'Not provided')}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        Thank you — Rudhram Entertainment. If this was not you, please contact support.
      </div>
    </div>
  </body>
  </html>
  `;
}


// Send lead email (to lead)
export async function sendLeadEmail(lead) {
  try {
    if (!lead || !lead.email) {
      console.log('⚠️ sendLeadEmail skipped: no lead.email');
      return false;
    }
    if (!transporter) {
      console.error('❌ transporter not available');
      return false;
    }

    const html = generateLeadEmailTemplate(lead);
    const mailOptions = {
      from: `"Rudhram Entertainment" <${SMTP_CONFIG.auth.user}>`,
      to: lead.email,
      subject: `🎯 Rudhram: Inquiry Received — Ref ${lead.token || ''}`,
      html
    };

    const send = util.promisify(transporter.sendMail.bind(transporter));
    const info = await send(mailOptions);
    console.log('✅ Lead email sent:', info.messageId || info.response);
    return true;
  } catch (err) {
    console.error('❌ sendLeadEmail error:', err);
    return false;
  }
}


// Send notification to client(s) when a lead relates to an existing client
export async function sendClientNotification(client, lead) {
  try {
    if (!client || !client.email) {
      console.log('⚠️ sendClientNotification skipped: client or client.email missing');
      return false;
    }
    if (!transporter) {
      console.error('❌ transporter not available');
      return false;
    }

    // Compose a concise prefilled message to client (they receive lead info)
    const clientHtml = `
      <div style="font-family: Arial, sans-serif; font-size:14px; color:#111;">
        <div style="padding:12px; background:${COLORS.bg}; border-left:6px solid ${COLORS.primary}; border-radius:8px;">
          <h3 style="margin:0 0 8px 0; color:${COLORS.primary}">New Lead / Inquiry Associated with Your Client Record</h3>
          <p style="margin:0 0 8px 0;">Dear ${escapeHtml(client.name || 'Partner')},</p>
          <p style="margin:0 0 8px 0;">A lead was added that matches your client (phone/email). Details below:</p>
          <ul>
            <li><strong>Lead Name:</strong> ${escapeHtml(lead.name || '')}</li>
            <li><strong>Phone:</strong> ${escapeHtml(lead.phone || '')}</li>
            <li><strong>Email:</strong> ${escapeHtml(lead.email || 'Not provided')}</li>
            <li><strong>Reference:</strong> ${escapeHtml(lead.token || '')}</li>
          </ul>
          <div style="margin-top:8px">
            <strong>Selected Services:</strong>
            ${renderChosenServices(lead.chosenServices || lead.services || [])}
          </div>

          <p style="margin-top:12px">You may contact the lead or update the record via your admin panel.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Rudhram Notifications" <${SMTP_CONFIG.auth.user}>`,
      to: client.email,
      subject: `🔔 New Inquiry related to your client ${client.name || ''}`,
      html: clientHtml
    };

    const send = util.promisify(transporter.sendMail.bind(transporter));
    const info = await send(mailOptions);
    console.log('✅ Client notification sent:', info.messageId || info.response);
    return true;
  } catch (err) {
    console.error('❌ sendClientNotification error:', err);
    return false;
  }
}

export default {
  generateLeadEmailTemplate,
  sendLeadEmail,
  sendClientNotification
};



// utils/emailService.js (add below your existing code)
export async function sendEmailVerificationOtp(email, otp, name = "") {
  try {
    if (!transporter) {
      console.error('❌ transporter not available');
      return false;
    }

    const html = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Email Verification</title>
      <style>
        body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial; background:${COLORS.bg}; margin:0; padding:24px; color:#111827; }
        .card { max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 30px rgba(16,24,40,0.08); }
        .header { background: linear-gradient(90deg, ${COLORS.primary}, ${COLORS.accent}); color: #fff; padding:22px 20px; text-align:center; }
        .header h1 { margin:0; font-size:18px; }
        .content { padding:20px; }
        .otp { font-weight:800; font-size:24px; letter-spacing:6px; background:#fff7ed; border-left:4px solid ${COLORS.primary}; padding:12px 16px; display:inline-block; border-radius:10px; }
        .meta { margin-top:8px; color:#6b7280; font-size:13px; }
        .footer { padding:14px 20px; background:#f8fafc; border-top:1px solid #eef2f7; font-size:12px; color:#6b7280; text-align:center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Verify your email</h1>
        </div>
        <div class="content">
          <p>Hello ${escapeHtml(name || '')},</p>
          <p>Use the OTP below to verify your email for Rudhram Entertainment:</p>
          <div class="otp">${escapeHtml(otp)}</div>
          <p class="meta">This code expires in 10 minutes. If you didn’t request this, you can ignore this email.</p>
        </div>
        <div class="footer">
          © Rudhram Entertainment
        </div>
      </div>
    </body>
    </html>`;

    const mailOptions = {
      from: `"Rudhram Verification" <${SMTP_CONFIG.auth.user}>`,
      to: email,
      subject: "Your Rudhram Verification Code",
      html
    };

    const send = util.promisify(transporter.sendMail.bind(transporter));
    const info = await send(mailOptions);
    console.log('✅ OTP email sent:', info.messageId || info.response);
    return true;
  } catch (err) {
    console.error('❌ sendEmailVerificationOtp error:', err);
    return false;
  }
}
