const express = require('express');
const router = express.Router();
const diceController = require('../controllers/diceController');
const { auth } = require('../middleware/auth');

// Protected routes
router.post('/:gameId/roll', auth, diceController.rollDice);
router.get('/:gameId/history', auth, diceController.getDiceHistory);

module.exports = router;