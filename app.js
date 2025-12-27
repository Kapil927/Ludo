const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');
const authController = require('./controllers/authController');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// CORS Configuration - ALLOW ALL ORIGINS FOR NOW
app.use(cors({
  origin: '*',  // Allow all origins
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
  
  // Initialize predefined users after DB connection
  try {
    await authController.initializeUsers();
    console.log('Predefined users initialized');
  } catch (err) {
    console.error('Failed to initialize users:', err);
  }
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/game', require('./routes/gameRoutes'));
app.use('/api/dice', require('./routes/diceRoutes'));

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

// Socket.IO Configuration
const io = socketIo(server, {
  cors: {
    origin: '*',  // Allow all origins
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO for real-time game updates
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // ... rest of your socket.io code ...
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error'
  });
});

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
    ⚡ Real-time: Socket.IO enabled
    ========================================
  `);
});

module.exports = { app, io };