// Cloudinary storage helper — all uploads (PYQs, notes, documents) live here,
// never on local disk (local disk is wiped on every Render redeploy).
// Files are uploaded as authenticated-origin private-ish assets; downloads
// always flow through our API (auth + download counter), never direct links.
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function enabled() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

// Upload a multer-memory buffer. Returns { url, publicId, resourceType }.
// PDFs go up as `raw` (plain file delivery, always allowed); images stay on
// `auto` so they keep previews/thumbnails. (This account denies delivery of
// image-pipeline PDFs with 401 "deny or ACL failure" — raw bypasses that.)
// The original extension is preserved in the public_id so downloads save as
// real `name.pdf` files instead of extensionless slugs.
function uploadBuffer(buffer, { folder = 'campusconnect/pyqs', filename = 'file', resourceType = 'auto' } = {}) {
  const ext = (filename.match(/\.[a-zA-Z0-9]{2,5}$/) || [''])[0].toLowerCase();
  const base = filename.replace(/\.[a-zA-Z0-9]{2,5}$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(-80) || 'file';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, public_id: `${Date.now()}-${base}${ext}`.slice(0, 150) },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type });
      }
    );
    stream.end(buffer);
  });
}

async function destroyFile(publicId, resourceType) {
  if (!publicId) return;
  // destroy() needs the exact type ('image' | 'raw' | 'video') — 'auto' fails
  // silently, so try stored type first, then the other two as fallback.
  const types = [resourceType, 'image', 'raw', 'video'].filter((t, i, a) => t && a.indexOf(t) === i);
  for (const t of types) {
    try {
      const r = await cloudinary.uploader.destroy(publicId, { resource_type: t });
      if (r.result === 'ok' || r.result === 'not found') return;
    } catch (e) { /* try next type */ }
  }
  console.error('Cloudinary destroy failed for', publicId);
}

module.exports = { cloudinary, enabled, uploadBuffer, destroyFile };
