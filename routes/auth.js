const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.get('/users', authController.getAllUsers);

// Protected routes
router.get('/stats', auth, authController.getUserStats);

module.exports = router;