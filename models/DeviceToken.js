const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android', 'web'],
    default: 'android'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);

