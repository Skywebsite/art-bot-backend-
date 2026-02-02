require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const aiRoutes = require('./ai-retrieval/ai.routes');
const notificationRoutes = require('./routes/notifications');
const pushNotificationRoutes = require('./routes/push-notifications');
const chatSessionRoutes = require('./routes/chat-sessions');
const userProfileRoutes = require('./routes/user-profile');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - CORS Configuration
// Allow all origins for now (you can restrict this later if needed)
app.use(cors({
  origin: '*', // Allow all origins - change this to specific domains in production if needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
// Increase body size limit to handle base64 images (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushNotificationRoutes);
app.use('/api/chat-sessions', chatSessionRoutes);
app.use('/api/user-profile', userProfileRoutes);

// Health Check
app.get('/health', (req, res) => res.send('AI Retrieval Server is running...'));

// Root route
app.get('/', (req, res) => res.json({ message: 'AI Retrieval Server is running...' }));

// Database Connection - Optimized for serverless (Vercel)
// Reuse existing connection if available
if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    })
        .then(() => {
            console.log('Connected to MongoDB Atlas');
        })
        .catch(err => {
            console.error('Database connection error:', err);
        });
} else {
    console.log('MongoDB connection already established');
}

// For Vercel: Export the app as a serverless function
// For local development: Start the server
if (require.main === module) {
    // Running directly (local development)
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
