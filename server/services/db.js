const { Pool } = require("pg");
const fs = require("fs").promises;

// Database connection configuration
const pool = new Pool({
  user: "myuser", // Your PostgreSQL username
  host: "localhost", // Your PostgreSQL host
  database: "testdb", // Your PostgreSQL database name
  password: "mypassword", // Your PostgreSQL password
  port: 5432, // Your PostgreSQL port
});

// Function to drop and create tables
async function resetTables() {
  const client = await pool.connect();
  try {
    // Drop existing tables
    await client.query(`
      DROP TABLE IF EXISTS cve_insights;
      DROP TABLE IF EXISTS cluster_data;
    `);

    // Create tables with full JSONB storage
    await client.query(`
      CREATE TABLE cve_insights (
        cve_id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      );

      CREATE TABLE cluster_data (
        cluster_run_id SERIAL PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
    console.log("Tables dropped and recreated successfully");
  } catch (err) {
    console.error("Error resetting tables:", err);
    throw err; // Ensure we stop if table creation fails
  } finally {
    client.release();
  }
}

// Function to insert data
async function insertData() {
  const client = await pool.connect();
  try {
    // Load JSON files
    const cveJson = JSON.parse(
      await fs.readFile(
        "/home/ubuntu/ml-llm/server/data/5b6dee25-f03f-410c-8d0f-59cc19707b69__job-0.json",
        "utf8"
      )
    );
    const clusteringJson = JSON.parse(
      await fs.readFile(
        "/home/ubuntu/ml-llm/server/data/clustering-ml-output-5b6dee25-f03f-410c-8d0f-59cc19707b69__job-0.json",
        "utf8"
      )
    );

    // Insert CVE data into cve_insights
    const cveData = cveJson.results || [];
    console.log(`Inserting ${cveData.length} CVEs into cve_insights`);
    for (const cve of cveData) {
      const cveId = Array.isArray(cve.cve) ? cve.cve[0] : cve.cve;
      if (!cveId) {
        console.error("Missing cve_id in entry:", cve);
        throw new Error("cve_id is required for cve_insights");
      }
      await client.query(
        `
        INSERT INTO cve_insights (cve_id, data)
        VALUES ($1, $2)
        ON CONFLICT (cve_id) DO NOTHING;
      `,
        [cveId, JSON.stringify(cve)]
      );
    }

    // Insert clustering data into cluster_data
    console.log("Inserting clustering data into cluster_data");
    const clusterResult = await client.query(
      `
      INSERT INTO cluster_data (data)
      VALUES ($1)
      RETURNING cluster_run_id;
    `,
      [JSON.stringify(clusteringJson)]
    );
    console.log(
      `Inserted clustering data with cluster_run_id: ${clusterResult.rows[0].cluster_run_id}`
    );

    console.log(
      "Data inserted successfully into cve_insights and cluster_data"
    );
  } catch (err) {
    console.error("Error inserting data:", err);
  } finally {
    client.release();
  }
}

// Run the script
async function main() {
  await resetTables(); // Drop and recreate tables
  await insertData();
  await pool.end();
}

main().catch((err) => console.error("Main error:", err));
