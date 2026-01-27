const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');

// GET all chat sessions for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await ChatSession.find({ userId, isActive: { $ne: false } })
      .sort({ lastMessageTime: -1 })
      .limit(50);
    
    // Always return an array, even if empty
    res.json(sessions || []);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET single chat session
router.get('/:sessionId', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create new chat session
router.post('/', async (req, res) => {
  try {
    const { userId, sessionName, initialMessage } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const session = new ChatSession({
      userId,
      sessionName: sessionName || 'New Chat',
      messages: initialMessage ? [initialMessage] : [],
      lastMessage: initialMessage?.content || '',
      lastMessageTime: new Date()
    });

    const savedSession = await session.save();
    res.status(201).json(savedSession);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update chat session (add message)
router.put('/:sessionId/message', async (req, res) => {
  try {
    const { role, content, sources } = req.body;
    
    if (!role || !content) {
      return res.status(400).json({ message: 'role and content are required' });
    }

    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    // Add new message
    const newMessage = {
      role,
      content,
      sources: sources || [],
      timestamp: new Date()
    };

    session.messages.push(newMessage);
    session.lastMessage = content;
    session.lastMessageTime = new Date();

    // Auto-generate title from first user message if still "New Chat"
    if (role === 'user' && session.sessionName === 'New Chat') {
      // Generate title from first user message (truncate to 40 characters)
      let title = content.trim();
      // Remove markdown, emojis, and clean up
      title = title.replace(/[#*_`]/g, ''); // Remove markdown
      title = title.replace(/\[.*?\]\(.*?\)/g, ''); // Remove links
      title = title.replace(/\n+/g, ' '); // Replace newlines with spaces
      title = title.substring(0, 40).trim(); // Truncate to 40 chars
      // Add ellipsis if truncated
      if (content.length > 40) {
        title += '...';
      }
      // Fallback to "New Chat" if title is empty
      session.sessionName = title || 'New Chat';
    }

    const updatedSession = await session.save();
    res.json(updatedSession);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update session name
router.put('/:sessionId/name', async (req, res) => {
  try {
    const { sessionName } = req.body;
    
    if (!sessionName) {
      return res.status(400).json({ message: 'sessionName is required' });
    }

    const session = await ChatSession.findByIdAndUpdate(
      req.params.sessionId,
      { sessionName },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    res.json(session);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE chat session (soft delete - mark as inactive)
router.delete('/:sessionId', async (req, res) => {
  try {
    const session = await ChatSession.findByIdAndUpdate(
      req.params.sessionId,
      { isActive: false },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    res.json({ message: 'Chat session deleted successfully', session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE all sessions for a user
router.delete('/user/:userId', async (req, res) => {
  try {
    await ChatSession.updateMany(
      { userId: req.params.userId },
      { isActive: false }
    );
    res.json({ message: 'All chat sessions deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

