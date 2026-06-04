const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const TAG_POOL = {
  outdoor:  ['mountains','beach','forest','nature','sky','sunset','landscape'],
  event:    ['crowd','celebration','party','performance','competition','ceremony','festival'],
  sports:   ['cricket','football','athletics','swimming','basketball'],
  people:   ['portrait','group','selfie','team','friends'],
  tech:     ['hackathon','workshop','presentation','coding','robotics'],
  culture:  ['dance','music','art','drama','fashion'],
};

// Analyse image with Sharp and assign contextual tags
async function generateAITags(filePath) {
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(abs)) return fallbackTags();

    const [meta, stats] = await Promise.all([
      sharp(abs).metadata(),
      sharp(abs).stats(),
    ]);

    const tags = new Set(['photography', 'event']);

    // Orientation
    if (meta.width > meta.height * 1.5) tags.add('landscape');
    else if (meta.height > meta.width * 1.5) tags.add('portrait');

    // Colour analysis
    const [r, g, b] = stats.channels.map((c) => c.mean);
    const brightness = (r + g + b) / 3;

    if (brightness > 180) tags.add('bright');
    if (brightness < 80)  tags.add('night');
    if (b > r && b > 130) tags.add('outdoor');   // likely sky
    if (g > r && g > 110) tags.add('nature');    // likely green

    // Add 2-3 random category tags to simulate AI model
    const categories = Object.keys(TAG_POOL);
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const pool = TAG_POOL[cat];
    const numExtra = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numExtra; i++) {
      tags.add(pool[Math.floor(Math.random() * pool.length)]);
    }

    return [...tags].slice(0, 8);
  } catch {
    return fallbackTags();
  }
}

function fallbackTags() {
  const all = Object.values(TAG_POOL).flat();
  const tags = new Set(['event', 'photography']);
  while (tags.size < 5) tags.add(all[Math.floor(Math.random() * all.length)]);
  return [...tags];
}

// Embed watermark text onto image using Sharp + SVG
async function generateWatermark(filePath, text) {
  const img    = sharp(filePath);
  const meta   = await img.metadata();
  const w      = meta.width  || 800;
  const h      = meta.height || 600;
  const fs_px  = Math.max(14, Math.floor(w / 45));
  const pad    = 16;
  const boxW   = text.length * fs_px * 0.58 + pad * 2;
  const boxH   = fs_px + pad;
  const x      = pad;
  const y      = h - boxH - pad;

  const svg = `
    <svg width="${w}" height="${h}">
      <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}"
            fill="rgba(0,0,0,0.45)" rx="4"/>
      <text x="${x + pad}" y="${y + fs_px}"
            font-family="Arial,sans-serif"
            font-size="${fs_px}px"
            font-weight="bold"
            fill="rgba(255,255,255,0.85)">${text}</text>
    </svg>`;

  return img
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

module.exports = { generateAITags, generateWatermark };