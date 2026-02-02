const mongoose = require('mongoose');
require('dotenv').config();

async function checkEventsDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    const defaultDb = mongoose.connection.db;
    
    console.log('\n=== Default Database Info ===');
    console.log('Default database name:', defaultDb.databaseName);
    
    // List all collections in default database
    const defaultCollections = await defaultDb.listCollections().toArray();
    console.log('\n=== Collections in Default DB ===');
    console.log(`Total collections: ${defaultCollections.length}`);
    defaultCollections.forEach(col => {
      console.log(`- ${col.name}`);
    });
    
    // Check 'events' collection in default database
    console.log('\n=== Checking "events" collection in default DB ===');
    const defaultEventsCollection = defaultDb.collection('events');
    const defaultEventCount = await defaultEventsCollection.countDocuments();
    console.log(`Documents in default DB "events": ${defaultEventCount}`);
    
    // Now check event_database
    console.log('\n=== Checking "event_database" ===');
    let eventDb;
    try {
        // Try to access event_database directly
        eventDb = mongoose.connection.client.db('event_database');
        console.log('Database name:', eventDb.databaseName);
    } catch (dbError) {
        console.error('Error accessing event_database with client.db:', dbError.message);
        console.log('Trying alternative method with useDb...');
        
        // Alternative: Use useDb
        const eventDbConnection = mongoose.connection.useDb('event_database');
        eventDb = eventDbConnection.db || eventDbConnection;
        console.log('Database name:', eventDb.databaseName || 'event_database');
    }
    
    // List all collections in event_database
    const eventCollections = await eventDb.listCollections().toArray();
    console.log('\n=== Collections in event_database ===');
    console.log(`Total collections: ${eventCollections.length}`);
    eventCollections.forEach(col => {
      console.log(`- ${col.name}`);
    });
    
    // Check 'events' collection in event_database
    console.log('\n=== Checking "events" collection in event_database ===');
    const eventsCollection = eventDb.collection('events');
    const eventCount = await eventsCollection.countDocuments();
    console.log(`Documents in event_database "events": ${eventCount}`);
    
    if (eventCount > 0) {
      // Get a sample document
      const sample = await eventsCollection.findOne();
      console.log('\n=== Sample Document Structure ===');
      console.log(JSON.stringify(sample, null, 2));
      console.log('\n=== Document Keys ===');
      console.log(Object.keys(sample));
      
      // Check if it has event_details
      if (sample.event_details) {
        console.log('\n=== event_details keys ===');
        console.log(Object.keys(sample.event_details));
        console.log('\n=== event_details values ===');
        console.log('event_name:', sample.event_details.event_name);
        console.log('organizer:', sample.event_details.organizer);
        console.log('location:', sample.event_details.location);
        console.log('event_date:', sample.event_details.event_date);
      }
      
      // Test a search query
      console.log('\n=== Testing Search Query for "art" ===');
      const testQuery = await eventsCollection.find({
        $or: [
          { "event_details.event_name": /art/i },
          { "event_details.organizer": /art/i },
          { "event_details.location": /art/i }
        ]
      }).limit(5).toArray();
      console.log(`Found ${testQuery.length} events matching "art"`);
      
      if (testQuery.length > 0) {
        console.log('\n=== Sample Search Result ===');
        console.log('Event Name:', testQuery[0].event_details?.event_name);
        console.log('Organizer:', testQuery[0].event_details?.organizer);
        console.log('Location:', testQuery[0].event_details?.location);
      }
    } else {
      console.log('⚠️  No documents found in event_database "events" collection!');
      
      // Check if there are other collections that might contain events
      console.log('\n=== Checking other collections in event_database for event data ===');
      for (const col of eventCollections) {
        const coll = eventDb.collection(col.name);
        const count = await coll.countDocuments();
        if (count > 0) {
          const sample = await coll.findOne();
          const sampleStr = JSON.stringify(sample).toLowerCase();
          if (sampleStr.includes('event') || sampleStr.includes('art')) {
            console.log(`\n⚠️  Found potential event data in collection: "${col.name}" (${count} documents)`);
            console.log('Sample keys:', Object.keys(sample));
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkEventsDB();

