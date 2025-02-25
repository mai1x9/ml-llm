const axios = require("axios");
const { fetchSimilarEntries } = require("../services/queryService");
const chatService = require("../services/chatService");
const chatRepository = require("../repositories/jsonChatRepository");

const STREAM_API_URL = "http://localhost:11434/api/generate";

// Initialize files on startup (dummy data)
chatRepository.initializeFiles();

// Enrich prompt using data from CVE service
const processQuery = async (question) => {
  const similarCVEs = (await fetchSimilarEntries(question)) || [];
  const context =
    similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n") || "No relevant CVEs found.";
  return `You are a cybersecurity expert. Answer: ${question}\nCVE data:\n${context}`;
};

exports.getQueryResponse = async (req, res) => {
  try {
    const { question, chat_id } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Invalid question" });

    // Use existing chat_id if provided, otherwise generate a new one
    const newChatId = chat_id || chatService.getNextChatId();

    const prompt = await processQuery(question);

    // Request the streaming API
    const response = await axios.post(
      STREAM_API_URL,
      { model: "deepseek-r1:1.5b", prompt },
      { responseType: "stream" }
    );

    let fullResponse = "";

    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        fullResponse += json.response || "";
      } catch (err) {
        console.error("Chunk error:", err);
      }
    });

    response.data.on("end", () => {
      if (!chat_id) chatService.saveHistoryEntry(question, newChatId);
      chatService.saveChatEntry(newChatId, question, fullResponse);
      res.json({
        response: chatService.cleanResponse(fullResponse),
        chat_id: newChatId,
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
    const { question, chat_id: existingChatId, socketId } = req.body;
    if (!question?.trim())
      return res.status(400).json({ error: "Invalid question" });
    if (!socketId)
      return res
        .status(400)
        .json({ error: "Missing socketId in request body" });

    const chat_id = existingChatId || chatService.getNextChatId();
    const prompt = await processQuery(question);

    const io = req.app.get("io");
    res.setHeader("Content-Type", "text/plain");

    const response = await axios.post(
      STREAM_API_URL,
      { model: "deepseek-r1:1.5b", prompt },
      { responseType: "stream" }
    );

    let fullResponse = "";
    let buffer = "";

    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        const chunkText = json.response || "";
        const cleanedChunk = chatService.cleanResponse(chunkText); // Clean each chunk
        buffer += cleanedChunk;

        // Emit when we hit a sentence-ending punctuation or newline
        if (buffer.match(/[.!?]\s*$/) || buffer.includes("\n")) {
          fullResponse += buffer;
          io.to(socketId).emit("ai_stream", buffer);
          buffer = "";
        }
      } catch (err) {
        console.error("Chunk error:", err);
      }
    });

    response.data.on("end", () => {
      if (buffer) {
        fullResponse += buffer;
        io.to(socketId).emit("ai_stream", buffer);
      }
      if (!existingChatId) chatService.saveHistoryEntry(question, chat_id);
      chatService.saveChatEntry(chat_id, question, fullResponse);
      io.to(socketId).emit("stream_end", { chat_id });
      res.json({ chat_id });
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
    const history = chatRepository.getHistory();
    res.json(history);
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to load history" });
  }
};

exports.getChatById = (req, res) => {
  try {
    const chat_id = parseInt(req.query.id);
    if (isNaN(chat_id)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing 'id' query parameter" });
    }
    const chats = chatRepository.getChats();
    const chat = chats.data.find((c) => c.chat_id === chat_id);
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
