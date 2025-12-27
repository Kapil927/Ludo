const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = 'mongodb://user_448rkyjdg:p448rkyjdg@bytexldb.com:5050/db_448rkyjdg';
const JWT_SECRET = 'super_secret_ludo_key_123';

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    playerId: { type: String, unique: true },
    code: { type: String, required: true },
    isVIP: { type: Boolean, default: false },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Game Schema
const gameSchema = new mongoose.Schema({
    gameCode: { type: String, unique: true, required: true },
    players: [{
        playerId: String,
        username: String, // Custom name entered by player
        displayName: String, // Name shown in game (can be different)
        isVIP: Boolean,
        position: { type: Number, default: 0 },
        dice: { type: Number, default: 0 },
        status: { type: String, default: 'playing' }
    }],
    currentTurn: { type: Number, default: 0 },
    diceValue: { type: Number, default: 0 },
    winner: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const Game = mongoose.model('Game', gameSchema);

// VIP Dice Logic (same as before)
const calculateVIPDice = (gameState, vipPlayer) => {
    const positions = gameState.players.map(p => p.position);
    const vipPosition = vipPlayer.position;
    
    if (vipPosition >= 90) {
        return Math.floor(Math.random() * 3) + 4;
    }
    
    const othersClose = positions.some((p, i) => 
        !gameState.players[i].isVIP && p >= 85
    );
    
    if (othersClose) {
        const chance = Math.random();
        if (chance < 0.7) return 6;
        if (chance < 0.9) return 5;
        return 4;
    }
    
    const randomFactor = Math.random();
    
    if (randomFactor < 0.6) {
        if (vipPosition < 50) {
            return Math.floor(Math.random() * 2) + 5;
        } else {
            return Math.floor(Math.random() * 3) + 4;
        }
    } else if (randomFactor < 0.85) {
        return Math.floor(Math.random() * 3) + 3;
    } else {
        return Math.floor(Math.random() * 2) + 1;
    }
};

const getNormalDice = () => Math.floor(Math.random() * 6) + 1;

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Routes

// 1. Quick Registration with Name (Simplified)
app.post('/api/quick-register', async (req, res) => {
    try {
        const { displayName, code } = req.body;
        
        if (!displayName || !code) {
            return res.status(400).json({ error: 'Display name and code required' });
        }
        
        // Check if VIP code
        const vipCodes = ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL'];
        const isVIP = vipCodes.includes(code.toUpperCase());
        
        const playerId = 'PLAYER_' + uuidv4().substring(0, 8).toUpperCase();
        
        const newUser = new User({
            username: displayName, // Use display name as username
            playerId,
            code,
            isVIP
        });
        
        await newUser.save();
        
        const token = jwt.sign(
            { userId: newUser._id, playerId, username: displayName, isVIP },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token,
            player: {
                playerId,
                displayName,
                isVIP,
                code
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

// 2. Create Game (Host enters their name)
app.post('/api/game/create', authenticateToken, async (req, res) => {
    try {
        const { displayName } = req.body;
        
        if (!displayName) {
            return res.status(400).json({ error: 'Display name required' });
        }
        
        const gameCode = 'GAME_' + uuidv4().substring(0, 6).toUpperCase();
        
        const newGame = new Game({
            gameCode,
            players: [{
                playerId: req.user.playerId,
                username: req.user.username,
                displayName: displayName || req.user.username, // Use provided display name
                isVIP: req.user.isVIP,
                position: 0
            }]
        });
        
        await newGame.save();
        
        res.json({
            success: true,
            gameCode,
            displayName: displayName || req.user.username,
            message: 'Game created successfully'
        });
    } catch (error) {
        res.status(500).json({ error: 'Game creation failed' });
    }
});

// 3. Join Game with Custom Name (NEW IMPROVED VERSION)
app.post('/api/game/join', authenticateToken, async (req, res) => {
    try {
        const { gameCode, displayName } = req.body;
        
        if (!gameCode) {
            return res.status(400).json({ error: 'Game code required' });
        }
        
        if (!displayName) {
            return res.status(400).json({ error: 'Display name required to join game' });
        }
        
        const game = await Game.findOne({ gameCode, isActive: true });
        if (!game) {
            return res.status(404).json({ error: 'Game not found or inactive' });
        }
        
        if (game.players.length >= 4) {
            return res.status(400).json({ error: 'Game is full (max 4 players)' });
        }
        
        // Check if name is already taken in this game
        const nameTaken = game.players.some(p => 
            p.displayName.toLowerCase() === displayName.toLowerCase()
        );
        
        if (nameTaken) {
            return res.status(400).json({ 
                error: 'Name already taken in this game. Choose a different name.' 
            });
        }
        
        // Check if player already joined (by playerId)
        const alreadyJoined = game.players.some(p => p.playerId === req.user.playerId);
        if (alreadyJoined) {
            return res.status(400).json({ error: 'You already joined this game' });
        }
        
        game.players.push({
            playerId: req.user.playerId,
            username: req.user.username,
            displayName: displayName, // Custom name for this game
            isVIP: req.user.isVIP,
            position: 0
        });
        
        await game.save();
        
        res.json({
            success: true,
            gameCode,
            displayName,
            players: game.players.map(p => ({
                displayName: p.displayName,
                position: p.position,
                isVIP: p.playerId === req.user.playerId ? p.isVIP : undefined
            })),
            message: 'Joined game successfully'
        });
    } catch (error) {
        res.status(500).json({ error: 'Join game failed' });
    }
});

// 4. Roll Dice (updated to use displayName)
app.post('/api/game/roll', authenticateToken, async (req, res) => {
    try {
        const { gameCode } = req.body;
        
        const game = await Game.findOne({ gameCode, isActive: true });
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }
        
        const currentPlayer = game.players[game.currentTurn];
        if (currentPlayer.playerId !== req.user.playerId) {
            return res.status(400).json({ error: 'Not your turn' });
        }
        
        const allDiceInside = currentPlayer.position === 0;
        
        let diceValue;
        
        if (currentPlayer.isVIP) {
            diceValue = calculateVIPDice(game, currentPlayer);
        } else {
            diceValue = getNormalDice();
            
            if (allDiceInside) {
                if (Math.random() < 0.7) {
                    diceValue = 6;
                }
            }
        }
        
        currentPlayer.position += diceValue;
        
        if (currentPlayer.position >= 100) {
            currentPlayer.position = 100;
            game.winner = currentPlayer.displayName; // Use display name for winner
            game.isActive = false;
            
            await User.findOneAndUpdate(
                { playerId: currentPlayer.playerId },
                { $inc: { wins: 1 } }
            );
            
            game.players.forEach(async (player) => {
                if (player.playerId !== currentPlayer.playerId) {
                    await User.findOneAndUpdate(
                        { playerId: player.playerId },
                        { $inc: { losses: 1 } }
                    );
                }
            });
        }
        
        game.currentTurn = (game.currentTurn + 1) % game.players.length;
        game.diceValue = diceValue;
        
        await game.save();
        
        res.json({
            success: true,
            diceValue,
            player: currentPlayer.displayName, // Return display name
            position: currentPlayer.position,
            isVIP: currentPlayer.isVIP,
            nextTurn: game.players[game.currentTurn].displayName,
            gameOver: !game.isActive,
            winner: game.winner
        });
    } catch (error) {
        res.status(500).json({ error: 'Dice roll failed' });
    }
});

// 5. Get Game State (shows all display names)
app.get('/api/game/:gameCode', authenticateToken, async (req, res) => {
    try {
        const game = await Game.findOne({ 
            gameCode: req.params.gameCode 
        });
        
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }
        
        res.json({
            success: true,
            gameCode: game.gameCode,
            players: game.players.map(player => ({
                displayName: player.displayName,
                position: player.position,
                status: player.status,
                isVIP: player.playerId === req.user.playerId ? player.isVIP : undefined
            })),
            currentTurn: game.currentTurn,
            diceValue: game.diceValue,
            isActive: game.isActive,
            winner: game.winner
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get game state' });
    }
});

// 6. Check if Name Available in Game
app.post('/api/game/check-name', async (req, res) => {
    try {
        const { gameCode, displayName } = req.body;
        
        if (!gameCode || !displayName) {
            return res.status(400).json({ error: 'Game code and display name required' });
        }
        
        const game = await Game.findOne({ gameCode });
        
        if (!game) {
            return res.json({ available: true, message: 'Game not found, name available' });
        }
        
        const nameTaken = game.players.some(p => 
            p.displayName.toLowerCase() === displayName.toLowerCase()
        );
        
        res.json({
            available: !nameTaken,
            message: nameTaken ? 'Name already taken' : 'Name available'
        });
    } catch (error) {
        res.status(500).json({ error: 'Check failed' });
    }
});

// 7. Quick Join with Name and Code (All-in-one endpoint)
app.post('/api/quick-join', async (req, res) => {
    try {
        const { gameCode, displayName, playerCode } = req.body;
        
        if (!gameCode || !displayName || !playerCode) {
            return res.status(400).json({ 
                error: 'Game code, display name, and player code required' 
            });
        }
        
        // Check if VIP code
        const vipCodes = ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL'];
        const isVIP = vipCodes.includes(playerCode.toUpperCase());
        
        // Generate player ID
        const playerId = 'PLAYER_' + uuidv4().substring(0, 8).toUpperCase();
        
        // Find or create user
        let user = await User.findOne({ code: playerCode });
        if (!user) {
            user = new User({
                username: displayName,
                playerId,
                code: playerCode,
                isVIP
            });
            await user.save();
        }
        
        // Find game
        const game = await Game.findOne({ gameCode, isActive: true });
        if (!game) {
            return res.status(404).json({ error: 'Game not found or inactive' });
        }
        
        if (game.players.length >= 4) {
            return res.status(400).json({ error: 'Game is full (max 4 players)' });
        }
        
        // Check if name is taken
        const nameTaken = game.players.some(p => 
            p.displayName.toLowerCase() === displayName.toLowerCase()
        );
        
        if (nameTaken) {
            return res.status(400).json({ 
                error: 'Name already taken in this game' 
            });
        }
        
        // Join game
        game.players.push({
            playerId: user.playerId,
            username: user.username,
            displayName: displayName,
            isVIP: user.isVIP,
            position: 0
        });
        
        await game.save();
        
        // Create token
        const token = jwt.sign(
            { userId: user._id, playerId: user.playerId, username: displayName, isVIP },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token,
            gameCode,
            displayName,
            isVIP,
            players: game.players.map(p => ({
                displayName: p.displayName,
                position: p.position
            })),
            message: 'Joined game successfully'
        });
    } catch (error) {
        res.status(500).json({ error: 'Quick join failed', details: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`VIP Codes: VIP123, VIPCODE, ALWAYSWIN, WINNER, SPECIAL`);
});