// services/embeddingService.js
const axios = require("axios");
const EMBEDDING_API_URL = "http://localhost:11434/api/embed";

/**
 * Generate embeddings for the given input.
 * @param {string|Array<string>} inputData - A single text input (or array of inputs).
 * @param {string} model - Embedding model to use (default is 'nomic-embed-text').
 * @returns {Promise<Array>} - Array of embeddings.
 */
const generateEmbedding = async (inputData, model = "nomic-embed-text") => {
  try {
    // Ensure inputData is an array of strings
    const formattedInput = Array.isArray(inputData)
      ? inputData
      : [String(inputData)];
    console.log(
      "🔹 Sending request:",
      JSON.stringify({ model, input: formattedInput }, null, 2)
    );

    const { data } = await axios.post(EMBEDDING_API_URL, {
      model,
      input: formattedInput,
    });

    console.log(" Embeddings received:", data);
    return data.embeddings;
  } catch (error) {
    console.error(
      " Embedding API error:",
      error.response?.data || error.message
    );
    throw new Error(
      "Error generating embeddings: " +
        (error.response?.data?.error || error.message)
    );
  }
};

module.exports = { generateEmbedding };
