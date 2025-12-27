const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// CORS - Allow all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://user_448rkyjdg:p448rkyjdg@bytexldb.com:5050/db_448rkyjdg')
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
  })
  .catch(err => {
    console.log('❌ MongoDB Connection Error:', err.message);
  });

// ========== MODELS ==========

// User Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  password: { type: String, required: true },
  isVIP: { type: Boolean, default: false },
  totalGames: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Game Model
const gameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  players: [{
    userId: String,
    username: String,
    displayName: String,
    isVIP: Boolean,
    color: String,
    pieces: [{
      id: Number,
      position: Number,
      isHome: Boolean,
      isSafe: Boolean,
      isFinished: Boolean
    }],
    diceValue: Number,
    hasTurn: Boolean
  }],
  currentTurn: { type: Number, default: 0 },
  gameState: { type: String, default: 'waiting' },
  winner: { userId: String, username: String },
  settings: {
    maxPlayers: { type: Number, default: 4 },
    enableVIP: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Game = mongoose.model('Game', gameSchema);

// ========== ROUTES ==========

// 1. Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'LUDO Game API is running',
    timestamp: new Date().toISOString()
  });
});

// 2. Initialize Users
app.get('/api/auth/init', async (req, res) => {
  try {
    console.log('Initializing users...');
    
    const users = [
      { username: 'player1', displayName: 'Player One', password: 'player123', isVIP: false },
      { username: 'player2', displayName: 'Player Two', password: 'player123', isVIP: false },
      { username: 'player3', displayName: 'Player Three', password: 'player123', isVIP: false },
      { username: 'player4', displayName: 'Player Four', password: 'player123', isVIP: false },
      { username: 'friend', displayName: 'My Friend', password: 'friend123', isVIP: true }
    ];

    for (const userData of users) {
      const existingUser = await User.findOne({ username: userData.username });
      
      if (!existingUser) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);
        
        const user = new User({
          username: userData.username,
          displayName: userData.displayName,
          password: hashedPassword,
          isVIP: userData.isVIP
        });
        
        await user.save();
        console.log(`✅ Created user: ${userData.username}`);
      } else {
        console.log(`ℹ️ User already exists: ${userData.username}`);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Users initialized successfully',
      totalUsers: await User.countDocuments()
    });
    
  } catch (error) {
    console.error('Error initializing users:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Login attempt for:', username);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and password are required' 
      });
    }
    
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'User not found. Please initialize users first.' 
      });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid password' 
      });
    }
    
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      'super_secret_ludo_key_123',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        isVIP: user.isVIP,
        stats: {
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          winRate: user.winRate
        }
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
});

// 4. Get All Users
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username displayName isVIP totalGames wins winRate');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Get User Profile
app.get('/api/auth/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, 'super_secret_ludo_key_123');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        isVIP: user.isVIP,
        stats: {
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          winRate: user.winRate
        }
      }
    });
    
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

// 6. Create Game
app.post('/api/game/create', async (req, res) => {
  try {
    const { settings = {} } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, 'super_secret_ludo_key_123');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const gameId = 'GAME_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    
    const game = new Game({
      gameId,
      players: [{
        userId: user._id.toString(),
        username: user.username,
        displayName: user.displayName,
        isVIP: user.isVIP,
        color: 'red',
        hasTurn: true,
        pieces: Array.from({ length: 4 }, (_, i) => ({
          id: i,
          position: -1,
          isHome: true,
          isSafe: false,
          isFinished: false
        }))
      }],
      settings: {
        maxPlayers: settings.maxPlayers || 4,
        enableVIP: settings.enableVIP !== false
      }
    });
    
    await game.save();
    
    res.json({
      success: true,
      game: {
        id: game._id,
        gameId: game.gameId,
        players: game.players,
        currentTurn: game.currentTurn,
        gameState: game.gameState,
        settings: game.settings
      }
    });
    
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Get Active Games
app.get('/api/game/active', async (req, res) => {
  try {
    const games = await Game.find({ 
      gameState: { $in: ['waiting', 'active'] }
    }).sort({ createdAt: -1 }).limit(10);
    
    res.json({ success: true, games });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Get Game State
app.get('/api/game/state/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findOne({ gameId });
    
    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    const currentPlayer = game.players[game.currentTurn % game.players.length];
    
    res.json({
      success: true,
      game: {
        id: game._id,
        gameId: game.gameId,
        players: game.players,
        currentTurn: game.currentTurn,
        currentPlayer: {
          userId: currentPlayer.userId,
          username: currentPlayer.username,
          displayName: currentPlayer.displayName,
          isVIP: currentPlayer.isVIP,
          color: currentPlayer.color
        },
        gameState: game.gameState,
        winner: game.winner
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Join Game
app.post('/api/game/join/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, 'super_secret_ludo_key_123');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const game = await Game.findOne({ gameId, gameState: 'waiting' });
    
    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found or already started' });
    }
    
    if (game.players.length >= game.settings.maxPlayers) {
      return res.status(400).json({ success: false, error: 'Game is full' });
    }
    
    const colors = ['red', 'green', 'blue', 'yellow'];
    const assignedColor = colors[game.players.length];
    
    game.players.push({
      userId: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      isVIP: user.isVIP,
      color: assignedColor,
      hasTurn: false,
      pieces: Array.from({ length: 4 }, (_, i) => ({
        id: i,
        position: -1,
        isHome: true,
        isSafe: false,
        isFinished: false
      }))
    });
    
    await game.save();
    
    res.json({
      success: true,
      game: {
        id: game._id,
        gameId: game.gameId,
        players: game.players,
        currentTurn: game.currentTurn,
        gameState: game.gameState
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Start Game
app.post('/api/game/start/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, 'super_secret_ludo_key_123');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const game = await Game.findOne({ gameId });
    
    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    if (game.players[0].userId !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only game creator can start the game' });
    }
    
    game.gameState = 'active';
    await game.save();
    
    res.json({
      success: true,
      game: {
        id: game._id,
        gameId: game.gameId,
        players: game.players,
        currentTurn: game.currentTurn,
        gameState: game.gameState
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Roll Dice
app.post('/api/game/roll/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, 'super_secret_ludo_key_123');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const game = await Game.findOne({ gameId });
    
    if (!game || game.gameState !== 'active') {
      return res.status(400).json({ success: false, error: 'Game not active' });
    }
    
    const currentPlayer = game.players[game.currentTurn % game.players.length];
    
    if (currentPlayer.userId !== user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Not your turn' });
    }
    
    // VIP Dice Logic
    let diceValue;
    if (currentPlayer.isVIP && game.settings.enableVIP) {
      // VIP gets better rolls
      const roll = Math.random();
      if (roll < 0.4) diceValue = 6; // 40% chance of 6
      else if (roll < 0.7) diceValue = Math.floor(Math.random() * 3) + 4; // 30% chance of 4-6
      else diceValue = Math.floor(Math.random() * 6) + 1; // 30% normal roll
    } else {
      // Normal random roll
      diceValue = Math.floor(Math.random() * 6) + 1;
    }
    
    currentPlayer.diceValue = diceValue;
    await game.save();
    
    res.json({
      success: true,
      diceValue,
      currentPlayer: {
        userId: currentPlayer.userId,
        username: currentPlayer.username,
        color: currentPlayer.color
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'LUDO Game API',
    version: '1.0.0',
    endpoints: [
      'GET  /health',
      'GET  /api/auth/init',
      'POST /api/auth/login',
      'GET  /api/auth/users',
      'GET  /api/auth/profile',
      'POST /api/game/create',
      'GET  /api/game/active',
      'GET  /api/game/state/:gameId',
      'POST /api/game/join/:gameId',
      'POST /api/game/start/:gameId',
      'POST /api/game/roll/:gameId'
    ]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║        🎮 LUDO Game Server           ║
╠══════════════════════════════════════╣
║ 📡 Port: ${PORT}                          ║
║ 🌍 CORS: Enabled for all origins     ║
║ 🗄️  MongoDB: Connected               ║
║ 📍 API: http://localhost:${PORT}         ║
╚══════════════════════════════════════╝
  `);
});