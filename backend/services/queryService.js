const pool = require("../config/db");
const { generateEmbedding } = require("./embeddingService");

const fetchSimilarEntries = async (question) => {
  const client = await pool.connect();
  try {
    // Generate the embedding for the query
    const queryEmbeddings = await generateEmbedding(question);
    const queryEmbedding = queryEmbeddings[0]; // Extract the first embedding array

    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Embedding output is not a valid array");
    }

    // Ensure all values in the array are floats (avoid string conversion issues)
    const formattedEmbedding = JSON.stringify(queryEmbedding);

    const sql = `
      SELECT cve_id, data, embedding <=> $1 AS similarity
      FROM cve_data
      ORDER BY similarity ASC
      LIMIT 20;
    `;

    const result = await client.query(sql, [formattedEmbedding]); // Pass embedding array
    return result.rows;
  } catch (error) {
    console.error("Error in fetchSimilarEntries:", error);
    throw new Error("Database query error: " + error.message);
  } finally {
    client.release();
  }
};

module.exports = { fetchSimilarEntries };
