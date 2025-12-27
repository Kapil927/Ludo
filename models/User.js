const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    isVIP: {
        type: Boolean,
        default: false
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    gamesWon: {
        type: Number,
        default: 0
    },
    winRate: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Update win rate before saving
UserSchema.pre('save', function(next) {
    if (this.gamesPlayed > 0) {
        this.winRate = (this.gamesWon / this.gamesPlayed) * 100;
    }
    next();
});

module.exports = mongoose.model('User', UserSchema);