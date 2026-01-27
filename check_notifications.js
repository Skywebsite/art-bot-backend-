const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('./models/Notification');

async function checkNotifications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}\n`);
    
    // Check if notifications collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasNotificationsCollection = collections.some(col => col.name === 'notifications');
    
    if (!hasNotificationsCollection) {
      console.log('⚠️  Notifications collection does not exist yet.');
      console.log('   It will be created when you save your first notification.\n');
    } else {
      console.log('✅ Notifications collection exists\n');
    }
    
    // Count notifications
    const count = await Notification.countDocuments();
    console.log(`📢 Total Notifications: ${count}\n`);
    
    if (count === 0) {
      console.log('ℹ️  No notifications found in database.');
      console.log('   Create a notification via API or frontend to see it here.\n');
    } else {
      // Get all notifications
      const notifications = await Notification.find().sort({ createdAt: -1 });
      
      console.log('📋 All Notifications:\n');
      console.log('='.repeat(80));
      
      notifications.forEach((notif, index) => {
        console.log(`\n${index + 1}. Notification ID: ${notif._id}`);
        console.log(`   Title: ${notif.title}`);
        console.log(`   Message: ${notif.message}`);
        console.log(`   Type: ${notif.type}`);
        console.log(`   Read: ${notif.isRead ? '✅ Yes' : '❌ No'}`);
        console.log(`   Created: ${notif.createdAt}`);
        console.log(`   Updated: ${notif.updatedAt}`);
        console.log('-'.repeat(80));
      });
      
      // Statistics
      const readCount = await Notification.countDocuments({ isRead: true });
      const unreadCount = await Notification.countDocuments({ isRead: false });
      
      console.log('\n📊 Statistics:');
      console.log(`   Read: ${readCount}`);
      console.log(`   Unread: ${unreadCount}`);
      
      // Type breakdown
      const typeCounts = await Notification.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);
      
      console.log('\n📈 By Type:');
      typeCounts.forEach(type => {
        console.log(`   ${type._id}: ${type.count}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('MongoServerError')) {
      console.error('   Database connection or query error');
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the check
checkNotifications();

