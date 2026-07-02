const mysql = require("mysql2/promise");
require("dotenv").config();

// Use a pool for better performance in web apps
const pool = mysql.createPool({
  host: process.env.mysqlHost,
  user: process.env.mysqlUser,
  password: process.env.mysqlPassword,
  database: process.env.mysqlDatabase,
  port: process.env.mysqlPort,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
