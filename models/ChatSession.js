const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionName: {
    type: String,
    default: 'New Chat'
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'ai'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    sources: [{
      type: String
    }],
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
chatSessionSchema.index({ userId: 1, lastMessageTime: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);

