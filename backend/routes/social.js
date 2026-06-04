const router  = require('express').Router();
const Media   = require('../models/Media');
const User    = require('../models/User');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

// Helper: send real-time notification
async function notify(req, type, recipientId, message, mediaId, eventId) {
  if (String(recipientId) === String(req.user._id)) return; // don't notify yourself
  const notif = await Notification.create({ recipient: recipientId, sender: req.user._id, type, message, media: mediaId, event: eventId });
  const socketId = req.app.get('onlineUsers').get(String(recipientId));
  if (socketId) req.app.get('io').to(socketId).emit('notification', notif);
}

// POST /api/social/like/:mediaId  — toggle like
router.post('/like/:mediaId', auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: 'Not found' });

    const liked = media.likes.includes(req.user._id);
    if (liked) {
      media.likes.pull(req.user._id);
    } else {
      media.likes.push(req.user._id);
      await notify(req, 'like', media.uploadedBy, `${req.user.name} liked your photo`, media._id, media.event);
    }
    await media.save();
    res.json({ liked: !liked, count: media.likes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/social/comment/:mediaId
router.post('/comment/:mediaId', auth, async (req, res) => {
  try {
    const { text, taggedUsers = [] } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Text required' });

    const media = await Media.findById(req.params.mediaId);
    media.comments.push({ user: req.user._id, text, taggedUsers });
    await media.save();

    await notify(req, 'comment', media.uploadedBy, `${req.user.name} commented: "${text.slice(0,40)}"`, media._id, media.event);
    res.json(media.comments[media.comments.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/social/comment/:mediaId/:commentId
router.delete('/comment/:mediaId/:commentId', auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    const comment = media.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.user) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });
    comment.deleteOne();
    await media.save();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/social/favorite/:mediaId  — toggle
router.post('/favorite/:mediaId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isFav = user.favorites.includes(req.params.mediaId);
    isFav ? user.favorites.pull(req.params.mediaId) : user.favorites.push(req.params.mediaId);
    await user.save();
    res.json({ favorited: !isFav });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/social/favorites
router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({ path: 'favorites', match: { status: 'active' } });
    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;