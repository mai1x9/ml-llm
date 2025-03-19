const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { generateEmbedding } = require("./embeddingService");

const JSON_FILE_PATH = path.join(__dirname, "../data/job-4.json");

async function ingestData() {
  try {
    console.log("Reading JSON file...");
    const rawData = fs.readFileSync(JSON_FILE_PATH);
    const jsonData = JSON.parse(rawData);

    const entries = jsonData.results || []; // Fallback to empty array if 'results' is missing

    const client = await pool.connect();

    // Drop and recreate the table with appropriate schema
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
      if (cves.length === 0) continue; // Skip entries without CVE IDs
      const cveId = cves[0]; // Use the first CVE ID

      // Convert JSON to plain text for embedding
      // Include all fields to maximize semantic coverage
      const textToEmbed = [
        `CVE: ${cves.join(", ") || "N/A"}`, // Join multiple CVEs if present
        `Name: ${entry.name || "N/A"}`,
        `Description: ${entry.description || "N/A"}`,
        `Severity: ${entry.severity || "N/A"}`,
        `CVSS: ${entry.cvss || "N/A"}`,
        `Threat: ${entry.threat || "N/A"}`,
        `Mitigation: ${entry.mitigation || "N/A"}`,
        `Product: ${entry.product || "N/A"}`,
        `Version: ${entry.version || "N/A"}`,
        `CWE: ${(entry.cwe || []).join(", ") || "N/A"}`, // Join multiple CWEs if present
      ].join("\n"); // Newline separator for readability

      try {
        // Generate embedding from plain text
        const embedding = await generateEmbedding(textToEmbed);

        if (!embedding || !Array.isArray(embedding)) {
          console.error(`Invalid embedding for ${cveId}:`, embedding);
          continue;
        }

        // Convert embedding array to PostgreSQL VECTOR format
        const vectorString = `[${embedding.join(",")}]`;

        // Insert into database: CVE ID, original JSON, and embedding
        await client.query(
          `INSERT INTO cve_data (cve_id, data, embedding) VALUES ($1, $2, $3)`,
          [cveId, entry, vectorString]
        );

        totalInserted++;
        console.log(`Inserted ${cveId} (Total: ${totalInserted})`);
      } catch (err) {
        console.error(`Embedding failed for ${cveId}:`, err.message);
      }
    }

    console.log(
      `Successfully inserted ${totalInserted} CVEs into the database.`
    );
    client.release();
  } catch (err) {
    console.error("Error in data ingestion:", err);
  } finally {
    await pool.end(); // Ensure the pool is closed
  }
}

ingestData();
