// config/config.js
const path = require("path");

module.exports = {
  STREAM_API_URL: "http://localhost:11434/api/generate",
  MAX_TOKENS: 8192,
  CHUNK_TOKEN_LIMIT: 7500, // Buffer to avoid exceeding 8192
  MODEL_NAME: "gemma3:1b",

  // File paths (Updated to absolute paths)
  CVE_DATA_FILE:
    "/home/ubuntu/ml-llm/server/data/5b6dee25-f03f-410c-8d0f-59cc19707b69__job-0.json",
  CLUSTERING_DATA_FILE:
    "/home/ubuntu/ml-llm/server/data/clustering-ml-output-5b6dee25-f03f-410c-8d0f-59cc19707b69__job-0.json",

  SUMMARY_OUTPUT_DIR: path.join(__dirname, "..", "summaries"),

  // Excluded keys from clustering data
  EXCLUDED_CLUSTER_KEYS: [
    "count",
    "options",
    "num_clusters",
    "silhouette_score",
    "similarity_scores",
    "clusters",
  ],
};
