const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://user_448rkyjdg:p448rkyjdg@bytexldb.com:5050/db_448rkyjdg')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ========== MODELS ==========
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true },
  displayName: String,
  password: String,
  isVIP: Boolean,
  totalGames: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}));

const Game = mongoose.model('Game', new mongoose.Schema({
  gameId: String,
  players: Array,
  currentTurn: { type: Number, default: 0 },
  gameState: { type: String, default: 'waiting' },
  winner: Object,
  settings: Object,
  lastActivity: { type: Date, default: Date.now },
  turnTimer: { type: Number, default: 30 }, // 30 seconds per turn
  autoPlay: { type: Boolean, default: true }, // Auto-play for inactive players
  createdAt: { type: Date, default: Date.now }
}));

// ========== GAME CONSTANTS ==========
const VIP_PASSWORD = 'winning123';
const TURN_TIME_LIMIT = 30; // seconds
const AUTO_PLAY_DELAY = 10; // seconds before auto-play kicks in
const MAX_TURN_TIME = 45; // maximum seconds per turn

// Store active timers for games
const gameTimers = new Map();

// ========== HELPER FUNCTIONS ==========
const createDefaultUsers = async () => {
  try {
    console.log('📝 Creating default users...');
    
    const defaultUsers = [
      { username: 'player1', displayName: 'Player One', password: 'player123', isVIP: false },
      { username: 'player2', displayName: 'Player Two', password: 'player123', isVIP: false },
      { username: 'player3', displayName: 'Player Three', password: 'player123', isVIP: false },
      { username: 'player4', displayName: 'Player Four', password: 'player123', isVIP: false }
    ];
    
    for (const userData of defaultUsers) {
      const exists = await User.findOne({ username: userData.username });
      
      if (!exists) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await User.create({
          username: userData.username,
          displayName: userData.displayName,
          password: hashedPassword,
          isVIP: userData.isVIP
        });
        console.log(`   Created default: ${userData.username}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Default user creation failed:', error);
    return false;
  }
};

// Auto-play function for inactive players
const autoPlayTurn = async (gameId) => {
  try {
    const game = await Game.findOne({ gameId });
    
    if (!game || game.gameState !== 'active') {
      clearTimer(gameId);
      return;
    }
    
    const currentPlayer = game.players[game.currentTurn % game.players.length];
    
    console.log(`⏰ Auto-playing for ${currentPlayer.displayName} in game ${gameId}`);
    
    // Auto-roll dice
    let diceValue;
    if (currentPlayer.isVIP) {
      const roll = Math.random();
      if (roll < 0.4) diceValue = 6;
      else if (roll < 0.7) diceValue = Math.floor(Math.random() * 3) + 4;
      else diceValue = Math.floor(Math.random() * 6) + 1;
    } else {
      diceValue = Math.floor(Math.random() * 6) + 1;
    }
    
    currentPlayer.diceValue = diceValue;
    
    // Auto-choose best move for VIP, random for others
    const validPieces = currentPlayer.pieces.filter(p => 
      !p.isFinished && (p.position === -1 ? diceValue === 6 : true)
    );
    
    if (validPieces.length > 0) {
      let pieceId;
      if (currentPlayer.isVIP) {
        // VIP chooses piece closest to finish
        pieceId = validPieces.reduce((best, piece) => 
          piece.position > best.position ? piece : best
        ).id;
      } else {
        // Random piece for normal players
        pieceId = validPieces[Math.floor(Math.random() * validPieces.length)].id;
      }
      
      // Make the move
      const piece = currentPlayer.pieces[pieceId];
      if (piece.position === -1 && diceValue === 6) {
        piece.position = 0;
        piece.isHome = false;
      } else if (piece.position >= 0) {
        piece.position += diceValue;
        if (piece.position >= 52) {
          piece.isFinished = true;
          piece.position = 100;
        }
      }
    }
    
    // Clear dice and move to next turn
    currentPlayer.diceValue = null;
    
    // Check for winner
    const allFinished = currentPlayer.pieces.every(p => p.isFinished);
    if (allFinished) {
      game.gameState = 'finished';
      game.winner = {
        userId: currentPlayer.userId,
        username: currentPlayer.username,
        displayName: currentPlayer.displayName
      };
      
      // Update stats
      await User.updateOne(
        { _id: currentPlayer.userId },
        { $inc: { totalGames: 1, wins: 1 } }
      );
      
      game.players.forEach(async (player) => {
        if (player.userId !== currentPlayer.userId) {
          await User.updateOne(
            { _id: player.userId },
            { $inc: { totalGames: 1, losses: 1 } }
          );
        }
      });
      
      clearTimer(gameId);
    } else {
      game.currentTurn++;
      game.lastActivity = new Date();
      await game.save();
      
      // Start timer for next player
      startTurnTimer(gameId);
    }
    
    await game.save();
    
  } catch (error) {
    console.error('Auto-play error:', error);
  }
};

// Timer management functions
const startTurnTimer = (gameId) => {
  clearTimer(gameId);
  
  const timer = setTimeout(() => {
    autoPlayTurn(gameId);
  }, TURN_TIME_LIMIT * 1000);
  
  gameTimers.set(gameId, timer);
};

const clearTimer = (gameId) => {
  if (gameTimers.has(gameId)) {
    clearTimeout(gameTimers.get(gameId));
    gameTimers.delete(gameId);
  }
};

// Create default users when server starts
createDefaultUsers();

// ========== ROUTES ==========

// 1. Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'LUDO API is running',
    features: ['Fast-paced gameplay', 'Auto-play', 'Time limits', 'VIP system'],
    turnTimeLimit: TURN_TIME_LIMIT + ' seconds'
  });
});

// 2. User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    
    console.log(`📝 Registration: ${username} (${displayName})`);
    
    if (!username || !displayName || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ 
        success: false,
        error: 'Username must be at least 3 characters' 
      });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Username already taken' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const isVIP = (password === VIP_PASSWORD);
    
    const user = new User({
      username,
      displayName,
      password: hashedPassword,
      isVIP,
      totalGames: 0,
      wins: 0,
      losses: 0,
      winRate: 0
    });
    
    await user.save();
    
    console.log(`✅ User registered: ${username} (VIP: ${isVIP})`);
    
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      'super_secret_ludo_key_123',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        isVIP: user.isVIP,
        stats: { totalGames: 0, wins: 0, losses: 0, winRate: 0 }
      },
      vipHint: isVIP ? '🎉 You are a VIP player!' : `Use "${VIP_PASSWORD}" to become VIP`
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and password required' 
      });
    }
    
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'User not found. Please register first.' 
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
    
    console.log(`✅ Login successful: ${username} (VIP: ${user.isVIP})`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        isVIP: user.isVIP,
        stats: {
          totalGames: user.totalGames || 0,
          wins: user.wins || 0,
          losses: user.losses || 0,
          winRate: user.winRate || 0
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

// 4. Game Creation
app.post('/api/game/create', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token required' });
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
        diceValue: null,
        pieces: Array.from({ length: 4 }, (_, i) => ({
          id: i,
          position: -1,
          isHome: true,
          isSafe: false,
          isFinished: false
        }))
      }],
      settings: { 
        maxPlayers: 4, 
        enableVIP: true,
        turnTimeLimit: TURN_TIME_LIMIT,
        autoPlay: true
      },
      lastActivity: new Date(),
      turnTimer: TURN_TIME_LIMIT
    });
    
    await game.save();
    
    res.json({
      success: true,
      message: 'Game created! 30 seconds per turn.',
      game: {
        id: game._id,
        gameId: game.gameId,
        players: game.players,
        currentTurn: game.currentTurn,
        gameState: game.gameState,
        settings: game.settings,
        timeLimit: TURN_TIME_LIMIT
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Get Active Games
app.get('/api/game/active', async (req, res) => {
  try {
    const games = await Game.find({ gameState: { $in: ['waiting', 'active'] } })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Add time remaining info
    const gamesWithTime = games.map(game => ({
      ...game.toObject(),
      timeRemaining: game.gameState === 'active' ? 
        Math.max(0, TURN_TIME_LIMIT - Math.floor((Date.now() - game.lastActivity) / 1000)) : null
    }));
    
    res.json({ success: true, games: gamesWithTime });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get Game State with Timer
app.get('/api/game/state/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findOne({ gameId });
    
    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    
    const currentPlayer = game.players[game.currentTurn % game.players.length] || game.players[0];
    
    // Calculate time remaining
    const timeElapsed = Math.floor((Date.now() - game.lastActivity) / 1000);
    const timeRemaining = Math.max(0, TURN_TIME_LIMIT - timeElapsed);
    
    // Start timer if game is active and no timer exists
    if (game.gameState === 'active' && !gameTimers.has(gameId)) {
      startTurnTimer(gameId);
    }
    
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
        winner: game.winner,
        settings: game.settings,
        timeRemaining: timeRemaining,
        timeLimit: TURN_TIME_LIMIT,
        urgency: timeRemaining < 10 ? 'hurry' : timeRemaining < 20 ? 'warning' : 'normal'
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Roll Dice with Time Check
app.post('/api/game/roll/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token required' });
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
    
    // Check if time is up
    const timeElapsed = Math.floor((Date.now() - game.lastActivity) / 1000);
    if (timeElapsed > MAX_TURN_TIME) {
      return res.status(400).json({ 
        success: false, 
        error: 'Turn time expired! Auto-playing...',
        autoPlay: true 
      });
    }
    
    // Reset timer
    clearTimer(gameId);
    startTurnTimer(gameId);
    
    // VIP DICE LOGIC
    let diceValue;
    let diceType = 'normal';
    
    if (user.isVIP) {
      // VIP gets smart rolls based on game situation
      const finishedPieces = currentPlayer.pieces.filter(p => p.isFinished).length;
      const piecesOnBoard = currentPlayer.pieces.filter(p => p.position >= 0 && !p.isFinished).length;
      
      if (finishedPieces === 3) {
        // Need to finish last piece - prioritize high numbers
        const roll = Math.random();
        if (roll < 0.5) diceValue = Math.floor(Math.random() * 3) + 4; // 50% chance of 4-6
        else diceValue = Math.floor(Math.random() * 6) + 1;
        diceType = 'finishing';
      } else if (piecesOnBoard === 0) {
        // Need to get pieces out - prioritize 6
        const roll = Math.random();
        if (roll < 0.5) diceValue = 6; // 50% chance of 6
        else diceValue = Math.floor(Math.random() * 6) + 1;
        diceType = 'starting';
      } else {
        // Normal VIP advantage
        const roll = Math.random();
        if (roll < 0.4) diceValue = 6;
        else if (roll < 0.7) diceValue = Math.floor(Math.random() * 3) + 4;
        else diceValue = Math.floor(Math.random() * 6) + 1;
        diceType = 'vip';
      }
    } else {
      // Normal random roll
      diceValue = Math.floor(Math.random() * 6) + 1;
    }
    
    currentPlayer.diceValue = diceValue;
    game.lastActivity = new Date();
    await game.save();
    
    // Suggest moves for VIP
    let suggestedMove = null;
    if (user.isVIP && diceValue === 6) {
      const pieceInHome = currentPlayer.pieces.find(p => p.position === -1);
      if (pieceInHome) {
        suggestedMove = {
          pieceId: pieceInHome.id,
          reason: 'Bring new piece out to increase board presence'
        };
      }
    }
    
    res.json({
      success: true,
      diceValue,
      isVIP: user.isVIP,
      diceType: diceType,
      timeRemaining: TURN_TIME_LIMIT,
      suggestedMove: suggestedMove,
      hurry: timeElapsed > 20,
      currentPlayer: {
        userId: currentPlayer.userId,
        username: currentPlayer.username,
        displayName: currentPlayer.displayName,
        color: currentPlayer.color
      }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Make Move with Speed Bonus
app.post('/api/game/move/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { pieceId } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token required' });
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
    
    if (!currentPlayer.diceValue) {
      return res.status(400).json({ success: false, error: 'Roll dice first' });
    }
    
    // Check move speed
    const timeElapsed = Math.floor((Date.now() - game.lastActivity) / 1000);
    const isFastMove = timeElapsed < 5;
    
    // Make move
    const piece = currentPlayer.pieces[pieceId];
    const fromPosition = piece.position;
    
    if (piece.position === -1 && currentPlayer.diceValue === 6) {
      piece.position = 0;
      piece.isHome = false;
    } else if (piece.position >= 0) {
      piece.position += currentPlayer.diceValue;
      
      // Check if finished
      if (piece.position >= 52) {
        piece.isFinished = true;
        piece.position = 100;
      }
    }
    
    // Clear dice and move to next turn
    currentPlayer.diceValue = null;
    
    // Check for winner
    const allFinished = currentPlayer.pieces.every(p => p.isFinished);
    if (allFinished) {
      game.gameState = 'finished';
      game.winner = {
        userId: currentPlayer.userId,
        username: currentPlayer.username,
        displayName: currentPlayer.displayName
      };
      
      // Update stats with speed bonus for VIP
      const winBonus = user.isVIP && isFastMove ? 2 : 1;
      await User.updateOne(
        { _id: currentPlayer.userId },
        { $inc: { totalGames: 1, wins: winBonus } }
      );
      
      clearTimer(gameId);
    } else {
      game.currentTurn++;
      game.lastActivity = new Date();
      
      // Reset timer for next player
      clearTimer(gameId);
      startTurnTimer(gameId);
    }
    
    await game.save();
    
    res.json({
      success: true,
      move: {
        pieceId,
        fromPosition,
        toPosition: piece.position,
        isFinished: piece.isFinished,
        speed: isFastMove ? 'fast' : 'normal'
      },
      gameState: game.gameState,
      winner: game.winner,
      speedBonus: isFastMove && user.isVIP ? 'VIP fast move bonus!' : null
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
      return res.status(401).json({ success: false, error: 'Token required' });
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
      diceValue: null,
      pieces: Array.from({ length: 4 }, (_, i) => ({
        id: i,
        position: -1,
        isHome: true,
        isSafe: false,
        isFinished: false
      }))
    });
    
    // Auto-start if game is full
    if (game.players.length >= game.settings.maxPlayers) {
      game.gameState = 'active';
      startTurnTimer(gameId);
    }
    
    await game.save();
    
    res.json({
      success: true,
      message: game.players.length >= game.settings.maxPlayers ? 
        'Game full! Starting automatically...' : 'Joined game!',
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
      return res.status(401).json({ success: false, error: 'Token required' });
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
      return res.status(403).json({ success: false, error: 'Only game creator can start' });
    }
    
    if (game.players.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 players' });
    }
    
    game.gameState = 'active';
    game.lastActivity = new Date();
    
    // Start timer for first player
    startTurnTimer(gameId);
    
    await game.save();
    
    res.json({
      success: true,
      message: 'Game started! 30 seconds per turn. Auto-play enabled.',
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

// 11. Clean up inactive games (cron job simulation)
setInterval(async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const inactiveGames = await Game.find({
      lastActivity: { $lt: oneHourAgo },
      gameState: { $in: ['waiting', 'active'] }
    });
    
    for (const game of inactiveGames) {
      console.log(`🧹 Cleaning up inactive game: ${game.gameId}`);
      game.gameState = 'abandoned';
      await game.save();
      clearTimer(game.gameId);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 15 * 60 * 1000); // Every 15 minutes

// Home page
app.get('/', (req, res) => {
  res.json({
    message: '🎮 FAST-PACED LUDO Game',
    version: '2.0.0',
    features: [
      '⏱️ 30-second turns',
      '🤖 Auto-play for inactive players',
      '🎯 VIP smart dice',
      '⚡ Speed bonuses',
      '🚀 Fast-paced gameplay'
    ],
    timeLimits: {
      turnTime: TURN_TIME_LIMIT + ' seconds',
      autoPlay: 'After ' + AUTO_PLAY_DELAY + ' seconds',
      maxTurnTime: MAX_TURN_TIME + ' seconds'
    },
    vipPassword: VIP_PASSWORD
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║              ⚡ FAST LUDO GAME SERVER              ║
╠════════════════════════════════════════════════════╣
║ 📡 Port: ${PORT}                                        ║
║ ⏱️  Turn Time: ${TURN_TIME_LIMIT} seconds                    ║
║ 🤖 Auto-play: Enabled                              ║
║ 🎯 VIP Password: "${VIP_PASSWORD}"                  ║
║ 🚀 Features: Time limits, Speed bonuses, Auto-play ║
╚════════════════════════════════════════════════════╝

🔥 Game will never be boring:
• 30-second turns - keeps game fast
• Auto-play kicks in if player is slow
• VIP gets smart dice based on situation
• Speed bonuses for quick moves
• Games auto-clean after inactivity
  `);
});