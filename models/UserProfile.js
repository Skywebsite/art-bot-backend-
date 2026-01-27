const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    default: ''
  },
  profilePicture: {
    type: String, // Cloudinary URL
    default: ''
  },
  cloudinaryPublicId: {
    type: String, // For deletion/updates
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserProfile', userProfileSchema);

