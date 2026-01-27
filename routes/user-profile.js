const express = require('express');
const router = express.Router();
const UserProfile = require('../models/UserProfile');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');

// GET user profile
router.get('/:userId', async (req, res) => {
  try {
    let profile = await UserProfile.findOne({ userId: req.params.userId });
    if (!profile) {
      // Return empty profile instead of 404
      return res.json({
        userId: req.params.userId,
        email: '',
        displayName: '',
        profilePicture: '',
        cloudinaryPublicId: ''
      });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create or update user profile
router.post('/', async (req, res) => {
  try {
    const { userId, email, displayName, profilePicture, cloudinaryPublicId } = req.body;
    
    if (!userId || !email) {
      return res.status(400).json({ message: 'userId and email are required' });
    }

    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      {
        userId,
        email,
        displayName: displayName || '',
        profilePicture: profilePicture || '',
        cloudinaryPublicId: cloudinaryPublicId || ''
      },
      { upsert: true, new: true }
    );

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update profile picture
router.put('/:userId/picture', async (req, res) => {
  try {
    const { imageBase64, imageUrl } = req.body;
    
    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ message: 'imageBase64 or imageUrl is required' });
    }

    // Find or create profile
    let profile = await UserProfile.findOne({ userId: req.params.userId });
    if (!profile) {
      // Get email from request body if provided, otherwise use a placeholder
      // Email is required by schema, but we can use userId as fallback
      const userEmail = req.body.email || `${req.params.userId}@temp.local`;
      
      // Create profile if it doesn't exist
      profile = new UserProfile({
        userId: req.params.userId,
        email: userEmail,
        displayName: req.body.displayName || '',
        profilePicture: '',
        cloudinaryPublicId: ''
      });
    } else {
      // Update email and displayName if provided in request
      if (req.body.email && req.body.email !== profile.email) {
        profile.email = req.body.email;
      }
      if (req.body.displayName && req.body.displayName !== profile.displayName) {
        profile.displayName = req.body.displayName;
      }
    }

    // Delete old image from Cloudinary if exists
    if (profile.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(profile.cloudinaryPublicId);
      } catch (error) {
        console.error('Error deleting old image:', error);
      }
    }

    let cloudinaryUrl = imageUrl;
    let publicId = '';

    // Upload new image to Cloudinary if base64 provided
    if (imageBase64) {
      try {
        console.log('Uploading to Cloudinary, userId:', req.params.userId);
        console.log('ImageBase64 length:', imageBase64.length);
        console.log('ImageBase64 preview:', imageBase64.substring(0, 50) + '...');
        
        const uploadResult = await uploadToCloudinary(imageBase64, `profile_${req.params.userId}`);
        cloudinaryUrl = uploadResult.secure_url;
        publicId = uploadResult.public_id;
        console.log('Cloudinary upload successful:', cloudinaryUrl);
      } catch (uploadError) {
        console.error('Cloudinary upload failed:', uploadError);
        throw new Error(`Cloudinary upload failed: ${uploadError.message || uploadError}`);
      }
    }

    // Update profile picture
    profile.profilePicture = cloudinaryUrl;
    profile.cloudinaryPublicId = publicId;
    
    // Ensure email is set (required field)
    if (!profile.email || profile.email === '') {
      profile.email = req.body.email || `${req.params.userId}@temp.local`;
    }
    
    const updatedProfile = await profile.save();

    res.json(updatedProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE profile picture
router.delete('/:userId/picture', async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.params.userId });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Delete from Cloudinary
    if (profile.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(profile.cloudinaryPublicId);
      } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
      }
    }

    // Clear from database
    profile.profilePicture = '';
    profile.cloudinaryPublicId = '';
    await profile.save();

    res.json({ message: 'Profile picture deleted successfully', profile });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

