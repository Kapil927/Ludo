const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const diceRoutes = require('./routes/dice');

const errorHandler = require('./middleware/error');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected successfully'))
.catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('Connection string format:', process.env.MONGO_URI ? 'Present' : 'Missing');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/dice', diceRoutes);

// Basic route
// Basic route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Ludo API is running',
        version: '1.0.0',
        features: 'VIP cheating logic enabled',
        endpoints: {
            auth: '/api/auth',
            game: '/api/game',
            dice: '/api/dice'
        }
    });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`VIP User ID: ${process.env.VIP_USER_ID || 'vip_player_001'}`);
});