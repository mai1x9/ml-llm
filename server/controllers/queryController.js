// controllers/queryController.js
const { fetchSimilarCVEs } = require("../services/queryService");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "../data/history.json");
const CHATS_FILE = path.join(__dirname, "../data/chats.json");
const STREAM_API_URL = "http://localhost:11434/api/generate";

// Initialize empty files with proper structure
const initializeFile = (filePath, initialData) => {
  if (
    !fs.existsSync(filePath) ||
    fs.readFileSync(filePath, "utf8").trim() === ""
  ) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
};

// Initialize files on startup
initializeFile(HISTORY_FILE, {
  error: false,
  errmsg: null,
  msg: "Successfully sent ai history",
  data: [],
});

initializeFile(CHATS_FILE, {
  error: false,
  errmsg: null,
  msg: "Successfully sent chat data",
  data: [],
});

// Common file operations
const readJSON = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return { error: true, errmsg: error.message, data: [] };
  }
};

const saveJSON = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
};

// Get next AI ID
const getNextAiId = () => {
  const history = readJSON(HISTORY_FILE);
  return history.data.length > 0
    ? Math.max(...history.data.map((i) => i.ai_id)) + 1
    : 1;
};

// Save to history.json
const saveHistoryEntry = (question, ai_id) => {
  const history = readJSON(HISTORY_FILE);
  const timestamp = Math.floor(Date.now() / 1000);

  const newEntry = {
    ai_id,
    chat_heading:
      question.length > 50 ? question.substring(0, 47) + "..." : question,
    timestamp,
  };

  // Add new entry to beginning and keep only last 10
  history.data = [newEntry, ...history.data].slice(0, 10);
  saveJSON(HISTORY_FILE, history);
};

// Remove <think> tags from response
const cleanResponse = (response) => {
  return response.replace(/<think>.*?<\/think>/gs, "");
};

// Save to chats.json
const saveChatEntry = (ai_id, question, response) => {
  const chats = readJSON(CHATS_FILE);
  const timestamp = Math.floor(Date.now() / 1000);

  let chatSession = chats.data.find((chat) => chat.ai_id === ai_id);

  if (!chatSession) {
    chatSession = {
      ai_id,
      chat_heading:
        question.length > 50 ? question.substring(0, 47) + "..." : question,
      data: [],
    };
    chats.data.unshift(chatSession);
  }

  chatSession.data.push({
    question,
    response: cleanResponse(response),
    timestamp,
  });

  saveJSON(CHATS_FILE, chats);
};

// Common query processing
const processQuery = async (question) => {
  const similarCVEs = (await fetchSimilarCVEs(question)) || [];
  const context =
    similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n") || "No relevant CVEs found.";

  return `You are a cybersecurity expert. Answer: ${question}\nCVE data:\n${context}`;
};

// Controller methods
exports.getQueryResponse = async (req, res) => {
  try {
    const { question, ai_id: existingAiId } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Invalid question" });

    const ai_id = existingAiId || getNextAiId();
    const prompt = await processQuery(question);

    // Make a streaming API request
    const response = await axios.post(
      STREAM_API_URL,
      { model: "deepseek-r1:1.5b", prompt },
      { responseType: "stream" }
    );

    let fullResponse = "";

    // Accumulate each chunk from the stream
    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        fullResponse += json.response || "";
      } catch (err) {
        console.error("Chunk error:", err);
      }
    });

    // Once the stream ends, save the chat and history and respond with the full result
    response.data.on("end", () => {
      if (!existingAiId) saveHistoryEntry(question, ai_id);
      saveChatEntry(ai_id, question, fullResponse);
      res.json({
        response: cleanResponse(fullResponse),
        ai_id,
      });
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
      res.status(500).json({ error: "Stream failed" });
    });
  } catch (error) {
    console.error("Query error:", error);
    res.status(500).json({ error: "Processing failed" });
  }
};

exports.streamResponse = async (req, res) => {
  try {
    const { question, ai_id: existingAiId, socketId } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Invalid question" });
    if (!socketId)
      return res
        .status(400)
        .json({ error: "Missing socketId in request body" });

    const ai_id = existingAiId || getNextAiId();
    const prompt = await processQuery(question);

    // Get the Socket.IO instance from Express app locals
    const io = req.app.get("io");

    // Optionally set the content type header (not strictly needed here)
    res.setHeader("Content-Type", "text/plain");

    // Request the model API with streaming enabled
    const response = await axios.post(
      STREAM_API_URL,
      { model: "deepseek-r1:1.5b", prompt },
      { responseType: "stream" }
    );

    let fullResponse = "";

    // For each chunk, emit via Socket.IO and accumulate the full response
    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        const chunkText = json.response || "";
        fullResponse += chunkText;
        io.to(socketId).emit("ai_stream", chunkText);
      } catch (err) {
        console.error("Chunk error:", err);
      }
    });

    // When streaming ends, save the data and notify the client that the stream is complete
    response.data.on("end", () => {
      if (!existingAiId) saveHistoryEntry(question, ai_id);
      saveChatEntry(ai_id, question, fullResponse);
      io.to(socketId).emit("stream_end", { ai_id });
      res.json({ ai_id });
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
      io.to(socketId).emit("stream_error", { error: "Stream failed" });
      res.status(500).json({ error: "Stream failed" });
    });
  } catch (error) {
    console.error("Stream setup error:", error);
    res.status(500).json({ error: "Stream setup failed" });
  }
};

exports.getChatHistory = (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] GET /history called`);
    console.log(`- Headers: ${JSON.stringify(req.headers, null, 2)}`);
    const history = readJSON(HISTORY_FILE);
    res.json(history);
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to load history" });
  }
};

exports.getChatById = (req, res) => {
  try {
    const ai_id = parseInt(req.query.id);
    if (isNaN(ai_id)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing 'id' query parameter" });
    }
    const chats = readJSON(CHATS_FILE);
    const chat = chats.data.find((c) => c.ai_id === ai_id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json({
      error: false,
      errmsg: null,
      msg: "Successfully retrieved chat",
      data: chat,
    });
  } catch (error) {
    console.error("Chat fetch error:", error);
    res.status(500).json({ error: "Failed to load chat" });
  }
};
