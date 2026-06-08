const router = require("express").Router();
const Media = require("../models/Media");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { auth, optionalAuth } = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────
// Helper: notification MongoDB me save + Socket.IO se bhejo
// ─────────────────────────────────────────────────────────────
async function notify(req, type, recipientId, message, mediaId, eventId) {
  try {
    if (!recipientId) return;
    if (String(recipientId) === String(req.user._id)) return; // self notify nahi

    const notif = await Notification.create({
      recipient: recipientId,
      sender:    req.user._id,
      type,
      message,
      media:     mediaId || null,
      event:     eventId || null
    });

    const io          = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    if (io) {
      // Method 1: room-based (agar socket.join(`user_${id}`) setup hai)
      io.to(`user_${recipientId}`).emit("notification", {
        type,
        message,
        _id:       notif._id,
        createdAt: notif.createdAt
      });

      // Method 2: onlineUsers map se (tera existing system)
      if (onlineUsers) {
        const socketId = onlineUsers.get(String(recipientId));
        if (socketId) io.to(socketId).emit("notification", notif);
      }
    }
  } catch (err) {
    console.log("Notify error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ GET COMMENTS  ← YEH MISSING THA, AB ADD HO GAYA
// GET /api/social/comments/:mediaId
// ─────────────────────────────────────────────────────────────
router.get("/comments/:mediaId", async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId)
      .populate("comments.user", "name _id");

    if (!media) return res.status(404).json({ message: "Media not found" });

    res.json({ comments: media.comments || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// LIKE
// POST /api/social/like/:mediaId
// ─────────────────────────────────────────────────────────────
router.post("/like/:mediaId", auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId)
      .populate("uploadedBy", "_id name");

    if (!media) return res.status(404).json({ message: "Media not found" });

    if (!media.likes) media.likes = [];

    const userId  = String(req.user._id);
    const likeIdx = media.likes.map(id => String(id)).indexOf(userId);
    let liked;

    if (likeIdx === -1) {
      media.likes.push(req.user._id);
      liked = true;
    } else {
      media.likes.splice(likeIdx, 1);
      liked = false;
    }
    await media.save();

    // ✅ Notify photo owner (optional chaining — crash nahi hoga)
    if (liked && media.uploadedBy?._id) {
      await notify(
        req,
        "like",
        media.uploadedBy._id,
        `❤️ ${req.user.name} ne tumhari photo like ki`,
        media._id,
        null
      );
    }

    res.json({ liked, likes: media.likes.length });
  } catch (err) {
    console.error("Like error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST COMMENT
// POST /api/social/comment/:mediaId
// ─────────────────────────────────────────────────────────────
router.post("/comment/:mediaId", auth, async (req, res) => {
  try {
    const { text, mentions = [] } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Comment text required" });

    const media = await Media.findById(req.params.mediaId)
      .populate("uploadedBy", "_id name");

    if (!media) return res.status(404).json({ message: "Media not found" });

    const comment = {
      user:      req.user._id,
      text:      text.trim(),
      createdAt: new Date()
    };
    if (!media.comments) media.comments = [];
    media.comments.push(comment);
    await media.save();

    // ✅ Notify photo owner
    if (media.uploadedBy?._id) {
      await notify(
        req,
        "comment",
        media.uploadedBy._id,
        `💬 ${req.user.name} ne comment kiya: "${text.slice(0, 40)}"`,
        media._id,
        null
      );
    }

    // ✅ Notify @mentioned users
    if (mentions.length > 0) {
      const mentionedUsers = await User.find({
        name: { $in: mentions.map(m => new RegExp(`^${m.trim()}$`, "i")) }
      }).select("_id name");

      for (const mu of mentionedUsers) {
        await notify(
          req,
          "mention",
          mu._id,
          `🏷️ ${req.user.name} ne tumhe mention kiya: "${text.slice(0, 40)}"`,
          media._id,
          null
        );
      }
    }

    // Broadcast — open comment modals refresh ho jayein
    const io = req.app.get("io");
    if (io) {
      io.emit("new-comment", {
        mediaId: media._id,
        text,
        userId:  req.user._id,
        user:    { name: req.user.name, _id: req.user._id }
      });
    }

    res.json({
      message: "Comment posted",
      comment: {
        ...comment,
        user: { name: req.user.name, _id: req.user._id }
      }
    });
  } catch (err) {
    console.error("Comment error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE COMMENT
// DELETE /api/social/comment/:mediaId/:commentId
// ─────────────────────────────────────────────────────────────
router.delete("/comment/:mediaId/:commentId", auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    const comment = media.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (
      String(comment.user) !== String(req.user._id) &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    comment.deleteOne();
    await media.save();

    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// FAVORITE TOGGLE
// POST /api/social/favorite/:mediaId
// ─────────────────────────────────────────────────────────────
router.post("/favorite/:mediaId", auth, async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const isFav = user.favorites.includes(req.params.mediaId);

    if (isFav) {
      user.favorites.pull(req.params.mediaId);
    } else {
      user.favorites.push(req.params.mediaId);
    }

    await user.save();
    res.json({ favorited: !isFav });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET FAVORITES
// GET /api/social/favorites
// ─────────────────────────────────────────────────────────────
router.get("/favorites", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("favorites");
    res.json(user.favorites || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;