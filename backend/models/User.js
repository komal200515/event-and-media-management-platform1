const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role:     { type: String, enum: ['admin','photographer','club_member','member','viewer'], default: 'viewer' },
  avatar:   { type: String, default: '' },
  club:     { type: String, default: '' },

  // Facial recognition
  referenceSelfie: { type: String, default: null },
  faceDescriptor:  { type: [Number], default: null },

  // Social
  favorites:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
  followers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User'  }],
  following:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User'  }],
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Hide password in JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.faceDescriptor;
  return obj;
};

module.exports = mongoose.model('User', userSchema);