require("dotenv").config();
const pool = require("./config/db");
const app = require("./app");
const PORT = process.env.PORT || 3000;
//const { startSavingsLockJob, startSavingsUnlockJob } = require('./cronjobs/savingsLock');

// start cron jobs
//startSavingsLockJob();
//startSavingsUnlockJob();

async function checkDatabaseHealth() {
    try {
        await pool.query('SELECT 1');
        return { status: 'healthy', timestamp: new Date() };
    } catch (error) {
        return { 
            status: 'unhealthy', 
            error: error.message,
            timestamp: new Date() 
        };
    }
}

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Initial check on startup
  try {
    const health = await checkDatabaseHealth();
    if (health.status === 'healthy') {
      console.log('Database connection established successfully');
    } else {
      console.error('Failed to connect to database:', health.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Database check failed:', error.message);
  }
})