const AuthService = require("../services/auth.service");
const User = require("../models/user.model");

const signup = async (req, res) => {
    try {
        const result = await AuthService.register(req.body);
        
        res.status(201).json({ 
            message: "User added successfully",
            user: result.user,
            token: result.token,
            monthMessage: result.monthMessage
        });
    } catch (error) {
        console.error('Signup error:', error);
        
        if (error.message === "User already exists") {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({ message: "Internal server error" });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await AuthService.login(email, password);
        
        res.status(200).json({
            message: "Login successful",
            user: result.user,
            token: result.token
        });
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.message === "Invalid credentials") {
            return res.status(401).json({ message: error.message });
        }
        
        res.status(500).json({ message: "Internal server error" });
    }
};

const profile = async (req, res) => {
    try {
        // Get user ID from the JWT token (set by auth middleware)
        const userId = req.user.id;
        
        // Find user in database
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        // Return user data (excluding password hash)
        res.status(200).json({
            message: "Profile retrieved successfully",
            user: {
                UserID: user.UserID,
                FullName: user.FullName,
                Email: user.Email,
                created_at: user.created_at
            }
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        
        await AuthService.changePassword(userId, currentPassword, newPassword);
        
        res.status(200).json({
            status: "success",
            message: "Password changed successfully"
        });
    } catch (error) {
        console.error('Change password error:', error);
        
        if (error.message === "User not found") {
            return res.status(404).json({
                status: "failed",
                message: error.message
            });
        }
        
        if (error.message === "Current password is incorrect" || 
            error.message === "Password must be at least 6 characters long" ||
            error.message === "Failed to update password") {
            return res.status(400).json({
                status: "failed",
                message: error.message
            });
        }
        
        res.status(500).json({
            status: "failed",
            message: "Internal server error"
        });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                status: "failed",
                message: "Email is required"
            });
        }

        const result = await AuthService.forgotPassword(email);

        // In a real application, you would send an email here
        if (result.token) {
            console.log('Password reset token:', result.token);
            console.log('Reset link would be: `http://yourdomain.com/reset-password?token=${result.token}`');
        }

        res.status(200).json({
            status: "success",
            message: result.message,
            // Remove this in production - only for development
            debug: result.token ? {
                token: result.token,
                resetLink: `http://localhost:3000/reset-password?token=${result.token}`
            } : undefined
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            status: "failed",
            message: "Internal server error"
        });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                status: "failed",
                message: "Token and password are required"
            });
        }

        await AuthService.resetPassword(token, newPassword);

        res.status(200).json({
            status: "success",
            message: "Password reset successfully. You can now login with your new password."
        });

    } catch (error) {
        console.error('Reset password error:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                status: "failed",
                message: "Reset token has expired. Please request a new password reset."
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                status: "failed",
                message: "Invalid reset token. Please request a new password reset."
            });
        }
        
        if (error.message === "User not found" || 
            error.message === "Invalid token type" ||
            error.message === "Password must be at least 6 characters long" ||
            error.message === "Failed to update password") {
            return res.status(400).json({
                status: "failed",
                message: error.message
            });
        }
        
        res.status(500).json({
            status: "failed",
            message: "Internal server error"
        });
    }
};

const logout = async (req, res) => {
    try {
        // Get the token from the Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;

        if (!token) {
            return res.status(400).json({
                status: "failed",
                message: "No token provided"
            });
        }

        const result = await AuthService.logout(token);
        
        if (result.userId) {
            console.log(`User ${result.userId} logged out at ${new Date().toISOString()}`);
        }
        
        res.status(200).json({
            status: "success",
            message: "Logout successful. Please delete the token from your client storage."
        });

    } catch (error) {
        console.log('Logout attempt with invalid/expired token:', error.message);
        
        res.status(200).json({
            status: "success", 
            message: "Logout successful. Please delete the token from your client storage."
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