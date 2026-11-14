const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/app-error');
const User = require('../models/user.model');
const Month = require('../models/month.model');
const GeneralSettings = require('../models/general-settings.model');
const SavingsSettings = require('../models/savings-settings.model');
const { calculateCycle } = require('../helpers/cycleCalculator');

const MIN_PASSWORD_LENGTH = 6;
const MAX_EMAIL_LENGTH = 100;   // user_info.email is varchar(100)
const MAX_USERNAME_LENGTH = 50; // user_info.username is varchar(50)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- input helpers (throw AppError with a status and field) ----------

// A required, non-blank string. Returns it trimmed.
const requireText = (value, label, field) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new AppError(`${label} is required`, 400, field);
    }
    return value.trim();
};

// A required, non-empty string. Passwords are never trimmed.
const requirePassword = (value, label, field) => {
    if (typeof value !== 'string' || !value) {
        throw new AppError(`${label} is required`, 400, field);
    }
    return value;
};

const requireEmail = (value) => {
    const email = requireText(value, 'Email', 'email');
    if (email.length > MAX_EMAIL_LENGTH) {
        throw new AppError(`Email must be at most ${MAX_EMAIL_LENGTH} characters`, 400, 'email');
    }
    if (!EMAIL_PATTERN.test(email)) {
        throw new AppError('Enter a valid email address', 400, 'email');
    }
    return email;
};

const requireUsername = (value) => {
    const username = requireText(value, 'Username', 'username');
    if (username.length > MAX_USERNAME_LENGTH) {
        throw new AppError(`Username must be at most ${MAX_USERNAME_LENGTH} characters`, 400, 'username');
    }
    return username;
};

class AuthService {
    // Generate JWT token
    static generateToken(payload, expiresIn = '1d') {
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

    // Validate password strength (returns a result object)
    static validatePassword(password) {
        if (!password || password.length < MIN_PASSWORD_LENGTH) {
            return {
                isValid: false,
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
            };
        }
        return { isValid: true };
    }

    // Same check, but throws a 400 that names the field
    static assertPasswordStrength(password, field) {
        const check = this.validatePassword(password);
        if (!check.isValid) {
            throw new AppError(check.message, 400, field);
        }
    }

    // User registration service
    static async register({ username, email, password } = {}) {
        // Validate everything before touching the database
        const cleanEmail = requireEmail(email);
        const cleanUsername = requireUsername(username);
        const cleanPassword = requirePassword(password, 'Password', 'password');
        this.assertPasswordStrength(cleanPassword, 'password');

        // Duplicate email (the common case)
        const existingUser = await User.findByEmail(cleanEmail);
        if (existingUser) {
            throw new AppError('User already exists', 400);
        }

        const hashedPassword = this.hashPassword(cleanPassword);

        // Create the user. Two simultaneous signups can both pass the check
        // above and then collide on the unique email index, so catch that too.
        let newUser;
        try {
            newUser = await User.create({
                username: cleanUsername,
                email: cleanEmail,
                passwordHash: hashedPassword
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY' && /key '(?:[^']*\.)?email'/i.test(error.sqlMessage || '')) {
                throw new AppError('User already exists', 400);
            }
            throw error;
        }

        // NOTE: the steps below are not in a transaction. If one fails, the
        // user row above already exists. See the note in the reply.

        // cycle_start_day is null until the user adds their first income
        await GeneralSettings.create(newUser.userId);

        // Savings settings with the same defaults shown in the frontend
        await SavingsSettings.create({
            userId: newUser.userId,
            savings_percentage: 20,
            lock_duration_months: 3,
        });

        // First month, with the default cycle (day 1 until first income sets it)
        const cycle = calculateCycle(1, new Date());
        await Month.create({
            userId: newUser.userId,
            year: cycle.record_year,
            month: cycle.record_month,
            cycle_start_date: cycle.cycle_start_date,
            cycle_end_date: cycle.cycle_end_date
        });

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
    }

    // User login service
    static async login(email, password) {
        const cleanEmail = requireText(email, 'Email', 'email');
        const cleanPassword = requirePassword(password, 'Password', 'password');

        const user = await User.findByEmail(cleanEmail);
        // Same response for "no such user" and "wrong password"
        if (!user || !this.comparePassword(cleanPassword, user.password_hash)) {
            throw new AppError('Invalid credentials', 401);
        }

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
    }

    // Change password service
    static async changePassword(userId, currentPassword, newPassword) {
        const current = requirePassword(currentPassword, 'Current password', 'currentPassword');
        const next = requirePassword(newPassword, 'New password', 'newPassword');
        this.assertPasswordStrength(next, 'newPassword');

        const user = await User.findById(userId);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (!this.comparePassword(current, user.password_hash)) {
            throw new AppError('Current password is incorrect', 400, 'currentPassword');
        }

        const passwordUpdated = await User.updatePassword(userId, this.hashPassword(next));
        if (!passwordUpdated) {
            throw new AppError('Failed to update password', 500);
        }

        return true;
    }

    // Forgot password service
    static async forgotPassword(email) {
        const cleanEmail = requireText(email, 'Email', 'email');
        const user = await User.findByEmail(cleanEmail);

        // Identical message whether or not the email exists (prevents enumeration)
        const message = 'If that email exists, a reset link has been sent';

        if (!user) {
            return { message, token: null };
        }

        // The token is for the server only (to put in an email). It must never
        // be returned to the client. The user object is deliberately not returned.
        return { message, token: this.generateResetToken(user) };
    }

    // Reset password service
    static async resetPassword(token, newPassword) {
        const cleanToken = requireText(token, 'Token', 'token');
        const next = requirePassword(newPassword, 'New password', 'newPassword');
        this.assertPasswordStrength(next, 'newPassword');

        let decoded;
        try {
            decoded = this.verifyToken(cleanToken);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AppError('Reset token has expired. Please request a new password reset.', 400, 'token');
            }
            throw new AppError('Invalid reset token. Please request a new password reset.', 400, 'token');
        }

        if (decoded.type !== 'password_reset') {
            throw new AppError('Invalid token type', 400, 'token');
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        const passwordUpdated = await User.updatePassword(user.userId, this.hashPassword(next));
        if (!passwordUpdated) {
            throw new AppError('Failed to update password', 500);
        }

        return true;
    }

    // Logout service
    static async logout(token) {
        try {
            const decoded = this.verifyToken(token);

            // Tokens are not revoked server-side. Logout only tells the client
            // to delete its token. A blacklist would go here.
            return {
                success: true,
                userId: decoded.id,
                message: 'Logout successful'
            };
        } catch (error) {
            // Invalid or expired token: the user is effectively logged out anyway
            return {
                success: true,
                message: 'Logout successful'
            };
        }
    }
}

module.exports = AuthService;