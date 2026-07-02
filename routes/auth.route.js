const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// POST /auth/signup (public)
router.post('/signup', authController.signup);

// POST /auth/login (public)
router.post('/login', authController.login);

// GET /auth/profile (protected)
router.get('/profile', authMiddleware, authController.profile);

router.post("/logout", authMiddleware, authController.logout);

router.post("/change-password", authController.changePassword);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;