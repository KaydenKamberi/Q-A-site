const mysql = require("mysql2/promise");

const requiredConfig = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];

let pool;

function missingConfig() {
  return requiredConfig.filter((key) => !process.env[key]);
}

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

async function checkDatabaseConnection() {
  const missing = missingConfig();

  if (missing.length > 0) {
    const message = `Missing database configuration: ${missing.join(", ")}`;
    console.error(`MySQL startup check skipped. ${message}`);
    return { ok: false, message };
  }

  pool = createPool();

  try {
    const connection = await pool.getConnection();
    await connection.query("SELECT 1");
    connection.release();
    console.log("Connected to MySQL");
    return {
      ok: true,
      message: "Connected successfully with SELECT 1."
    };
  } catch (error) {
    console.error(
      `MySQL connection failed: ${error.code || "UNKNOWN_DATABASE_ERROR"}`
    );
    return {
      ok: false,
      message: `MySQL connection failed (${error.code || "unknown error"}).`
    };
  }
}

function getPool() {
  if (!pool) {
    throw new Error("The MySQL pool is not ready. Check the startup logs.");
  }

  return pool;
}

module.exports = {
  getPool,
  checkDatabaseConnection
};