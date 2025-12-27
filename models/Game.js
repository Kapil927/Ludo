const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
        unique: true
    },
    players: [{
        userId: String,
        name: String,
        isVIP: Boolean,
        color: String,
        position: {
            type: Number,
            default: 0
        },
        tokens: [{
            id: Number,
            position: Number,
            isHome: {
                type: Boolean,
                default: true
            },
            isFinished: {
                type: Boolean,
                default: false
            },
            safePositions: [Number]
        }]
    }],
    currentPlayer: {
        type: Number,
        default: 0
    },
    diceValue: {
        type: Number,
        default: 0
    },
    diceHistory: [{
        playerId: String,
        value: Number,
        timestamp: Date
    }],
    status: {
        type: String,
        enum: ['waiting', 'active', 'finished'],
        default: 'waiting'
    },
    winner: {
        userId: String,
        name: String
    },
    movesHistory: [{
        playerId: String,
        diceValue: Number,
        tokenMoved: Number,
        fromPosition: Number,
        toPosition: Number,
        cutPlayer: String,
        timestamp: Date
    }],
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: Date,
    isVIPWin: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Game', GameSchema);