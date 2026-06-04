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
const { generateAITags, generateWatermark } = require('../utils/aiUtils');

// GET /api/media/event/:eventId
router.get('/event/:eventId', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const query = { event: req.params.eventId, status: 'active' };
    if (type) query.type = type;

    const [media, total] = await Promise.all([
      Media.find(query)
        .populate('uploadedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Media.countDocuments(query),
    ]);
    res.json({ media, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/media/upload/:eventId  (bulk — up to 50 files)
router.post('/upload/:eventId', auth, upload.array('media', 50), async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const saved = [];

    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith('video/');
      let thumbnailUrl = '';
      let aiTags = [];
      let width, height;
      const cloudResult = await cloudinary.uploader.upload(file.path, {
  folder: `event-media/${req.params.eventId}`,
  resource_type: isVideo ? 'video' : 'image',
});

      if (!isVideo) {
        // Get image dimensions
        const meta = await sharp(file.path).metadata();
        width  = meta.width;
        height = meta.height;

        // Make thumbnail
        const thumbName = `thumb_${file.filename}`;
        const thumbPath = path.join(path.dirname(file.path), thumbName);
        await sharp(file.path).resize(400, 300, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumbPath);
        thumbnailUrl = `/uploads/${req.params.eventId}/${thumbName}`;

        // AI tagging
        aiTags = await generateAITags(file.path);
      }

      const doc = await Media.create({
        event:        req.params.eventId,
        uploadedBy:   req.user._id,
        type:         isVideo ? 'video' : 'photo',
        url:          cloudResult.secure_url,
        thumbnailUrl: thumbnailUrl ||cloudResult.secure_url,
        fileName:     file.originalname,
        fileSize:     file.size,
        mimeType:     file.mimetype,
        width, height, aiTags,
        watermarkText: `${event.club || 'Club'} | ${event.name}`,
        status: 'active',
      });

      saved.push(doc);
    }

    // Update event media count
    await Event.findByIdAndUpdate(req.params.eventId, { $inc: { mediaCount: req.files.length } });

    res.status(201).json({ uploaded: saved.length, media: saved });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/media/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id)
      .populate('uploadedBy',  'name avatar')
      .populate('event',       'name date club')
      .populate('comments.user', 'name avatar')
      .populate('taggedUsers', 'name avatar');

    if (!media) return res.status(404).json({ message: 'Not found' });
    await Media.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json(media);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/media/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: 'Not found' });
    if (String(media.uploadedBy) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    // Remove file from disk
    const filePath = path.join(__dirname, '..', media.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Media.findByIdAndDelete(req.params.id);
    await Event.findByIdAndUpdate(media.event, { $inc: { mediaCount: -1 } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/media/:id/download  — with watermark
router.get('/:id/download', optionalAuth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).populate('event', 'name club');
    if (!media) return res.status(404).json({ message: 'Not found' });

    const filePath = path.join(__dirname, '..', media.url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing' });

    await Media.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } });

    if (media.type === 'photo') {
      const role = req.user?.role || 'viewer';
      const text = `${media.event.club || 'Club'} | ${media.event.name} | ${role}`;
      const buffer = await generateWatermark(filePath, text);
      res.setHeader('Content-Disposition', `attachment; filename="${media.fileName}"`);
      res.setHeader('Content-Type', 'image/jpeg');
      return res.send(buffer);
    }

    res.download(filePath, media.fileName);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/media/user/my-photos  — facial recognition results
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

module.exports = router;