const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Predefined users (for demo)
const PREDEFINED_USERS = [
    { userId: 'vip_player_001', name: 'VIP Champion', isVIP: true },
    { userId: 'player_002', name: 'Alice', isVIP: false },
    { userId: 'player_003', name: 'Bob', isVIP: false },
    { userId: 'player_004', name: 'Charlie', isVIP: false },
    { userId: 'player_005', name: 'Diana', isVIP: false }
];

// Login with predefined ID
exports.login = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Find or create user
        let user = await User.findOne({ userId });
        
        if (!user) {
            // Check if it's a predefined user
            const predefinedUser = PREDEFINED_USERS.find(u => u.userId === userId);
            
            if (predefinedUser) {
                user = new User(predefinedUser);
                await user.save();
            } else {
                return res.status(404).json({ 
                    error: 'User not found',
                    message: 'Use one of the predefined user IDs'
                });
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.userId,
                name: user.name,
                isVIP: user.isVIP 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                name: user.name,
                isVIP: user.isVIP,
                gamesPlayed: user.gamesPlayed,
                gamesWon: user.gamesWon,
                winRate: user.winRate
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Login failed',
            message: error.message 
        });
    }
};

// Get all users (for demo)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-__v');
        res.json({
            success: true,
            users: users.map(user => ({
                userId: user.userId,
                name: user.name,
                isVIP: user.isVIP,
                gamesPlayed: user.gamesPlayed,
                gamesWon: user.gamesWon,
                winRate: user.winRate.toFixed(2)
            }))
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch users',
            message: error.message 
        });
    }
};

// Get user stats
exports.getUserStats = async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            stats: {
                userId: user.userId,
                name: user.name,
                isVIP: user.isVIP,
                gamesPlayed: user.gamesPlayed,
                gamesWon: user.gamesWon,
                winRate: user.winRate.toFixed(2),
                joined: user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch stats',
            message: error.message 
        });
    }
};