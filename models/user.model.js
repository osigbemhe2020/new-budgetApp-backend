const pool = require('../config/db');

class User {
  // Create a new user
  static async create({ name, email, password }) {
    const [result] = await pool.execute(
      'INSERT INTO user_info (username, email, password_hash) VALUES (?, ?, ?)',
      [name, email, password]
    );
    return { UserID: result.insertId, FullName: name, Email: email };
  }

  // Find user by ID
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT userId, username, email, password_hash, created_at FROM user_info WHERE userId = ?',
      [id]
    );
    if (!rows[0]) {
      return null;
    }
    const row = rows[0];
    return {
      UserID: row.userId || row.UserID,
      FullName: row.username || row.FullName,
      Email: row.email || row.Email,
      password_hash: row.password_hash,
      created_at: row.created_at
    };
  }

  // Find user by email
  static async findByEmail(email) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_info WHERE email = ?',
      [email]
    );
    if (!rows[0]) {
      return null;
    }
    const row = rows[0];
    return {
      UserID: row.userId || row.UserID,
      FullName: row.username || row.FullName,
      Email: row.email || row.Email,
      password_hash: row.password_hash,
      created_at: row.created_at
    };
  }

  // Get all user_info
  static async findAll() {
    const [rows] = await pool.execute(
      'SELECT UserID, FullName, Email, created_at FROM user_info'
    );
    return rows;
  }

  // Update a user
  static async update(id, { name, email }) {
    await pool.execute(
      'UPDATE user_info SET FullName = ?, Email = ? WHERE UserID = ?',
      [name, email, id]
    );
    return this.findById(id);
  }

  // Update user password
  static async updatePassword(id, passwordHash) {
    const [result] = await pool.execute(
      'UPDATE user_info SET password_hash = ? WHERE userId = ?',
      [passwordHash, id]
    );
    return result.affectedRows > 0;
  }

  // Delete a user
  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_info WHERE userId = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = User;