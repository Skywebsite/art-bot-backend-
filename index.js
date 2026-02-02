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

// Database Connection - Cached for serverless
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('Using existing MongoDB connection');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('Connected to MongoDB Atlas');

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });
  } catch (error) {
    console.error('Database connection error:', error);
    isConnected = false;
    throw error;
  }
};

// Connect to database before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed', message: error.message });
  }
});

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushNotificationRoutes);
app.use('/api/chat-sessions', chatSessionRoutes);
app.use('/api/user-profile', userProfileRoutes);

// Health Check
app.get('/health', (req, res) => res.send('AI Retrieval Server is running...'));

// Root route
app.get('/', (req, res) => res.json({ message: 'AI Retrieval Server API', status: 'running' }));

// For Vercel serverless functions - export the app
module.exports = app;

// For local development - start the server
if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
