const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { generateEmbedding } = require("./embeddingService");

const JSON_FILE_PATH = path.join(__dirname, "../data/job-1.json");

async function ingestData() {
  try {
    console.log("Reading JSON file...");
    const rawData = fs.readFileSync(JSON_FILE_PATH);
    const jsonData = JSON.parse(rawData);

    const entries = jsonData.results || []; // Prevents crash if 'results' key is missing

    const client = await pool.connect();

    // Drop the existing table if it exists and create a new one
    await client.query(`
      DROP TABLE IF EXISTS cve_data;
      CREATE TABLE cve_data (
          id SERIAL PRIMARY KEY,
          cve_id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          embedding VECTOR(768) NOT NULL
      );
    `);

    console.log("Processing entries...");
    let totalInserted = 0;

    for (const entry of entries) {
      const cves = entry.cve || [];
      if (cves.length === 0) continue;
      const cveId = cves[0];

      const textToEmbed = `CVE: ${cveId}\nName: ${
        entry.name || ""
      }\nDescription: ${entry.description || ""}\nCVSS: ${
        entry.cvss || "N/A"
      }\nProduct: ${entry.product || ""}`;

      try {
        const embedding = await generateEmbedding(textToEmbed);

        if (!embedding || !Array.isArray(embedding)) {
          console.error(`Invalid embedding for ${cveId}:`, embedding);
          continue;
        }

        // Fix: Convert array to PostgreSQL-compatible VECTOR format (space-separated)
        const vectorString = `[${embedding.join(",")}]`;

        await client.query(
          `INSERT INTO cve_data (cve_id, data, embedding) VALUES ($1, $2, $3)`,
          [cveId, entry, vectorString]
        );

        totalInserted++;
      } catch (err) {
        console.error(`Embedding failed for ${cveId}:`, err.message);
      }
    }

    console.log(`Inserted ${totalInserted} CVEs into the database.`);
    client.release();
  } catch (err) {
    console.error("Error in data ingestion:", err);
  }
}

ingestData();
