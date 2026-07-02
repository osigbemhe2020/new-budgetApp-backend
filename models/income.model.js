const pool = require('../config/db');

class Income {
    // Get all incomes
  static async getAll() {
    const [rows] = await pool.execute('SELECT * FROM income_table');
    return rows;
  }
  
  // Create a new income
  static async create({ UserID, name, amount, date, monthId }) {
    const [result] = await pool.execute(
      'INSERT INTO income_sources (userId, source_name, amount, created_at, monthId) VALUES (?, ?, ?, ?, ?)',
      [UserID, name, amount, date, monthId]
    );
    return { id: result.insertId, UserID, name, amount, date, monthId };
  }

 static async findById(id) {
    const [rows] = await pool.execute(
        'SELECT * FROM income_sources WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

  // Find income by monthId
  static async findByMonthId(monthId) {
    const [rows] = await pool.execute(
      'SELECT * FROM income_sources WHERE monthId = ?',
      [monthId]
    );
    return rows;
  }

  // Find income by UserID
  static async findByUserID(UserID) {
    const [rows] = await pool.execute(
      'SELECT * FROM income_sources WHERE userId = ?',
      [UserID]
    );
    return rows;
  }

  // Update income
  // static async update(id, { name, amount, date }) {
  //   const [result] = await pool.execute(
  //     'UPDATE income_sources SET source_name = ?, amount = ?, created_at = ? WHERE id = ?',
  //     [name, amount, date, id]
  //   );
  //   return result.affectedRows > 0;
  // }

static async update(id, { name, amount }) {
    const [result] = await pool.execute(
        `UPDATE income_sources SET source_name = ?, amount = ? WHERE id = ?`,
        [name, amount, id]
    );
    return result.affectedRows > 0;
}

  // Delete income
  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM income_sources WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Income;