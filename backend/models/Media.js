const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  text:         { type: String, required: true, maxlength: 500 },
  taggedUsers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const mediaSchema = new mongoose.Schema({
  event:       { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  type:        { type: String, enum: ['photo','video'], default: 'photo' },

  // File info
  url:          { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  fileName:     { type: String },
  fileSize:     { type: Number },
  mimeType:     { type: String },
  width:        { type: Number },
  height:       { type: Number },

  // AI features
  aiTags:     [{ type: String }],
  aiCaption:  { type: String, default: '' },

  // Facial recognition: faces detected in this photo
  detectedFaces: [{
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    boundingBox: { x: Number, y: Number, width: Number, height: Number },
    confidence:  Number,
  }],

  // Social
  likes:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments:     [commentSchema],
  taggedUsers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downloads:    { type: Number, default: 0 },
  views:        { type: Number, default: 0 },

  isPublic:      { type: Boolean, default: true },
  watermarkText: { type: String, default: '' },
  status:        { type: String, enum: ['processing','active','flagged','deleted'], default: 'active' },
}, { timestamps: true });

mediaSchema.index({ event: 1, createdAt: -1 });
mediaSchema.index({ 'detectedFaces.userId': 1 });
mediaSchema.index({ aiTags: 1 });

module.exports = mongoose.model('Media', mediaSchema);