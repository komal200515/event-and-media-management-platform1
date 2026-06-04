const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category:    { type: String, enum: ['photoshoot','workshop','trip','competition','cultural_fest','party','sports','other'], default: 'other' },
  date:        { type: Date, required: true },
  endDate:     { type: Date },
  location:    { type: String, default: '' },
  coverImage:  { type: String, default: '' },
  club:        { type: String, default: '' },

  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  photographers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isPublic:       { type: Boolean, default: true },
  allowedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  tags:       [{ type: String }],
  mediaCount: { type: Number, default: 0 },
  qrCode:     { type: String, default: '' },
  slug:       { type: String, unique: true },
  status:     { type: String, enum: ['upcoming','ongoing','completed','archived'], default: 'upcoming' },
  views:      { type: Number, default: 0 },
}, { timestamps: true });

// Auto-generate slug
eventSchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = this.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      + '-' + Date.now();
  }
  next();
});

eventSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Event', eventSchema);