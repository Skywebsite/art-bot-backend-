const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a device
 * @param {string} token - Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data to send
 * @param {string} imageUrl - Optional image URL for notification
 */
async function sendPushNotification(token, title, body, data = {}, imageUrl = null) {
  // Check that the token is a valid Expo push token
  if (!Expo.isExpoPushToken(token)) {
    throw new Error(`Push token ${token} is not a valid Expo push token`);
  }

  // Construct the message
  const message = {
    to: token,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    priority: 'high',
    channelId: 'default',
  };

  // Add image if provided
  if (imageUrl) {
    message.image = imageUrl;
  }

  try {
    // Send the notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }

    return tickets[0];
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

module.exports = { sendPushNotification };

