const { Pool } = require("pg");
const axios = require("axios");
const fs = require("fs");

const pool = new Pool({
  user: "myuser",
  host: "localhost",
  database: "testdb",
  password: "mypassword",
  port: 5432,
});

const STREAM_API_URL = "http://localhost:11434/api/generate";

async function generateSummariesForRun(clusterRunId) {
  try {
    console.log(`Starting summary generation for run ID: ${clusterRunId}`);

    const clusterGroups = await getClusterGroups(clusterRunId);
    if (!clusterGroups || Object.keys(clusterGroups).length === 0) {
      throw new Error(
        `No valid cluster groups found for cluster_run_id: ${clusterRunId}`
      );
    }

    console.log(`✅ Cluster groups fetched.`);

    let output = "";

    for (const [clusterId, cveList] of Object.entries(clusterGroups)) {
      console.log(`Processing cluster ${clusterId}`);

      const cveData = await getCveData(cveList);
      const prompt = constructPrompt(cveData);
      const summary = await generateSummary(prompt);

      output += `Cluster ${clusterId}\n`;
      output += `CVE List: ${cveList.join(", ")}\n`;
      output += `Summary:\n${summary}\n\n`;
    }

    console.log(`✨ All clusters processed successfully!`);

    const outputFile = `./summaries/summary_run_${clusterRunId}.txt`;
    fs.writeFileSync(outputFile, output);

    console.log(`✅ Summary saved to: ${outputFile}`);

    return { status: "completed", outputFile };
  } catch (error) {
    console.error(`❌ Background summary generation failed:`, error);
    return { status: "failed", message: error.message };
  }
}

async function getClusterGroups(clusterRunId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT data FROM cluster_data WHERE cluster_run_id = $1",
      [clusterRunId]
    );
    if (result.rows.length === 0) {
      throw new Error(`No clustering data found for run ID: ${clusterRunId}`);
    }

    const clusteringData = result.rows[0].data;

    if (!clusteringData || !clusteringData.data) {
      throw new Error(
        `Invalid clustering data structure for run ID: ${clusterRunId}`
      );
    }

    const data = clusteringData.data;
    const clusterGroups = {};

    for (const key in data) {
      if (
        [
          "count",
          "options",
          "num_clusters",
          "silhouette_score",
          "similarity_scores",
          "clusters",
        ].includes(key)
      ) {
        continue;
      }
      if (!isNaN(Number(key))) {
        const cveList = data[key];
        if (Array.isArray(cveList)) {
          clusterGroups[key] = cveList;
        }
      }
    }

    if (Object.keys(clusterGroups).length === 0) {
      throw new Error(
        `No valid cluster groups found for cluster_run_id: ${clusterRunId}`
      );
    }

    return clusterGroups;
  } finally {
    client.release();
  }
}

async function getCveData(cveIds) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cve_id, 
              data->>'name' AS name, 
              data->>'description' AS description, 
              data->>'severity' AS severity
       FROM cve_insights
       WHERE cve_id = ANY($1::text[])`,
      [cveIds]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function generateSummary(prompt) {
  try {
    const response = await axios.post(
      STREAM_API_URL,
      {
        model: "gemma3:1b",
        prompt,
        options: { num_ctx: 8192 },
      },
      {
        responseType: "stream",
      }
    );

    let summary = "";

    return new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        try {
          const jsonChunk = JSON.parse(chunk.toString());
          if (jsonChunk.response) {
            summary += jsonChunk.response;
          }
        } catch (err) {
          console.error("Failed to parse JSON chunk:", err);
        }
      });

      response.data.on("end", () => resolve(summary.trim()));
      response.data.on("error", (err) => reject(err));
    });
  } catch (error) {
    console.error("Error generating summary:", error);
    throw new Error("Failed to generate summary from Ollama API");
  }
}

function constructPrompt(cveData) {
  let prompt = "Summarize the following CVE vulnerabilities:\n\n";
  cveData.forEach((cve, index) => {
    prompt += `${index + 1}. ${cve.cve_id}: ${cve.name || "Unknown"}\n`;
    prompt += `   Description: ${
      cve.description || "No description available"
    }\n`;
    prompt += `   Severity: ${cve.severity || "Unknown"}\n\n`;
  });
  prompt += "Provide a concise summary highlighting common themes or patterns.";
  return prompt;
}

module.exports = { generateSummariesForRun };
