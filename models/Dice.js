const mongoose = require('mongoose');

const DiceSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true
    },
    playerId: {
        type: String,
        required: true
    },
    isVIP: {
        type: Boolean,
        default: false
    },
    diceValue: {
        type: Number,
        required: true,
        min: 1,
        max: 6
    },
    isManipulated: {
        type: Boolean,
        default: false
    },
    manipulationType: {
        type: String,
        enum: ['normal', 'cutting', 'escape', 'winning', 'safe'],
        default: 'normal'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    gameState: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
});

module.exports = mongoose.model('Dice', DiceSchema);