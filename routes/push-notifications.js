const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');
const { sendPushNotification } = require('../services/pushService');
const { uploadNotificationImage } = require('../services/cloudinaryService');

// Register device token
router.post('/register', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;
    
    if (!userId || !token) {
      return res.status(400).json({ message: 'userId and token are required' });
    }

    // Update or create device token
    const deviceToken = await DeviceToken.findOneAndUpdate(
      { token },
      { userId, token, platform: platform || 'android' },
      { upsert: true, new: true }
    );

    res.json({ message: 'Device token registered', deviceToken });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send push notification to user
router.post('/send', async (req, res) => {
  try {
    const { userId, title, body, data, imageBase64 } = req.body;
    
    if (!userId || !title || !body) {
      return res.status(400).json({ message: 'userId, title, and body are required' });
    }

    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (imageBase64) {
      try {
        imageUrl = await uploadNotificationImage(imageBase64);
      } catch (imageError) {
        console.error('Error uploading notification image:', imageError);
        // Continue without image if upload fails
      }
    }

    // Get all device tokens for this user
    const deviceTokens = await DeviceToken.find({ userId });
    
    if (deviceTokens.length === 0) {
      return res.status(404).json({ message: 'No device tokens found for this user' });
    }

    // Send push notification to all devices
    const results = await Promise.allSettled(
      deviceTokens.map(device => 
        sendPushNotification(device.token, title, body, data, imageUrl)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    res.json({ 
      message: `Push notification sent to ${successCount} device(s)`,
      totalDevices: deviceTokens.length,
      successCount,
      imageUrl
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send push notification to all users
router.post('/broadcast', async (req, res) => {
  try {
    const { title, body, data, imageBase64 } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ message: 'title and body are required' });
    }

    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (imageBase64) {
      try {
        imageUrl = await uploadNotificationImage(imageBase64);
      } catch (imageError) {
        console.error('Error uploading notification image:', imageError);
        // Continue without image if upload fails
      }
    }

    // Get all device tokens
    const deviceTokens = await DeviceToken.find();
    
    if (deviceTokens.length === 0) {
      return res.status(404).json({ message: 'No device tokens found' });
    }

    // Send to all devices
    const results = await Promise.allSettled(
      deviceTokens.map(device => 
        sendPushNotification(device.token, title, body, data, imageUrl)
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    res.json({ 
      message: `Push notification sent to ${successCount} device(s)`,
      totalDevices: deviceTokens.length,
      successCount,
      imageUrl
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

