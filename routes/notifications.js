const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const { sendPushNotification } = require('../services/pushService');
const { uploadNotificationImage } = require('../services/cloudinaryService');

// GET all notifications
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET single notification
router.get('/:id', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create new notification
router.post('/', async (req, res) => {
  try {
    const { title, message, type, imageBase64 } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    let imageUrl = null;

    // Upload image to Cloudinary if provided
    if (imageBase64) {
      try {
        imageUrl = await uploadNotificationImage(imageBase64);
        console.log('Notification image uploaded to Cloudinary:', imageUrl);
      } catch (imageError) {
        console.error('Error uploading notification image:', imageError);
        // Continue without image if upload fails
      }
    }

    const notification = new Notification({
      title,
      message,
      type: type || 'info',
      imageUrl: imageUrl || undefined
    });

    const savedNotification = await notification.save();
    
    // Send push notification to all registered devices
    try {
      const deviceTokens = await DeviceToken.find();
      if (deviceTokens.length > 0) {
        const pushPromises = deviceTokens.map(device => 
          sendPushNotification(
            device.token,
            title,
            message,
            { notificationId: savedNotification._id.toString(), type },
            imageUrl // Include image URL in push notification
          ).catch(err => {
            console.error(`Failed to send push to ${device.token}:`, err.message);
            return null;
          })
        );
        await Promise.allSettled(pushPromises);
        console.log(`Push notifications sent to ${deviceTokens.length} device(s)`);
      }
    } catch (pushError) {
      console.error('Error sending push notifications:', pushError);
      // Don't fail the request if push fails
    }
    
    res.status(201).json(savedNotification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update notification
router.put('/:id', async (req, res) => {
  try {
    const { title, message, type, isRead } = req.body;
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (title) notification.title = title;
    if (message) notification.message = message;
    if (type) notification.type = type;
    if (isRead !== undefined) notification.isRead = isRead;

    const updatedNotification = await notification.save();
    res.json(updatedNotification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE notification
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE all notifications
router.delete('/', async (req, res) => {
  try {
    await Notification.deleteMany({});
    res.json({ message: 'All notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

