const axios = require('axios');

// Update this URL to match your server
const API_URL = process.env.API_URL || 'http://localhost:5000/api/notifications';

async function testNotifications() {
  console.log('🧪 Testing Notification API...\n');

  try {
    // Test 1: Create a notification
    console.log('1️⃣ Creating a test notification...');
    const newNotification = {
      title: 'Test Notification',
      message: 'This is a test notification to verify the API is working!',
      type: 'success'
    };

    const createResponse = await axios.post(API_URL, newNotification);
    console.log('✅ Notification created successfully!');
    console.log('Response:', JSON.stringify(createResponse.data, null, 2));
    const notificationId = createResponse.data._id;
    console.log('');

    // Test 2: Get all notifications
    console.log('2️⃣ Fetching all notifications...');
    const getAllResponse = await axios.get(API_URL);
    console.log(`✅ Found ${getAllResponse.data.length} notification(s)`);
    console.log('');

    // Test 3: Get single notification
    console.log('3️⃣ Fetching single notification...');
    const getOneResponse = await axios.get(`${API_URL}/${notificationId}`);
    console.log('✅ Notification fetched:');
    console.log(JSON.stringify(getOneResponse.data, null, 2));
    console.log('');

    // Test 4: Update notification (mark as read)
    console.log('4️⃣ Updating notification (marking as read)...');
    const updateResponse = await axios.put(`${API_URL}/${notificationId}`, {
      isRead: true
    });
    console.log('✅ Notification updated!');
    console.log('Is Read:', updateResponse.data.isRead);
    console.log('');

    // Test 5: Get all notifications again to see the update
    console.log('5️⃣ Fetching all notifications again...');
    const getAllAgainResponse = await axios.get(API_URL);
    console.log(`✅ Total notifications: ${getAllAgainResponse.data.length}`);
    console.log('');

    console.log('🎉 All tests passed! Notification API is working correctly.');
    console.log('\n💡 Tip: You can also use the React frontend at notification-app/frontend');
    console.log('   Run: cd notification-app/frontend && npm install && npm start');

  } catch (error) {
    console.error('❌ Test failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Is the server running?');
      console.error('Make sure your server is running on:', API_URL.replace('/api/notifications', ''));
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testNotifications();

