const axios = require("axios");
const pool = require("../config/db");
const { generateEmbedding } = require("./embeddingService");
const chatRepository = require("../repositories/jsonChatRepository");
const { logPrompt } = require("../utils/promptLogger");

const STREAM_API_URL = "http://localhost:11434/api/generate";

// MMR implementation using precomputed distances
const computeMMR = (entries, lambda = 0.5, k = 20) => {
  const selected = [];
  const unselected = [...entries];

  // Pick the most relevant entry first (lowest distance = highest similarity)
  const firstEntry = unselected.splice(0, 1)[0];
  selected.push(firstEntry);

  // MMR loop
  while (selected.length < k && unselected.length > 0) {
    let maxScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < unselected.length; i++) {
      const entry = unselected[i];
      // Relevance to query (lower distance = more relevant)
      const relevance = 1 - entry.similarity;

      // Diversity: min distance to already selected entries
      const diversity = Math.min(
        ...selected.map((sel) => sel.distances[entry.cve_id] || 1) // Use precomputed distances
      );

      // MMR score
      const score = lambda * relevance - (1 - lambda) * diversity;
      if (score > maxScore) {
        maxScore = score;
        bestIdx = i;
      }
    }

    selected.push(unselected.splice(bestIdx, 1)[0]);
  }

  return selected;
};

// Query-related functions
const fetchSimilarEntries = async (question) => {
  const client = await pool.connect();
  try {
    const queryEmbeddings = await generateEmbedding(question);
    const queryEmbedding = queryEmbeddings[0];

    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Embedding output is not a valid array");
    }

    const formattedEmbedding = JSON.stringify(queryEmbedding);
    // Fetch top 100 entries and precompute distances between them
    const sql = `
      WITH top_entries AS (
        SELECT cve_id, data, embedding, embedding <=> $1::vector AS similarity
        FROM cve_data
        ORDER BY similarity ASC
        LIMIT 100
      )
      SELECT te1.cve_id, te1.data, te1.embedding, te1.similarity,
             jsonb_object_agg(te2.cve_id, te1.embedding <=> te2.embedding) AS distances
      FROM top_entries te1
      CROSS JOIN top_entries te2
      GROUP BY te1.cve_id, te1.data, te1.embedding, te1.similarity;
    `;
    const result = await client.query(sql, [formattedEmbedding]);

    // Apply MMR to get diverse subset
    const diverseEntries = computeMMR(result.rows, 0.5, 20);
    return diverseEntries;
  } catch (error) {
    console.error("Error in fetchSimilarEntries:", error);
    throw new Error("Database query error: " + error.message);
  } finally {
    client.release();
  }
};

const processQuery = async (text) => {
  const similarCVEs = (await fetchSimilarEntries(text)) || [];
  const context =
    similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n") || "No relevant CVEs found.";
  const prompt = `You are a cybersecurity expert. Answer: ${text}\nCVE data:\n${context}`;
  await logPrompt(prompt);
  return prompt;
};

// Chat management functions
const getNextChatId = () => {
  const history = chatRepository.getHistory();
  return history.data.length > 0
    ? Math.max(...history.data.map((item) => item.chat_id)) + 1
    : 1;
};

const cleanResponse = (response) => {
  return response.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, "");
};

const saveHistoryEntry = (text, chat_id) => {
  const history = chatRepository.getHistory();
  const timestamp = Math.floor(Date.now() / 1000);

  const existingEntryIndex = history.data.findIndex(
    (entry) => entry.chat_id === chat_id
  );

  if (existingEntryIndex !== -1) {
    history.data[existingEntryIndex].timestamp = timestamp;
  } else {
    const newEntry = { chat_id, chat_heading: text, timestamp };
    history.data = [newEntry, ...history.data].slice(0, 10);
  }

  chatRepository.saveHistory(history);
};

const saveChatEntry = (chat_id, text, response) => {
  const chats = chatRepository.getChats();
  const timestamp = Math.floor(Date.now() / 1000);

  let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);
  if (!chatSession) {
    chatSession = { chat_id, chat_heading: text, data: [] };
    chats.data.unshift(chatSession);
  }

  chatSession.data.push({
    question: text,
    response: cleanResponse(response),
    timestamp,
  });

  chatRepository.saveChats(chats);
};

// Public API for controller
exports.handleQuery = async (question, chat_id) => {
  const newChatId = chat_id || getNextChatId();
  const prompt = await processQuery(question);

  const response = await axios.post(
    STREAM_API_URL,
    { model: "gemma3:1b", prompt },
    { responseType: "stream" }
  );

  let fullResponse = "";
  await new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      const json = JSON.parse(chunk.toString());
      fullResponse += json.response || "";
    });
    response.data.on("end", () => {
      const cleanedResponse = cleanResponse(fullResponse);
      if (!chat_id) saveHistoryEntry(question, newChatId);
      saveChatEntry(newChatId, question, cleanedResponse);
      resolve();
    });
    response.data.on("error", reject);
  });

  return { response: cleanResponse(fullResponse), chatId: newChatId };
};

exports.handleStreamQuery = async (text, chat_id, socketId, io) => {
  const newChatId = chat_id || getNextChatId();
  const prompt = await processQuery(text);

  const response = await axios.post(
    STREAM_API_URL,
    { model: "gemma3:1b", prompt },
    { responseType: "stream" }
  );

  let fullResponse = "";
  let buffer = "";

  return new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      const json = JSON.parse(chunk.toString());
      const chunkText = json.response || "";
      buffer += chunkText;

      const regex = /(\s*\S+\s*)/g;
      let match;
      while ((match = regex.exec(buffer)) !== null) {
        const chunkToEmit = match[0];
        io.to(socketId).emit("ai_stream", {
          chat_id: newChatId,
          chunk: chunkToEmit,
        });
        fullResponse += chunkToEmit;
        buffer = buffer.substring(match.index + chunkToEmit.length);
      }
    });

    response.data.on("end", () => {
      if (buffer.trim()) {
        io.to(socketId).emit("ai_stream", {
          chat_id: newChatId,
          chunk: buffer.trim(),
        });
        fullResponse += buffer.trim();
      }
      const finalCleanedResponse = cleanResponse(fullResponse);
      saveChatEntry(newChatId, text, finalCleanedResponse);
      if (!chat_id) saveHistoryEntry(text, newChatId);
      io.to(socketId).emit("stream_end", { chat_id: newChatId });
      resolve(newChatId);
    });

    response.data.on("error", (err) => {
      io.to(socketId).emit("stream_error", { error: "Stream failed" });
      reject(err);
    });
  });
};

exports.getChatHistory = () => {
  return chatRepository.getHistory();
};

exports.getChatById = (chat_id) => {
  const chats = chatRepository.getChats();
  return chats.data.find((c) => c.chat_id === chat_id);
};

// Socket.IO initialization
exports.initializeSocket = (io) => {
  console.log("SocketService initialized");

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("new-message", async (data) => {
      const { text, chat_id: existingChatId, socketId } = data;
      if (!text?.trim()) {
        socket.emit("error", { error: "Invalid text" });
        return;
      }

      try {
        const newChatId = await exports.handleStreamQuery(
          text,
          existingChatId,
          socketId || socket.id,
          io
        );
        if (!existingChatId) saveHistoryEntry(text, newChatId);
      } catch (error) {
        console.error("Socket stream error:", error);
        io.to(socketId || socket.id).emit("stream_error", {
          error: "Processing failed",
          chat_id: existingChatId || getNextChatId(),
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
