const router = require('express').Router();
const Event  = require('../models/Event');
const Media  = require('../models/Media');
const { optionalAuth } = require('../middleware/auth');

// GET /api/search?q=&type=all|events|media&tags=&dateFrom=&dateTo=
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, type = 'all', tags, dateFrom, dateTo, page = 1, limit = 12 } = req.query;
    if (!q && !tags) return res.status(400).json({ message: 'Provide q or tags' });

    const skip = (page - 1) * limit;
    const results = {};

    if (type === 'all' || type === 'events') {
      const qObj = {};
      if (!req.user || req.user.role === 'viewer') qObj.isPublic = true;
      if (q)    qObj.$text = { $search: q };
      if (tags) qObj.tags  = { $in: tags.split(',') };
      if (dateFrom || dateTo) {
        qObj.date = {};
        if (dateFrom) qObj.date.$gte = new Date(dateFrom);
        if (dateTo)   qObj.date.$lte = new Date(dateTo);
      }
      results.events = await Event.find(qObj)
        .populate('createdBy', 'name avatar')
        .sort({ date: -1 }).skip(skip).limit(Number(limit));
    }

    if (type === 'all' || type === 'media') {
      const mObj = { status: 'active' };
      if (!req.user) mObj.isPublic = true;
      if (q)    mObj.$text   = { $search: q };
      if (tags) mObj.aiTags  = { $in: tags.split(',') };
      results.media = await Media.find(mObj)
        .populate('event', 'name date')
        .populate('uploadedBy', 'name avatar')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;