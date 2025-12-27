const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { auth } = require('../middleware/auth');

// Protected routes
router.post('/create', auth, gameController.createGame);
router.get('/active', auth, gameController.getActiveGames);
router.get('/history', auth, gameController.getGameHistory);
router.get('/:gameId', auth, gameController.getGame);
router.post('/:gameId/move', auth, gameController.makeMove);

module.exports = router;