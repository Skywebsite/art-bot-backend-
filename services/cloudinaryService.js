const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Cloudinary credentials missing! Check your .env file.');
  console.error('Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

/**
 * Upload image to Cloudinary
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} publicId - Public ID for the image (optional)
 * @returns {Promise<Object>} Cloudinary upload result
 */
async function uploadToCloudinary(imageBase64, publicId = null) {
  try {
    const uploadOptions = {
      folder: 'd-bot-app', // Organize images in folder
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' }, // Profile picture optimization
        { quality: 'auto' },
        { format: 'auto' }
      ]
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true; // Overwrite if exists
    }

    const result = await cloudinary.uploader.upload(imageBase64, uploadOptions);
    
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      url: result.url,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    const errorMessage = error.message || error.error?.message || JSON.stringify(error);
    throw new Error(`Failed to upload image: ${errorMessage}`);
  }
}

/**
 * Upload image from URL to Cloudinary
 * @param {string} imageUrl - Image URL
 * @param {string} publicId - Public ID for the image
 * @returns {Promise<Object>} Cloudinary upload result
 */
async function uploadFromUrl(imageUrl, publicId = null) {
  try {
    const uploadOptions = {
      folder: 'd-bot-app',
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' },
        { format: 'auto' }
      ]
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true;
    }

    const result = await cloudinary.uploader.upload(imageUrl, uploadOptions);
    
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      url: result.url
    };
  } catch (error) {
    console.error('Cloudinary upload from URL error:', error);
    throw new Error(`Failed to upload image from URL: ${error.message}`);
  }
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Upload image for push notification
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<string>} Image URL
 */
async function uploadNotificationImage(imageBase64) {
  try {
    const uploadOptions = {
      folder: 'd-bot-app/notifications',
      resource_type: 'image',
      transformation: [
        { width: 800, height: 600, crop: 'limit' }, // Notification image size
        { quality: 'auto' },
        { format: 'auto' }
      ]
    };

    const result = await cloudinary.uploader.upload(imageBase64, uploadOptions);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary notification image upload error:', error);
    throw new Error(`Failed to upload notification image: ${error.message}`);
  }
}

module.exports = {
  uploadToCloudinary,
  uploadFromUrl,
  deleteFromCloudinary,
  uploadNotificationImage
};

