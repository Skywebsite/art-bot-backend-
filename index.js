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

// Middleware to ensure DB connection before routes
const ensureDBConnection = async (req, res, next) => {
    try {
        // Check if connection is ready
        if (mongoose.connection.readyState !== 1) {
            // Try to connect if not connected
            await connectDB();
        }
        next();
    } catch (error) {
        console.error('DB connection check failed:', error.message);
        // Still allow request to proceed, but log the error
        // The route handlers will handle the error appropriately
        next();
    }
};

// Apply DB connection check to all API routes
app.use('/api', ensureDBConnection);

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
// Cache connection promise to avoid multiple connection attempts
let cachedConnection = null;

const connectDB = async () => {
    // If already connected, return
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // If connection is in progress, wait for it
    if (cachedConnection) {
        return cachedConnection;
    }

    // Start new connection
    cachedConnection = mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // 10 seconds
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        maxPoolSize: 10, // Maintain up to 10 socket connections
        minPoolSize: 1, // Maintain at least 1 socket connection
        bufferMaxEntries: 0, // Disable mongoose buffering
        bufferCommands: false, // Disable mongoose buffering
    })
        .then(() => {
            console.log('✅ Connected to MongoDB Atlas');
            return mongoose.connection;
        })
        .catch(err => {
            console.error('❌ Database connection error:', err.message);
            cachedConnection = null; // Reset on error so we can retry
            throw err;
        });

    return cachedConnection;
};

// Initialize connection (non-blocking)
connectDB().catch(err => {
    console.error('Failed to establish initial MongoDB connection:', err.message);
});

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
