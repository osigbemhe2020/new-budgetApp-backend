const express = require("express");
const app = express();
const authRoutes = require("./routes/auth.route");
const incomeRoutes = require("./routes/income.route");
const cors = require("cors");
const savingsRoutes = require("./routes/savings.route");
const expensesRoutes = require("./routes/expenses.route");
const debtRoutes = require("./routes/debt.route");

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

// health check — lets Northflank verify the service is running
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use("/auth", authRoutes);
app.use("/income", incomeRoutes);
app.use("/savings", savingsRoutes);
app.use("/expenses", expensesRoutes);
app.use("/debts", debtRoutes);

// global error handler — catches anything routes didn't handle,
// returns clean JSON instead of Express's default HTML error page
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;