const fs = require("fs").promises; // Use promises for async file operations
const pool = require("./config/db");
const { generateEmbedding } = require("./services/embeddingService");

// Helper function to compute dot product
const dotProduct = (a, b) => {
  return a.reduce((sum, val, idx) => sum + val * b[idx], 0);
};

// MMR computation function
const computeMMR = (entries, K = 20, lambda = 0.3) => {
  if (entries.length === 0) return [];
  const selected = [entries[0]]; // Start with the most relevant entry
  const unselected = entries.slice(1);

  while (selected.length < K && unselected.length > 0) {
    let maxScore = -Infinity;
    let bestIdx = -1;

    for (let i = 0; i < unselected.length; i++) {
      const entry = unselected[i];
      let minDistanceToSelected = Infinity;
      for (const sel of selected) {
        const dist = 1 - dotProduct(entry.embedding, sel.embedding);
        minDistanceToSelected = Math.min(minDistanceToSelected, dist);
      }
      const relevance = 1 - entry.distance; // Similarity = 1 - distance
      const diversity = minDistanceToSelected;
      const score = lambda * relevance + (1 - lambda) * diversity;
      if (score > maxScore) {
        maxScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      selected.push(unselected.splice(bestIdx, 1)[0]);
    } else {
      break;
    }
  }

  return selected;
};

// Generate prompt with just query and data, save to files
const generateAndSavePrompts = async (question) => {
  const client = await pool.connect();
  try {
    const queryEmbeddings = await generateEmbedding(question);
    const queryEmbedding = queryEmbeddings[0];

    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Embedding output is not a valid array");
    }

    const formattedEmbedding = JSON.stringify(queryEmbedding);
    const sql = `
      SELECT cve_id, data, embedding, (embedding <=> $1) AS distance
      FROM cve_data
      ORDER BY distance ASC
      LIMIT 100;
    `;
    const result = await client.query(sql, [formattedEmbedding]);
    let entries = result.rows.map((row) => ({
      cve_id: row.cve_id,
      data: row.data,
      embedding: JSON.parse(row.embedding), // Parse vector string '[1,2,3]'
      distance: row.distance,
    }));

    // Without MMR: Top 20 most relevant entries
    const entriesWithoutMMR = entries.slice(0, 20);
    const contextWithoutMMR =
      entriesWithoutMMR
        .map((entry) => {
          const d = entry.data;
          return [
            `CVE: ${entry.cve_id}`,
            `Name: ${d.name || "N/A"}`,
            `Description: ${d.description || "N/A"}`,
            `Severity: ${d.severity || "N/A"}`,
            `CVSS: ${d.cvss || "N/A"}`,
            `Threat: ${d.threat || "N/A"}`,
            `Mitigation: ${d.mitigation || "N/A"}`,
            `Product: ${d.product || "N/A"}`,
            `Version: ${d.version || "N/A"}`,
            `CWE: ${(d.cwe || []).join(", ") || "N/A"}`,
          ].join("\n");
        })
        .join("\n\n---\n\n") || "No relevant CVEs found.";
    const promptWithoutMMR = `${question}\n\nCVE data:\n${contextWithoutMMR}`;

    // With MMR: 20 diverse entries
    const entriesWithMMR = computeMMR(entries, 20, 0.5);
    const contextWithMMR =
      entriesWithMMR
        .map((entry) => {
          const d = entry.data;
          return [
            `CVE: ${entry.cve_id}`,
            `Name: ${d.name || "N/A"}`,
            `Description: ${d.description || "N/A"}`,
            `Severity: ${d.severity || "N/A"}`,
            `CVSS: ${d.cvss || "N/A"}`,
            `Threat: ${d.threat || "N/A"}`,
            `Mitigation: ${d.mitigation || "N/A"}`,
            `Product: ${d.product || "N/A"}`,
            `Version: ${d.version || "N/A"}`,
            `CWE: ${(d.cwe || []).join(", ") || "N/A"}`,
          ].join("\n");
        })
        .join("\n\n---\n\n") || "No relevant CVEs found.";
    const promptWithMMR = `${question}\n\nCVE data:\n${contextWithMMR}`;

    // Save prompts to files
    await fs.writeFile("prompt_without_mmr1.txt", promptWithoutMMR, "utf8");
    await fs.writeFile("prompt_with_mmr1.txt", promptWithMMR, "utf8");

    console.log(
      "Prompts saved to 'prompt_without_mmr.txt' and 'prompt_with_mmr.txt'"
    );

    return { promptWithoutMMR, promptWithMMR };
  } catch (error) {
    console.error("Error in generateAndSavePrompts:", error);
    throw new Error("Prompt generation error: " + error.message);
  } finally {
    client.release();
  }
};

module.exports = { generateAndSavePrompts };
