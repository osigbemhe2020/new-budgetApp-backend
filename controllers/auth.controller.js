const AuthService = require('../services/auth.service');
const AppError = require('../utils/app-error');
const User = require('../models/user.model');

// One place that turns any error into a response.
//  - AppError  -> its own status, message and (optional) field
//  - anything else -> logged, then a generic 500
// Signup/login keep the { message } shape. The password routes keep the
// { status: "failed", message } shape (withStatus = true).
const sendError = (res, error, label, { withStatus = false } = {}) => {
    const isAppError = error instanceof AppError;
    const status = isAppError ? error.status : 500;

    if (status >= 500) {
        console.error(`${label} error:`, error);
    }

    const body = {};
    if (withStatus) body.status = 'failed';
    body.message = isAppError ? error.message : 'Internal server error';
    if (isAppError && error.field) body.field = error.field;

    return res.status(status).json(body);
};

const signup = async (req, res) => {
    try {
        const { email, username, password } = req.body || {};
        const result = await AuthService.register({ email, username, password });

        return res.status(201).json({
            message: 'User added successfully',
            user: result.user,
            token: result.token
        });
    } catch (error) {
        return sendError(res, error, 'Signup');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const result = await AuthService.login(email, password);

        return res.status(200).json({
            message: 'Login successful',
            user: result.user,
            token: result.token
        });
    } catch (error) {
        return sendError(res, error, 'Login');
    }
};

const profile = async (req, res) => {
    try {
        // User id comes from the JWT (set by the auth middleware)
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Password hash is deliberately left out
        return res.status(200).json({
            message: 'Profile retrieved successfully',
            user: {
                userId: user.userId,
                username: user.username,
                email: user.email,
                created_at: user.created_at
            }
        });
    } catch (error) {
        return sendError(res, error, 'Profile');
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        await AuthService.changePassword(req.user.id, currentPassword, newPassword);

        return res.status(200).json({
            status: 'success',
            message: 'Password changed successfully'
        });
    } catch (error) {
        return sendError(res, error, 'Change password', { withStatus: true });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body || {};
        const result = await AuthService.forgotPassword(email);

        // TODO: send result.token to the user by email once a mail provider is set up.
        // The token must never appear in the response. For local testing only,
        // it can be printed when LOG_RESET_TOKEN=true. Never set that on Northflank.
        if (result.token && process.env.LOG_RESET_TOKEN === 'true') {
            console.log('Password reset token (dev only):', result.token);
        }

        return res.status(200).json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        return sendError(res, error, 'Forgot password', { withStatus: true });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body || {};
        await AuthService.resetPassword(token, newPassword);

        return res.status(200).json({
            status: 'success',
            message: 'Password reset successfully. You can now login with your new password.'
        });
    } catch (error) {
        return sendError(res, error, 'Reset password', { withStatus: true });
    }
};

const logout = async (req, res) => {
    try {
        // Accept "Bearer <jwt>" or a bare token in the Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : authHeader;

        if (!token) {
            return res.status(400).json({
                status: 'failed',
                message: 'No token provided'
            });
        }

        const result = await AuthService.logout(token);

        if (result.userId) {
            console.log(`User ${result.userId} logged out at ${new Date().toISOString()}`);
        }

        return res.status(200).json({
            status: 'success',
            message: 'Logout successful. Please delete the token from your client storage.'
        });
    } catch (error) {
        console.log('Logout attempt with invalid/expired token:', error.message);

        return res.status(200).json({
            status: 'success',
            message: 'Logout successful. Please delete the token from your client storage.'
        });
    }
};

module.exports = {
    signup,
    login,
    profile,
    changePassword,
    forgotPassword,
    resetPassword,
    logout
};