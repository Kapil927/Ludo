const Game = require('../models/Game');
const User = require('../models/User');

// Create new game
exports.createGame = async (req, res) => {
    try {
        const { playerIds } = req.body; // Array of user IDs
        
        if (!playerIds || playerIds.length < 2 || playerIds.length > 4) {
            return res.status(400).json({ 
                error: 'Invalid number of players',
                message: 'Game requires 2-4 players' 
            });
        }

        // Get player details
        const players = [];
        const colors = ['red', 'green', 'blue', 'yellow'];
        
        for (let i = 0; i < playerIds.length; i++) {
            const user = await User.findOne({ userId: playerIds[i] });
            if (!user) {
                return res.status(404).json({ 
                    error: 'Player not found',
                    message: `User ${playerIds[i]} does not exist`
                });
            }
            
            players.push({
                userId: user.userId,
                name: user.name,
                isVIP: user.isVIP,
                color: colors[i],
                position: 0,
                tokens: [
                    { id: 1, position: 0, isHome: true, isFinished: false, safePositions: [1, 9, 14, 22, 27, 35, 40, 48] },
                    { id: 2, position: 0, isHome: true, isFinished: false, safePositions: [1, 9, 14, 22, 27, 35, 40, 48] },
                    { id: 3, position: 0, isHome: true, isFinished: false, safePositions: [1, 9, 14, 22, 27, 35, 40, 48] },
                    { id: 4, position: 0, isHome: true, isFinished: false, safePositions: [1, 9, 14, 22, 27, 35, 40, 48] }
                ]
            });
        }

        const gameId = `GAME_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const game = new Game({
            gameId,
            players,
            status: 'active',
            startTime: new Date()
        });

        await game.save();

        res.status(201).json({
            success: true,
            game: {
                gameId: game.gameId,
                players: game.players.map(p => ({
                    userId: p.userId,
                    name: p.name,
                    color: p.color,
                    isVIP: p.isVIP
                })),
                currentPlayer: game.currentPlayer,
                status: game.status,
                startTime: game.startTime
            }
        });

    } catch (error) {
        console.error('Create game error:', error);
        res.status(500).json({ 
            error: 'Failed to create game',
            message: error.message 
        });
    }
};

// Get game state
exports.getGame = async (req, res) => {
    try {
        const { gameId } = req.params;
        
        const game = await Game.findOne({ gameId });
        
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Hide sensitive VIP logic from non-VIP players
        const safeGameState = {
            gameId: game.gameId,
            players: game.players.map(player => ({
                userId: player.userId,
                name: player.name,
                color: player.color,
                position: player.position,
                tokens: player.tokens.map(token => ({
                    id: token.id,
                    position: token.position,
                    isHome: token.isHome,
                    isFinished: token.isFinished
                }))
            })),
            currentPlayer: game.currentPlayer,
            diceValue: game.diceValue,
            status: game.status,
            movesHistory: game.movesHistory.slice(-10) // Last 10 moves
        };

        res.json({
            success: true,
            game: safeGameState
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch game',
            message: error.message 
        });
    }
};

// Make a move
exports.makeMove = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { tokenId } = req.body;
        const userId = req.userId;
        
        const game = await Game.findOne({ gameId });
        
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.status !== 'active') {
            return res.status(400).json({ error: 'Game is not active' });
        }

        // Check if it's user's turn
        const currentPlayer = game.players[game.currentPlayer];
        if (currentPlayer.userId !== userId) {
            return res.status(400).json({ error: 'Not your turn' });
        }

        // Find the token
        const tokenIndex = currentPlayer.tokens.findIndex(t => t.id === tokenId);
        if (tokenIndex === -1) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const token = currentPlayer.tokens[tokenIndex];
        
        // Check if move is valid
        if (token.isFinished) {
            return res.status(400).json({ error: 'Token already finished' });
        }

        if (token.isHome && game.diceValue !== 6) {
            return res.status(400).json({ error: 'Need a 6 to move out of home' });
        }

        // Calculate new position
        let newPosition;
        if (token.isHome) {
            newPosition = 1; // Start position
        } else {
            newPosition = token.position + game.diceValue;
            if (newPosition > 56) {
                return res.status(400).json({ error: 'Invalid move' });
            }
        }

        // Check for cutting other tokens
        let cutPlayer = null;
        if (!token.isHome) {
            for (let i = 0; i < game.players.length; i++) {
                if (i === game.currentPlayer) continue;
                
                const player = game.players[i];
                for (const opponentToken of player.tokens) {
                    if (!opponentToken.isHome && !opponentToken.isFinished && 
                        opponentToken.position === newPosition &&
                        !opponentToken.safePositions.includes(newPosition)) {
                        
                        // Cut the token
                        opponentToken.position = 0;
                        opponentToken.isHome = true;
                        cutPlayer = player.userId;
                        break;
                    }
                }
                if (cutPlayer) break;
            }
        }

        // Update token
        if (token.isHome) {
            token.isHome = false;
        }
        token.position = newPosition;
        
        // Check if token finished
        if (newPosition === 56) {
            token.isFinished = true;
        }

        // Record move
        game.movesHistory.push({
            playerId: userId,
            diceValue: game.diceValue,
            tokenMoved: tokenId,
            fromPosition: token.isHome ? 0 : token.position - game.diceValue,
            toPosition: newPosition,
            cutPlayer: cutPlayer,
            timestamp: new Date()
        });

        // Check for winner
        const finishedTokens = currentPlayer.tokens.filter(t => t.isFinished).length;
        if (finishedTokens === 4) {
            game.status = 'finished';
            game.winner = {
                userId: currentPlayer.userId,
                name: currentPlayer.name
            };
            game.endTime = new Date();
            game.isVIPWin = currentPlayer.isVIP;

            // Update user stats
            await User.updateOne(
                { userId: currentPlayer.userId },
                { 
                    $inc: { 
                        gamesPlayed: 1,
                        gamesWon: 1 
                    } 
                }
            );

            // Update other players' stats (only games played)
            for (const player of game.players) {
                if (player.userId !== currentPlayer.userId) {
                    await User.updateOne(
                        { userId: player.userId },
                        { $inc: { gamesPlayed: 1 } }
                    );
                }
            }
        } else {
            // Move to next player (unless dice was 6)
            if (game.diceValue !== 6) {
                game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
            }
        }

        await game.save();

        res.json({
            success: true,
            move: {
                player: currentPlayer.name,
                diceValue: game.diceValue,
                tokenMoved: tokenId,
                newPosition: newPosition,
                cutPlayer: cutPlayer,
                isFinished: token.isFinished
            },
            gameState: {
                currentPlayer: game.currentPlayer,
                status: game.status,
                winner: game.winner
            }
        });

    } catch (error) {
        console.error('Move error:', error);
        res.status(500).json({ 
            error: 'Failed to make move',
            message: error.message 
        });
    }
};

// Get user's active games
exports.getActiveGames = async (req, res) => {
    try {
        const userId = req.userId;
        
        const games = await Game.find({
            'players.userId': userId,
            status: 'active'
        }).select('gameId players status currentPlayer startTime');

        res.json({
            success: true,
            games: games.map(game => ({
                gameId: game.gameId,
                players: game.players.map(p => ({
                    name: p.name,
                    color: p.color,
                    isVIP: p.isVIP
                })),
                currentPlayer: game.currentPlayer,
                status: game.status,
                startTime: game.startTime
            }))
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch games',
            message: error.message 
        });
    }
};

// Get game history
exports.getGameHistory = async (req, res) => {
    try {
        const userId = req.userId;
        
        const games = await Game.find({
            'players.userId': userId,
            status: 'finished'
        })
        .sort({ endTime: -1 })
        .limit(20)
        .select('gameId players winner endTime isVIPWin movesHistory');

        res.json({
            success: true,
            games: games.map(game => ({
                gameId: game.gameId,
                players: game.players.map(p => ({
                    name: p.name,
                    isVIP: p.isVIP,
                    color: p.color
                })),
                winner: game.winner,
                endTime: game.endTime,
                isVIPWin: game.isVIPWin,
                totalMoves: game.movesHistory.length
            }))
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch game history',
            message: error.message 
        });
    }
};