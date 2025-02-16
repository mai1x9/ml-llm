const { Pool } = require("pg");

const pool = new Pool({
  user: "myuser", // Your PostgreSQL username
  host: "localhost", // Your PostgreSQL host (e.g., localhost)
  database: "testdb", // Your PostgreSQL database name
  password: "mypassword", // Your PostgreSQL password
  port: 5432, // Your PostgreSQL port (e.g., 5432)
});

// Ensure the pgvector extension is available
(async () => {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
  } catch (err) {
    console.error("Error creating vector extension:", err);
  } finally {
    client.release();
  }
})();

module.exports = pool;
