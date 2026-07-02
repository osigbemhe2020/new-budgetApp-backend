const express = require("express");
const app = express();
const authRoutes = require("./routes/auth.route");
const incomeRoutes = require("./routes/income.route");
const cors = require("cors");
//const monthsRoutes = require("./routes/months.route");
const savingsRoutes = require("./routes/savings.route");
const expensesRoutes = require("./routes/expenses.route");
const debtRoutes = require("./routes/debt.route");

const secretKey = process.env.JWT_SECRET; // Replace with your own secret key

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Replace with your frontend URL
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

app.use("/auth",  authRoutes);
//app.use("/months", monthsRoutes);
app.use("/income", incomeRoutes);
app.use("/savings", savingsRoutes);
app.use("/expenses", expensesRoutes);
app.use("/debts", debtRoutes);

module.exports = app;