const cloudinary = require('../config/cloudinary');
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const sharp  = require('sharp');
const Media  = require('../models/Media');
const Event  = require('../models/Event');
const Notification = require('../models/Notification');
const { auth, optionalAuth } = require('../middleware/auth');
const { upload }             = require('../middleware/upload');

// generateAITags — safe wrapper (aiUtils crash kare toh default tags return karo)
async function safeGenerateAITags(buffer) {
  try {
    const { generateAITags } = require('../utils/aiUtils');
    const tags = await generateAITags(buffer);
    return Array.isArray(tags) ? tags : ['event', 'photo'];
  } catch {
    return ['event', 'photo'];
  }
}

// Helper: extract Cloudinary public_id from URL
function extractPublicId(url) {
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;
  const afterUpload = parts.slice(uploadIndex + 1);
  const start = afterUpload[0]?.match(/^v\d+$/) ? 1 : 0;
  const withExt = afterUpload.slice(start).join('/');
  return withExt.replace(/\.[^/.]+$/, '');
}

// Safe file delete — memoryStorage mein file.path nahi hota
function safeUnlink(filePath) {
  if (!filePath) return;
  try { fs.unlink(filePath, () => {}); } catch {}
}

// ─────────────────────────────────────────────
// GET /api/media/user/my-photos
// ─────────────────────────────────────────────
router.get('/user/my-photos', auth, async (req, res) => {
  try {
    const media = await Media.find({ 'detectedFaces.userId': req.user._id, status: 'active' })
      .populate('event', 'name date')
      .populate('uploadedBy', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/media/event/:eventId
// ─────────────────────────────────────────────
router.get('/event/:eventId', optionalAuth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (!event.isPublic) {
      if (!req.user)
        return res.status(401).json({ message: 'Login required to view private event media' });
      const isAdmin   = req.user.role === 'admin';
      const isCreator = String(event.createdBy) === String(req.user._id);
      if (!isAdmin && !isCreator)
        return res.status(403).json({ message: 'You do not have access to this private event' });
    }

    const media = await Media.find({ event: req.params.eventId })
      .populate('uploadedBy', 'name _id')
      .sort({ createdAt: -1 });

    res.json({ media });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/media/upload/:eventId
// ─────────────────────────────────────────────
router.post('/upload/:eventId', auth, upload.array('media', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ message: 'No files received' });

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const saved  = [];
    const failed = [];

    for (const file of req.files) {
      try {
        const isVideo = file.mimetype.startsWith('video/');
        let aiTags = ['event', 'photo'];
        let width, height;

        // ── Image metadata + AI tags ──────────────────────────
        if (!isVideo) {
          // Support both memoryStorage (file.buffer) and diskStorage (file.path)
          const source = file.buffer || fs.readFileSync(file.path);
          try {
            const meta = await sharp(source).metadata();
            width  = meta.width;
            height = meta.height;
          } catch { /* width/height remain undefined — handled below */ }
          aiTags = await safeGenerateAITags(source);
        }

        // ── Cloudinary upload ─────────────────────────────────
        let cloudResult;
        if (file.buffer) {
          // memoryStorage — base64 encode
          const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
          cloudResult = await cloudinary.uploader.upload(b64, {
            folder:        `event-media/${req.params.eventId}`,
            resource_type: isVideo ? 'video' : 'image',
          });
        } else {
          // diskStorage — use file path
          cloudResult = await cloudinary.uploader.upload(file.path, {
            folder:        `event-media/${req.params.eventId}`,
            resource_type: isVideo ? 'video' : 'image',
          });
          safeUnlink(file.path); // clean up disk file after upload
        }

        // ── Save to MongoDB ───────────────────────────────────
        const doc = await Media.create({
          event:              req.params.eventId,
          uploadedBy:         req.user._id,
          type:               isVideo ? 'video' : 'photo',
          url:                cloudResult.secure_url,
          cloudinaryPublicId: cloudResult.public_id,
          thumbnailUrl:       cloudResult.secure_url,
          fileName:           file.originalname,
          fileSize:           file.size,
          mimeType:           file.mimetype,
          width:              width  || cloudResult.width  || 0,
          height:             height || cloudResult.height || 0,
          aiTags,
          watermarkText:      `${event.club || 'EventMedia Club'} | ${event.name}`,
          status:             'active',
        });

        saved.push(doc);
      } catch (fileErr) {
        console.error(`Failed to process ${file.originalname}:`, fileErr.message);
        failed.push({ fileName: file.originalname, error: fileErr.message });
        safeUnlink(file.path); // safe — won't crash if path undefined
      }
    }

    if (saved.length > 0)
      await Event.findByIdAndUpdate(req.params.eventId, { $inc: { mediaCount: saved.length } });

    res.status(201).json({
      uploaded: saved.length,
      failed:   failed.length,
      media:    saved,
      errors:   failed,
    });
  } catch (err) {
    console.error('Upload route error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/media/:id
// ─────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id)
      .populate('uploadedBy',    'name avatar')
      .populate('event',         'name date club')
      .populate('comments.user', 'name avatar')
      .populate('taggedUsers',   'name avatar');

    if (!media) return res.status(404).json({ message: 'Not found' });
    await Media.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/media/:id
// ─────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: 'Not found' });
    if (String(media.uploadedBy) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    if (media.url && media.url.startsWith('http')) {
      const publicId = media.cloudinaryPublicId || extractPublicId(media.url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: media.type === 'video' ? 'video' : 'image',
        });
      }
    } else {
      const filePath = path.join(__dirname, '..', media.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Media.findByIdAndDelete(req.params.id);
    await Event.findByIdAndUpdate(media.event, [
      { $set: { mediaCount: { $max: [0, { $subtract: ['$mediaCount', 1] }] } } },
    ]);

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/media/:id/download
// ─────────────────────────────────────────────
router.get('/:id/download', optionalAuth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).populate('event', 'name club');
    if (!media) return res.status(404).json({ message: 'Not found' });

    await Media.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } });

    if (media.url && media.url.startsWith('http')) {
      if (media.type === 'photo') {
        const role          = req.user?.role || 'viewer';
        const watermarkText = `${media.event?.club || 'EventMedia Club'} | ${media.event?.name || 'Event'} | ${role}`;
        const publicId      = media.cloudinaryPublicId || extractPublicId(media.url);

        if (publicId) {
          const watermarkedUrl = cloudinary.url(publicId, {
            transformation: [{
              overlay: {
                font_family: 'Arial',
                font_size:   28,
                font_weight: 'bold',
                text:        encodeURIComponent(watermarkText),
              },
              color:   'white',
              opacity: 60,
              gravity: 'south_east',
              x: 15, y: 15,
            }],
            secure: true,
          });
          return res.redirect(watermarkedUrl);
        }
      }
      return res.redirect(media.url);
    }

    // Local file fallback
    const filePath = path.join(__dirname, '..', media.url);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: 'File missing' });

    try {
      const { generateWatermark } = require('../utils/aiUtils');
      const role   = req.user?.role || 'viewer';
      const text   = `${media.event?.club || 'EventMedia Club'} | ${media.event?.name || 'Event'} | ${role}`;
      const buffer = await generateWatermark(filePath, text);
      res.setHeader('Content-Disposition', `attachment; filename="${media.fileName}"`);
      res.setHeader('Content-Type', 'image/jpeg');
      return res.send(buffer);
    } catch {
      return res.download(filePath, media.fileName);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;