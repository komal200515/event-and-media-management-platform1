const mongoose = require('mongoose');

const notifSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, enum: ['like','comment','tag','follow','mention','event_upload'], required: true },
  message:   { type: String, required: true },
  media:     { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  event:     { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  isRead:    { type: Boolean, default: false },
}, { timestamps: true });

notifSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notifSchema);