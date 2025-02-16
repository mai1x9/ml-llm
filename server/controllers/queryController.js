// controllers/queryController.js
const { fetchSimilarCVEs } = require("../services/queryService");
const axios = require("axios");

const STREAM_API_URL = "http://localhost:11434/api/generate"; // LLM generation endpoint

// Endpoint: Return full LLM response as JSON

exports.getQueryResponse = async (req, res) => {
  try {
    console.log("🔹 Request Body:", req.body);

    const { question } = req.body;
    if (!question) {
      console.error(" Missing 'question' field in request body.");
      return res
        .status(400)
        .json({ error: "Missing 'question' field in request body." });
    }

    console.log("🔹 Received Question:", question);

    const similarCVEs = await fetchSimilarCVEs(question);
    let context = similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n");

    const prompt = `You are a cybersecurity expert. Answer this query: ${question}\nUsing CVE data:\n${context}`;

    console.log("🔹 Sending Prompt to LLM:", prompt);

    const response = await axios({
      method: "POST",
      url: "http://localhost:11434/api/generate",
      data: { model: "deepseek-r1:1.5b", prompt },
      responseType: "stream", // <--- Handle streaming response
    });

    res.setHeader("Content-Type", "text/plain"); // Ensure plain text response
    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        if (json.response) {
          res.write(json.response); // Send only the response text
        }
      } catch (err) {
        console.error("Error parsing chunk:", err);
      }
    });

    response.data.on("end", () => {
      res.end();
    });
  } catch (error) {
    console.error(" Error in getQueryResponse:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.aiHistory = async (req, res) => {};

// Endpoint: Stream the LLM response word by word
exports.streamResponse = async (req, res) => {
  try {
    const { query } = req.body;
    const similarCVEs = await fetchSimilarCVEs(query);
    if (!similarCVEs.length) {
      return res.json({ message: "No relevant CVEs found." });
    }

    let context = similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n");

    const prompt = `You are a cybersecurity expert. Answer this query: ${query}\nUsing CVE data:\n${context}`;

    console.log("🔹 Sending prompt to LLM:", prompt);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    // Request the LLM API in streaming mode
    const response = await axios.post(
      STREAM_API_URL,
      { model: "deepseek-r1:1.5b", prompt },
      { responseType: "stream" }
    );

    console.log(" Streaming response started...");
    response.data.pipe(res); // Send streaming data to the client
  } catch (error) {
    console.error(" Error in streamResponse:", error);
    res.status(500).json({ error: error.message });
  }
};

// data-type: vulnmgmt, logmgmt
// offset: 10-20
