const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// CORS Configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json());

// Database Connection
connectDB().then(async () => {
  console.log('Database connected successfully');
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

// Routes - UPDATED TO MATCH YOUR FILENAMES
app.use('/api/auth', require('./routes/auth'));      // Changed
app.use('/api/game', require('./routes/game'));      // Changed
app.use('/api/dice', require('./routes/dice'));      // Changed

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'LUDO Game API is running',
    timestamp: new Date().toISOString()
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'LUDO Game API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      game: '/api/game',
      dice: '/api/dice',
      health: '/health'
    }
  });
});

// Error handling middleware
const errorHandler = require('./middleware/error');
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
    ========================================
    🎮 LUDO Game Server Started
    ========================================
    📡 Server running on port: ${PORT}
    🌍 CORS: Enabled for all origins
    🗄️  Database: Connected
    ========================================
  `);
});

module.exports = app;