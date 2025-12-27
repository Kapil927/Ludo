const Dice = require('../models/Dice');
const Game = require('../models/Game');
const VIPLogic = require('../utils/vipLogic');

// Roll dice (with VIP cheating logic)
exports.rollDice = async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.userId;
        const isVIP = req.isVIP;
        
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

        let diceValue;
        let isManipulated = false;
        let manipulationType = 'normal';

        if (isVIP) {
            // Use VIP logic to "roll" dice
            const vipLogic = new VIPLogic(game, userId);
            diceValue = vipLogic.calculateOptimalDice();
            isManipulated = true;
            
            // Determine manipulation type based on dice value and game state
            if (diceValue === 6 && game.players.find(p => p.userId === userId).tokens.some(t => t.isHome)) {
                manipulationType = 'escape';
            } else if (diceValue >= 4) {
                manipulationType = 'winning';
            }
        } else {
            // Normal random dice for non-VIP players
            diceValue = Math.floor(Math.random() * 6) + 1;
        }

        // Update game with dice value
        game.diceValue = diceValue;
        game.diceHistory.push({
            playerId: userId,
            value: diceValue,
            timestamp: new Date()
        });

        await game.save();

        // Save dice roll record
        const diceRecord = new Dice({
            gameId,
            playerId: userId,
            isVIP,
            diceValue,
            isManipulated,
            manipulationType,
            gameState: {
                currentPlayer: game.currentPlayer,
                playerPositions: game.players.map(p => ({
                    userId: p.userId,
                    tokensOut: p.tokens.filter(t => !t.isHome).length,
                    tokensFinished: p.tokens.filter(t => t.isFinished).length
                }))
            }
        });

        await diceRecord.save();

        res.json({
            success: true,
            dice: {
                value: diceValue,
                isVIPRoll: isVIP,
                isManipulated: isVIP ? isManipulated : false,
                message: isVIP ? getVIPDiceMessage(diceValue, manipulationType) : 'Normal dice roll'
            },
            gameState: {
                currentPlayer: game.currentPlayer,
                currentPlayerName: currentPlayer.name,
                diceValue: diceValue,
                canMoveSixAgain: diceValue === 6
            }
        });

    } catch (error) {
        console.error('Dice roll error:', error);
        res.status(500).json({ 
            error: 'Failed to roll dice',
            message: error.message 
        });
    }
};

// Get dice history for a game
exports.getDiceHistory = async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.userId;
        const isVIP = req.isVIP;
        
        const game = await Game.findOne({ gameId });
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Check if user is in the game
        const isPlayerInGame = game.players.some(p => p.userId === userId);
        if (!isPlayerInGame && !isVIP) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const diceHistory = await Dice.find({ gameId })
            .sort({ timestamp: -1 })
            .limit(50)
            .select('playerId diceValue isManipulated manipulationType timestamp');

        // Hide manipulation info from non-VIP players
        const safeHistory = diceHistory.map(record => ({
            playerId: record.playerId,
            diceValue: record.diceValue,
            timestamp: record.timestamp,
            isManipulated: isVIP ? record.isManipulated : undefined,
            manipulationType: isVIP ? record.manipulationType : undefined
        }));

        res.json({
            success: true,
            diceHistory: safeHistory,
            totalRolls: diceHistory.length,
            averageDice: diceHistory.reduce((sum, d) => sum + d.diceValue, 0) / diceHistory.length
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to fetch dice history',
            message: error.message 
        });
    }
};

// Helper function for VIP dice messages
function getVIPDiceMessage(diceValue, manipulationType) {
    const messages = {
        normal: `Rolled ${diceValue}`,
        cutting: `Strategic ${diceValue} to cut opponent!`,
        escape: `Lucky ${diceValue} to escape danger!`,
        winning: `Perfect ${diceValue} for winning move!`,
        safe: `Safe ${diceValue} to avoid risks`
    };
    
    return messages[manipulationType] || messages.normal;
}