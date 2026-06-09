const router       = require('express').Router();
const Notification = require('../models/Notification');
const { auth }     = require('../middleware/auth');

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .populate('sender', 'name avatar')
        .populate('media',  'thumbnailUrl')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/mark-read  — mark all read
router.put('/mark-read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// POST /api/notifications
router.post('/', auth, async (req, res) => {
  try {
    const { message, type = 'like' } = req.body;
    const notif = new Notification({
      recipient: req.user._id,
      sender:    req.user._id,
      type,
      message,
    });
    await notif.save();
    res.json({ success: true, notification: notif });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;