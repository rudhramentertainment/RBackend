// utils/idCardGenerator.js
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer';

/**
 * readImageAsDataUri(src)
 * Supports:
 *  - data: URIs (returned as-is)
 *  - http/https URLs (fetched via axios)
 *  - absolute local paths (read directly)
 *  - relative paths ("/uploads/..." or "assets/...") resolved to process.cwd()
 */
async function readImageAsDataUri(src, { label = 'image' } = {}) {
  if (!src) return null;
  if (typeof src !== 'string') return null;

  try {
    // already a data URI
    if (src.startsWith('data:')) {
      console.debug(`[IdCardGen][${label}] using data URI`);
      return src;
    }

    // http/https remote url
    if (src.startsWith('http://') || src.startsWith('https://')) {
      console.debug(`[IdCardGen][${label}] fetching remote URL: ${src}`);
      const resp = await axios.get(src, { responseType: 'arraybuffer', timeout: 20000 });
      const base64 = Buffer.from(resp.data, 'binary').toString('base64');
      const mime = resp.headers['content-type'] || 'image/png';
      return `data:${mime};base64,${base64}`;
    }

    // Normalize slashes
    const normalized = src.replace(/\//g, path.sep);

    // If starts with a single leading slash (POSIX-style) -> treat as project-relative
    if (src.startsWith('/')) {
      const rel = src.slice(1); // remove leading slash
      const abs = path.join(process.cwd(), rel);
      console.debug(`[IdCardGen][${label}] treating leading-slash path as project-relative -> ${abs}`);
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).substring(1) || 'png';
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    }

    // Windows drive letter absolute (e.g. C:\...) or UNC paths (\\)
    const isWindowsDriveAbs = /^[A-Za-z]:\\/.test(normalized);
    const isUnc = normalized.startsWith('\\\\');

    if (isWindowsDriveAbs || isUnc || path.isAbsolute(normalized)) {
      const abs = normalized;
      console.debug(`[IdCardGen][${label}] reading absolute path -> ${abs}`);
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).substring(1) || 'png';
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${buf.toString('base64')}`;
    }

    // Otherwise treat as project-relative relative path
    const abs = path.join(process.cwd(), normalized);
    console.debug(`[IdCardGen][${label}] treating as project-relative -> ${abs}`);
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).substring(1) || 'png';
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    // Bubble up with contextual message
    throw new Error(`readImageAsDataUri failed for "${src}" (${label}): ${err && err.message}`);
  }
}

/**
 * generateAndSaveIdCard(user, opts)
 * user: { _id, fullName, role, avatarUrl (relative / absolute / http / data), employeeQrUrl (same) }
 * opts:
 *  - backgroundImagePath: absolute OR relative OR http. Default 'assets/idcard/bg.png' (resolved safely)
 *  - uploadsDir: 'uploads/idcards'
 *  - size: {width,height} in px
 */
// utils/idCardGenerator.js
// replace the existing generateAndSaveIdCard with this version

export async function generateAndSaveIdCard(user, opts = {}) {
  const {
    backgroundImagePath = path.join(process.cwd(), 'assets', 'idcard', 'bg.png'),
    uploadsDir = 'uploads/idcards',
    size = { width: 900, height: 1400 },
    companyName = 'RUDHRAM ENTERTAINMENT',
    footerText = 'HG-1, SNS PLATINA, VESU, SURAT, 395007',
  } = opts;

  if (!user) throw new Error('Missing user for id card generation');

  // read images (uses your existing readImageAsDataUri with labels)
  let bgData = null, avatarData = null, qrData = null;
  try {
    bgData = await readImageAsDataUri(String(backgroundImagePath), { label: 'background' });
    console.info('[IdCardGen] background loaded from', backgroundImagePath ? String(backgroundImagePath) : '(none)');
  } catch (e) {
    console.warn(`[IdCardGen] background image read failed: ${e && e.message}`);
    bgData = null;
  }

  try {
    if (user.avatarUrl) {
      avatarData = await readImageAsDataUri(String(user.avatarUrl), { label: 'avatar' });
      console.info('[IdCardGen] avatar loaded from', user.avatarUrl);
    } else {
      console.info('[IdCardGen] no avatarUrl on user, skipping avatar');
    }
  } catch (e) {
    console.warn('[IdCardGen] avatar read failed:', e && e.message);
    avatarData = null;
  }

  try {
    if (user.employeeQrUrl) {
      qrData = await readImageAsDataUri(String(user.employeeQrUrl), { label: 'qr' });
      console.info('[IdCardGen] qr loaded from', user.employeeQrUrl);
    } else {
      console.info('[IdCardGen] no employeeQrUrl on user, skipping qr');
    }
  } catch (e) {
    console.warn('[IdCardGen] qr read failed:', e && e.message);
    qrData = null;
  }

  console.debug('[IdCardGen] final uris:', {
    bg: !!bgData,
    avatar: !!avatarData,
    qr: !!qrData
  });

  // pretty role (TEAM_MEMBER -> Team Member, ADMIN -> Admin, CLIENT -> Client, etc.)
  const prettyRole = (() => {
    if (!user.role) return '';
    const raw = String(user.role).replace(/_/g, ' ').toLowerCase();
    return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  })();

  // fallbacks
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const avatarUri = avatarData || tiny;
  const qrUri = qrData || tiny;
  const bgUri = bgData || tiny;

  // HTML: use full-bg (scaled to full height), bigger avatar, extra top spacing, larger QR
  const html = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <style>
      html,body { margin:0; padding:0; width:100%; height:100%; }
      .card {
        position: relative;
        width: ${size.width}px;
        height: ${size.height}px;
        font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #6b3f2f;
        /* ensure entire background height visible (prevents footer being cropped) */
        background-image: url("${bgUri}");
        background-size: auto 100%;
        background-position: center top;
        background-repeat: no-repeat;
        overflow: hidden;
      }

      /* Center area - tuned to match your second image */
      .content {
        position: absolute;
        left: 50%;
        /* move content lower so avatar sits under the logo curve — tune this number if needed */
        top: 50%;
        transform: translate(-50%, -40%); /* vertical translate adjusted for top */
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 36px;
      }

      /* Avatar white frame (visible) */
      .profile {
        width: 340px;
        height: 340px;
        border-radius: 22px;
        overflow: hidden;
        background: #fff;        /* white frame background */
        padding: 12px;           /* inner white border thickness */
        box-shadow: 0 20px 40px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .profile img { width:100%; height:100%; object-fit:cover; display:block; border-radius: 10px; }

      .name-box { text-align:center; margin-top: 2px; }
      .fullname {
        margin: 0;
        font-size: 34px;
        color: #7a3d19;
        font-weight: 800;
        letter-spacing: 0.6px;
      }
      .subtitle {
        margin-top: 6px;
        font-size: 14px;
        color: #b17647;
        font-weight: 700;
        letter-spacing: 0.6px;
      }

      /* QR - larger and spaced like your second example */
      .qr {
        width: 220px;
        height: 220px;
        background: #fff;
        padding: 16px;
        border-radius: 6px;
        box-shadow: 0 18px 40px rgba(0,0,0,0.18);
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .qr img { width:100%; height:100%; object-fit:contain; }

      /* small adjustments for mobile/low-res (not usually used in puppeteer static render) */
      @media (max-width:420px) {
        .profile { width:180px; height:180px; padding:10px; }
        .fullname { font-size:24px; }
        .qr { width:160px; height:160px; padding:10px; }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="content" role="main" aria-label="ID card content">
        <div class="profile" id="profile">
          <img src="${avatarUri}" alt="avatar" />
        </div>

        <div class="name-box">
          <h1 class="fullname">${escapeHtml(user.fullName || '')}</h1>
          <div class="subtitle">${escapeHtml(prettyRole)}</div>
        </div>

        <div class="qr"><img src="${qrUri}" alt="qr" /></div>
      </div>
    </div>
  </body>
  </html>
  `;

  // save to uploads/idcards
  const absoluteUploadsDir = path.join(process.cwd(), uploadsDir);
  await fs.mkdir(absoluteUploadsDir, { recursive: true });

  const timestamp = Date.now();
  const fileName = `${String(user._id).replace(/[^a-zA-Z0-9_-]/g, '')}_${timestamp}.png`;
  const outPath = path.join(absoluteUploadsDir, fileName);

  console.info('[IdCardGen] launching puppeteer...');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: size.width, height: size.height },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for all images to finish loading
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => { img.onload = img.onerror = res; });
      }));
    });

    // ensure paint
    await new Promise((r) => setTimeout(r, 180));

    await page.screenshot({ path: outPath, type: 'png', fullPage: false });
    console.info('[IdCardGen] screenshot saved to', outPath);
  } catch (e) {
    console.error('[IdCardGen] puppeteer render failed:', e && (e.message || e));
    throw e;
  } finally {
    try { await browser.close(); } catch (_) {}
  }

  const relative = `/${uploadsDir}/${fileName}`.replace(/\/+/g, '/');
  return relative;
}


function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default { generateAndSaveIdCard };
