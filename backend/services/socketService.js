const axios = require("axios");
const chatService = require("../services/chatService");
const { fetchSimilarEntries } = require("../services/queryService");

const STREAM_API_URL = "http://localhost:11434/api/generate";

const processQuery = async (text) => {
  const similarCVEs = (await fetchSimilarEntries(text)) || [];
  const context =
    similarCVEs
      .map(
        (entry) =>
          `CVE: ${entry.cve_id}\nDescription: ${entry.data.description}`
      )
      .join("\n") || "No relevant CVEs found.";
  return `You are a cybersecurity expert. Answer: ${text}\nCVE data:\n${context}`;
};

module.exports = (io) => {
  console.log("SocketService initialized");

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("new-message", async (data) => {
      console.log("Received new-message:", data); // Keep for debugging
      const { text, chat_id: existingChatId, socketId } = data;
      if (!text?.trim()) {
        socket.emit("error", { error: "Invalid text" });
        return;
      }

      const chat_id = existingChatId || chatService.getNextChatId();
      const prompt = await processQuery(text);

      try {
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
            const cleanedChunk = chatService.cleanResponse(chunkText);
            buffer += cleanedChunk;

            if (buffer.match(/[.!?]\s*$/) || buffer.includes("\n")) {
              fullResponse += buffer;
              // Optional debug log (comment out for production)
              // console.log("Emitting ai_stream:", buffer);
              io.to(socketId).emit("ai_stream", { chat_id, chunk: buffer });
              buffer = "";
            }
          } catch (err) {
            console.error("Chunk error:", err);
          }
        });

        response.data.on("end", () => {
          if (buffer) {
            fullResponse += buffer;
            io.to(socketId).emit("ai_stream", { chat_id, chunk: buffer });
          }
          chatService.saveHistoryEntry(text, chat_id);
          chatService.saveChatEntry(chat_id, text, fullResponse);
          io.to(socketId).emit("stream_end", { chat_id });
        });

        response.data.on("error", (err) => {
          console.error("Stream error:", err);
          io.to(socketId).emit("stream_error", {
            error: "Stream failed",
            chat_id,
          });
        });
      } catch (error) {
        console.error("Query error:", error);
        io.to(socketId).emit("stream_error", {
          error: "Processing failed",
          chat_id,
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
