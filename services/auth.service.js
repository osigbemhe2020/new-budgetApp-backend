const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Month = require('../models/month.model');
const GeneralSettings = require('../models/general-settings.model');
const SavingsSettings = require('../models/savings-settings.model');


class AuthService {
    // Generate JWT token
    static generateToken(payload, expiresIn = '7d') {
        return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
    }

    // Verify JWT token
    static verifyToken(token) {
        return jwt.verify(token, process.env.JWT_SECRET);
    }

    // Hash password
    static hashPassword(password, saltRounds = 10) {
        return bcrypt.hashSync(password, saltRounds);
    }

    // Compare password
    static comparePassword(password, hash) {
        return bcrypt.compareSync(password, hash);
    }

    // Generate password reset token
    static generateResetToken(user) {
        return jwt.sign(
            { 
                id: user.userId, 
                email: user.email,
                type: 'password_reset'
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
    }

    // Validate password strength
    static validatePassword(password) {
        if (!password || password.length < 6) {
            return {
                isValid: false,
                message: "Password must be at least 6 characters long"
            };
        }
        return { isValid: true };
    }

    // User registration service
    static async register({ username, email, password } = {}) {
        try {
            if (!email) throw new Error("Email is required");
            if (!username) throw new Error("Username is required");
            if (!password) throw new Error("Password is required");

            // check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) throw new Error("User already exists");

            // validate password
            const passwordValidation = this.validatePassword(password);
            if (!passwordValidation.isValid) throw new Error(passwordValidation.message);

            // hash password
            const hashedPassword = this.hashPassword(password);

            // create user
            const newUser = await User.create({
                username,
                email,
                passwordHash: hashedPassword
            });

            // cycle_start_day is null until user adds their first income
            await GeneralSettings.create(newUser.userId);

            // Create savings settings with the same defaults shown in the frontend.
            await SavingsSettings.create({
                userId: newUser.userId,
                savings_percentage: 20,
                lock_duration_months: 3,
            });

            // create first month with default cycle (day 1 until first income sets it)
            const now = new Date();
            const { calculateCycle } = require('../helpers/cycleCalculator');
            const cycle = calculateCycle(1, now); // default cycle_start_day = 1

            await Month.create({
                userId: newUser.userId,
                year: cycle.record_year,
                month: cycle.record_month,
                cycle_start_date: cycle.cycle_start_date,
                cycle_end_date: cycle.cycle_end_date
            });

            // generate token
            const token = this.generateToken({
                id: newUser.userId,
                email: newUser.email
            });

            return {
                user: {
                    userId: newUser.userId,
                    username: newUser.username,
                    email: newUser.email
                },
                token
            };

        } catch (error) {
            throw error;
        }
    }

    // User login service
    static async login(email, password) {
        try {
            // Find user by email
            const user = await User.findByEmail(email);
            if (!user) {
                throw new Error("Invalid credentials");
            }

            // Verify password
            const isPasswordValid = this.comparePassword(password, user.password_hash);
            if (!isPasswordValid) {
                throw new Error("Invalid credentials");
            }

            // Generate token
            const token = this.generateToken({
                id: user.userId, 
                email: user.email
            });

            return {
                user: {
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at
                },
                token
            };

        } catch (error) {
            throw error;
        }
    }

    // Change password service
    static async changePassword(userId, currentPassword, newPassword) {
        try {
            // Validate new password
            const passwordValidation = this.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(passwordValidation.message);
            }

            // Find user
            const user = await User.findById(userId);
            if (!user) {
                throw new Error("User not found");
            }

            // Verify current password
            const isCurrentPasswordValid = this.comparePassword(currentPassword, user.password_hash);
            if (!isCurrentPasswordValid) {
                throw new Error("Current password is incorrect");
            }

            // Hash new password
            const hashedNewPassword = this.hashPassword(newPassword);

            // Update password
            const passwordUpdated = await User.updatePassword(userId, hashedNewPassword);
            if (!passwordUpdated) {
                throw new Error("Failed to update password");
            }

            return true;

        } catch (error) {
            throw error;
        }
    }

    // Forgot password service
    static async forgotPassword(email) {
        try {
            const user = await User.findByEmail(email);

            // Always return success message to prevent email enumeration attacks
            if (!user) {
                return {
                    success: true,
                    message: "If that email exists, a reset link has been sent",
                    token: null
                };
            }

            // Generate reset token
            const resetToken = this.generateResetToken(user);

            return {
                success: true,
                message: "If that email exists, a reset link has been sent",
                token: resetToken,
                user: user
            };

        } catch (error) {
            throw error;
        }
    }

    // Reset password service
    static async resetPassword(token, newPassword) {
        try {
            // Validate new password
            const passwordValidation = this.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                throw new Error(passwordValidation.message);
            }

            // Verify the reset token
            const decoded = this.verifyToken(token);
            
            // Check if this is a password reset token
            if (decoded.type !== 'password_reset') {
                throw new Error("Invalid token type");
            }

            // Find user
            const user = await User.findById(decoded.id);
            if (!user) {
                throw new Error("User not found");
            }

            // Hash new password
            const hashedNewPassword = this.hashPassword(newPassword);

            // Update password
            const passwordUpdated = await User.updatePassword(user.userId, hashedNewPassword);
            if (!passwordUpdated) {
                throw new Error("Failed to update password");
            }

            return true;

        } catch (error) {
            throw error;
        }
    }

    // Logout service
    static async logout(token) {
        try {
            // Verify token to get user info for logging
            const decoded = this.verifyToken(token);
            
            // In production, you would add token to blacklist here
            // For now, just return success for client-side token deletion
            
            return {
                success: true,
                userId: decoded.id,
                message: "Logout successful"
            };

        } catch (error) {
            // Even if token is invalid/expired, return success
            // since user is effectively logged out
            return {
                success: true,
                message: "Logout successful"
            };
        }
    }
}

module.exports = AuthService;
