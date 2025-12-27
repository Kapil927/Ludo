const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'super_secret_ludo_key_123';

// Middleware with proper CORS
app.use(cors({
  origin: ['http://localhost:3000', 'https://kgwtenqptmapjtke-3000.ws2.app'],
  credentials: true
}));
app.use(express.json());

// In-memory database (no MongoDB needed)
const database = {
  users: [],
  games: [],
  // Auto-cleanup old games every hour
  lastCleanup: Date.now()
};

// Auto-cleanup function
const cleanupOldGames = () => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  database.games = database.games.filter(game => {
    // Keep active games and games created in last hour
    return game.isActive || (game.createdAt && game.createdAt > oneHourAgo);
  });
  
  database.lastCleanup = now;
  console.log(`🧹 Cleaned up old games. Total games: ${database.games.length}`);
};

// Run cleanup every hour
setInterval(cleanupOldGames, 60 * 60 * 1000);

// VIP Dice Logic
const calculateVIPDice = (gameState, vipPlayer) => {
  if (!gameState || !vipPlayer) return Math.floor(Math.random() * 6) + 1;
  
  const positions = gameState.players.map(p => p.position || 0);
  const vipPosition = vipPlayer.position || 0;
  
  // When VIP is close to winning
  if (vipPosition >= 90) {
    return Math.floor(Math.random() * 3) + 4; // 4-6
  }
  
  // Check if opponents are close to winning
  const opponentsClose = positions.some((p, i) => {
    const player = gameState.players[i];
    return player && !player.isVIP && p >= 85;
  });
  
  if (opponentsClose) {
    const chance = Math.random();
    if (chance < 0.7) return 6;
    if (chance < 0.9) return 5;
    return 4;
  }
  
  // Strategic play
  const randomFactor = Math.random();
  
  if (randomFactor < 0.6) { // 60% good moves
    if (vipPosition < 50) {
      return Math.floor(Math.random() * 2) + 5; // 5-6 for advancement
    } else {
      return Math.floor(Math.random() * 3) + 4; // 4-6 for finishing
    }
  } else if (randomFactor < 0.85) { // 25% average moves
    return Math.floor(Math.random() * 3) + 3; // 3-5
  } else { // 15% bad moves (to appear realistic)
    return Math.floor(Math.random() * 2) + 1; // 1-2
  }
};

const getNormalDice = () => Math.floor(Math.random() * 6) + 1;

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required' 
      });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.error('JWT verification error:', err.message);
        return res.status(403).json({ 
          success: false,
          error: 'Invalid or expired token' 
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Authentication error' 
    });
  }
};

// Helper functions for in-memory database
const db = {
  // User operations
  saveUser: (userData) => {
    const existingIndex = database.users.findIndex(u => u.playerId === userData.playerId);
    if (existingIndex >= 0) {
      database.users[existingIndex] = { ...database.users[existingIndex], ...userData };
      return database.users[existingIndex];
    } else {
      const user = { ...userData, _id: uuidv4(), createdAt: new Date() };
      database.users.push(user);
      return user;
    }
  },
  
  findUser: (query) => {
    return database.users.find(u => 
      Object.keys(query).every(key => u[key] === query[key])
    );
  },
  
  updateUser: (query, update) => {
    const index = database.users.findIndex(u => 
      Object.keys(query).every(key => u[key] === query[key])
    );
    if (index >= 0) {
      database.users[index] = { ...database.users[index], ...update };
      return database.users[index];
    }
    return null;
  },
  
  // Game operations
  saveGame: (gameData) => {
    const existingIndex = database.games.findIndex(g => g.gameCode === gameData.gameCode);
    if (existingIndex >= 0) {
      database.games[existingIndex] = { ...database.games[existingIndex], ...gameData };
      return database.games[existingIndex];
    } else {
      const game = { 
        ...gameData, 
        _id: uuidv4(), 
        createdAt: new Date(),
        isActive: gameData.isActive !== false
      };
      database.games.push(game);
      return game;
    }
  },
  
  findGame: (query) => {
    return database.games.find(g => 
      Object.keys(query).every(key => g[key] === query[key])
    );
  },
  
  updateGame: (query, update) => {
    const index = database.games.findIndex(g => 
      Object.keys(query).every(key => g[key] === query[key])
    );
    if (index >= 0) {
      database.games[index] = { ...database.games[index], ...update };
      return database.games[index];
    }
    return null;
  },
  
  // Stats
  getStats: () => ({
    users: database.users.length,
    games: database.games.length,
    activeGames: database.games.filter(g => g.isActive).length
  })
};

// Routes

// 1. Quick Registration
app.post('/api/quick-register', async (req, res) => {
  try {
    const { displayName, code } = req.body;
    
    // Validate input
    if (!displayName || !code) {
      return res.status(400).json({ 
        success: false,
        error: 'Display name and code required' 
      });
    }
    
    if (displayName.length < 2 || displayName.length > 20) {
      return res.status(400).json({ 
        success: false,
        error: 'Display name must be 2-20 characters' 
      });
    }
    
    const vipCodes = ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL'];
    const isVIP = vipCodes.includes(code.toUpperCase());
    
    const playerId = 'PLAYER_' + uuidv4().substring(0, 8).toUpperCase();
    
    const userData = {
      username: displayName,
      playerId,
      code,
      isVIP,
      wins: 0,
      losses: 0
    };
    
    const savedUser = db.saveUser(userData);
    
    const token = jwt.sign(
      { 
        userId: savedUser._id, 
        playerId, 
        username: displayName, 
        isVIP
      },
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
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Registration failed',
      details: error.message 
    });
  }
});

// 2. Create Game
app.post('/api/game/create', authenticateToken, async (req, res) => {
  try {
    const { displayName } = req.body;
    
    if (!displayName) {
      return res.status(400).json({ 
        success: false,
        error: 'Display name required' 
      });
    }
    
    const gameCode = 'GAME_' + uuidv4().substring(0, 6).toUpperCase();
    
    const gameData = {
      gameCode,
      players: [{
        playerId: req.user.playerId,
        username: req.user.username,
        displayName: displayName || req.user.username,
        isVIP: req.user.isVIP || false,
        position: 0,
        status: 'playing'
      }],
      currentTurn: 0,
      diceValue: 0,
      winner: null,
      isActive: true
    };
    
    const savedGame = db.saveGame(gameData);
    
    res.json({
      success: true,
      gameCode,
      displayName: displayName || req.user.username,
      message: 'Game created successfully'
    });
    
  } catch (error) {
    console.error('Game creation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Game creation failed',
      details: error.message 
    });
  }
});

// 3. Join Game
app.post('/api/game/join', authenticateToken, async (req, res) => {
  try {
    const { gameCode, displayName } = req.body;
    
    if (!gameCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Game code required' 
      });
    }
    
    if (!displayName) {
      return res.status(400).json({ 
        success: false,
        error: 'Display name required' 
      });
    }
    
    const game = db.findGame({ gameCode, isActive: true });
    
    if (!game) {
      return res.status(404).json({ 
        success: false,
        error: 'Game not found or inactive' 
      });
    }
    
    if (game.players.length >= 4) {
      return res.status(400).json({ 
        success: false,
        error: 'Game is full (max 4 players)' 
      });
    }
    
    const nameTaken = game.players.some(p => 
      p.displayName.toLowerCase() === displayName.toLowerCase()
    );
    
    if (nameTaken) {
      return res.status(400).json({ 
        success: false,
        error: 'Name already taken in this game' 
      });
    }
    
    const alreadyJoined = game.players.some(p => p.playerId === req.user.playerId);
    if (alreadyJoined) {
      return res.status(400).json({ 
        success: false,
        error: 'You already joined this game' 
      });
    }
    
    game.players.push({
      playerId: req.user.playerId,
      username: req.user.username,
      displayName: displayName,
      isVIP: req.user.isVIP || false,
      position: 0,
      status: 'playing'
    });
    
    db.updateGame({ gameCode }, game);
    
    res.json({
      success: true,
      gameCode,
      displayName,
      players: game.players.map(p => ({
        displayName: p.displayName,
        position: p.position
      })),
      message: 'Joined game successfully'
    });
    
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Join game failed',
      details: error.message 
    });
  }
});

// 4. Roll Dice
app.post('/api/game/roll', authenticateToken, async (req, res) => {
  try {
    const { gameCode } = req.body;
    
    if (!gameCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Game code required' 
      });
    }
    
    const game = db.findGame({ gameCode, isActive: true });
    
    if (!game) {
      return res.status(404).json({ 
        success: false,
        error: 'Game not found or inactive' 
      });
    }
    
    const currentPlayer = game.players[game.currentTurn];
    if (!currentPlayer) {
      return res.status(400).json({ 
        success: false,
        error: 'No current player found' 
      });
    }
    
    if (currentPlayer.playerId !== req.user.playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'Not your turn' 
      });
    }
    
    const allDiceInside = currentPlayer.position === 0;
    let diceValue;
    
    if (currentPlayer.isVIP) {
      diceValue = calculateVIPDice(game, currentPlayer);
      console.log(`🎯 VIP ${currentPlayer.displayName} rolled: ${diceValue}`);
    } else {
      diceValue = getNormalDice();
      
      if (allDiceInside) {
        if (Math.random() < 0.7) {
          diceValue = 6;
          console.log(`🎲 Normal player ${currentPlayer.displayName} got quick 6`);
        }
      }
    }
    
    currentPlayer.position += diceValue;
    
    if (currentPlayer.position >= 100) {
      currentPlayer.position = 100;
      game.winner = currentPlayer.displayName;
      game.isActive = false;
      
      console.log(`🏆 ${currentPlayer.displayName} WINS THE GAME!`);
      
      // Update user stats
      const winnerUser = db.findUser({ playerId: currentPlayer.playerId });
      if (winnerUser) {
        db.updateUser({ playerId: currentPlayer.playerId }, { 
          wins: (winnerUser.wins || 0) + 1 
        });
      }
      
      // Update other players' stats
      game.players.forEach(player => {
        if (player.playerId !== currentPlayer.playerId) {
          const user = db.findUser({ playerId: player.playerId });
          if (user) {
            db.updateUser({ playerId: player.playerId }, { 
              losses: (user.losses || 0) + 1 
            });
          }
        }
      });
    }
    
    game.currentTurn = (game.currentTurn + 1) % game.players.length;
    game.diceValue = diceValue;
    
    db.updateGame({ gameCode }, game);
    
    res.json({
      success: true,
      diceValue,
      player: currentPlayer.displayName,
      position: currentPlayer.position,
      isVIP: currentPlayer.isVIP,
      nextTurn: game.players[game.currentTurn]?.displayName || 'Unknown',
      gameOver: !game.isActive,
      winner: game.winner
    });
    
  } catch (error) {
    console.error('Dice roll error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Dice roll failed',
      details: error.message 
    });
  }
});

// 5. Get Game State
app.get('/api/game/:gameCode', authenticateToken, async (req, res) => {
  try {
    const gameCode = req.params.gameCode;
    
    const game = db.findGame({ gameCode });
    
    if (!game) {
      return res.status(404).json({ 
        success: false,
        error: 'Game not found',
        tip: 'Create a new game or check game code'
      });
    }
    
    // Hide VIP status from other players
    const safePlayers = game.players.map(player => ({
      displayName: player.displayName,
      position: player.position,
      status: player.status || 'playing',
      isVIP: player.playerId === req.user.playerId ? player.isVIP : undefined
    }));
    
    res.json({
      success: true,
      gameCode: game.gameCode,
      players: safePlayers,
      currentTurn: game.currentTurn,
      diceValue: game.diceValue,
      isActive: game.isActive !== false,
      winner: game.winner
    });
    
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get game state',
      details: error.message 
    });
  }
});

// 6. Quick Join - All-in-one endpoint
app.post('/api/quick-join', async (req, res) => {
  try {
    const { gameCode, displayName, playerCode } = req.body;
    
    // Validate input
    if (!gameCode || !displayName || !playerCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Game code, display name, and player code required' 
      });
    }
    
    const vipCodes = ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL'];
    const isVIP = vipCodes.includes(playerCode.toUpperCase());
    
    const playerId = 'PLAYER_' + uuidv4().substring(0, 8).toUpperCase();
    
    // Create or find user
    let user = db.findUser({ code: playerCode });
    if (!user) {
      user = {
        username: displayName,
        playerId,
        code: playerCode,
        isVIP,
        wins: 0,
        losses: 0
      };
      db.saveUser(user);
    }
    
    // Find game
    let game = db.findGame({ gameCode, isActive: true });
    
    if (!game) {
      return res.status(404).json({ 
        success: false,
        error: 'Game not found or inactive',
        tip: 'Create a new game first'
      });
    }
    
    if (game.players.length >= 4) {
      return res.status(400).json({ 
        success: false,
        error: 'Game is full (max 4 players)' 
      });
    }
    
    const nameTaken = game.players.some(p => 
      p.displayName.toLowerCase() === displayName.toLowerCase()
    );
    
    if (nameTaken) {
      return res.status(400).json({ 
        success: false,
        error: 'Name already taken in this game' 
      });
    }
    
    game.players.push({
      playerId: user.playerId,
      username: user.username,
      displayName: displayName,
      isVIP: user.isVIP,
      position: 0,
      status: 'playing'
    });
    
    db.updateGame({ gameCode }, game);
    
    const token = jwt.sign(
      { 
        userId: user._id || playerId, 
        playerId: user.playerId, 
        username: displayName, 
        isVIP
      },
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
    console.error('Quick join error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Quick join failed',
      details: error.message 
    });
  }
});

// 7. Simple Create (No auth needed)
app.post('/api/simple-create', (req, res) => {
  try {
    const { displayName, playerCode } = req.body;
    
    if (!displayName || !playerCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Name and code required' 
      });
    }
    
    const vipCodes = ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL'];
    const isVIP = vipCodes.includes(playerCode.toUpperCase());
    
    const playerId = 'PLAYER_' + uuidv4().substring(0, 8).toUpperCase();
    const gameCode = 'GAME_' + uuidv4().substring(0, 6).toUpperCase();
    
    // Create user
    const user = {
      username: displayName,
      playerId,
      code: playerCode,
      isVIP,
      wins: 0,
      losses: 0
    };
    db.saveUser(user);
    
    // Create game
    const gameData = {
      gameCode,
      players: [{
        playerId,
        username: displayName,
        displayName,
        isVIP,
        position: 0,
        status: 'playing'
      }],
      currentTurn: 0,
      diceValue: 0,
      winner: null,
      isActive: true
    };
    db.saveGame(gameData);
    
    const token = jwt.sign(
      { 
        userId: playerId, 
        playerId, 
        username: displayName, 
        isVIP
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      gameCode,
      displayName,
      isVIP,
      players: [{ displayName, position: 0 }],
      message: 'Game created successfully'
    });
    
  } catch (error) {
    console.error('Simple create error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Simple create failed',
      details: error.message 
    });
  }
});

// 8. Test endpoint
app.get('/api/test', (req, res) => {
  const stats = db.getStats();
  
  res.json({
    success: true,
    message: 'Ludo Backend is running! (In-Memory Mode)',
    stats,
    endpoints: [
      'POST /api/quick-register',
      'POST /api/game/create',
      'POST /api/game/join', 
      'POST /api/game/roll',
      'GET /api/game/:gameCode',
      'POST /api/quick-join',
      'POST /api/simple-create',
      'GET /api/health',
      'GET /api/stats',
      'GET /api/test'
    ],
    timestamp: new Date().toISOString(),
    vipCodes: ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL']
  });
});

// 9. Health check
app.get('/api/health', (req, res) => {
  const stats = db.getStats();
  
  res.json({
    success: true,
    message: 'Server is running in In-Memory mode',
    timestamp: new Date().toISOString(),
    stats,
    serverTime: new Date().toLocaleString(),
    uptime: process.uptime().toFixed(2) + ' seconds'
  });
});

// 10. Stats endpoint
app.get('/api/stats', (req, res) => {
  const stats = db.getStats();
  const leaderboard = database.users
    .sort((a, b) => (b.wins || 0) - (a.wins || 0))
    .slice(0, 10)
    .map(user => ({
      displayName: user.username,
      wins: user.wins || 0,
      losses: user.losses || 0,
      isVIP: user.isVIP
    }));
  
  res.json({
    success: true,
    stats,
    leaderboard,
    vipCodes: ['VIP123', 'VIPCODE', 'ALWAYSWIN', 'WINNER', 'SPECIAL']
  });
});

// 11. Reset endpoint (for testing)
app.get('/api/reset', (req, res) => {
  database.users = [];
  database.games = [];
  database.lastCleanup = Date.now();
  
  res.json({
    success: true,
    message: 'Database reset successfully',
    timestamp: new Date().toISOString()
  });
});

// 12. Root endpoint
app.get('/', (req, res) => {
  const stats = db.getStats();
  
  res.json({
    success: true,
    message: '🎮 Ludo Game API',
    version: '1.0.0',
    mode: 'In-Memory',
    stats,
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      stats: '/api/stats',
      quickRegister: '/api/quick-register',
      quickJoin: '/api/quick-join',
      simpleCreate: '/api/simple-create'
    },
    note: 'No MongoDB required - All data stored in memory'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      '/api/health',
      '/api/test',
      '/api/stats',
      '/api/quick-register',
      '/api/quick-join',
      '/api/simple-create'
    ]
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                LUDO BACKEND SERVER IS RUNNING            ║
╠══════════════════════════════════════════════════════════╣
║ Port: ${PORT}                                            ║
║ Mode: ✅ In-Memory (No MongoDB Required)                 ║
║ URL: http://localhost:${PORT}                            ║
║ Health: http://localhost:${PORT}/api/health              ║
║ Test: http://localhost:${PORT}/api/test                  ║
║                                                          ║
║ 📊 Quick Test:                                          ║
║ curl -X POST http://localhost:${PORT}/api/simple-create  ║
║   -H "Content-Type: application/json"                   ║
║   -d '{"displayName":"Test","playerCode":"VIP123"}'     ║
║                                                          ║
║ VIP Codes: VIP123, VIPCODE, ALWAYSWIN, WINNER, SPECIAL  ║
╚══════════════════════════════════════════════════════════╝
  `);
});