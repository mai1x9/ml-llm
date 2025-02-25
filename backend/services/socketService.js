const axios = require("axios");
const chatService = require("../services/chatService");
const { fetchSimilarEntries } = require("../services/queryService");

const STREAM_API_URL = "http://localhost:11434/api/generate";

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

module.exports = (io) => {
  console.log("SocketService initialized");

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("query", async (data) => {
      const { question, mode, chat_id: existingChatId } = data;
      if (!question?.trim()) {
        socket.emit("error", { error: "Invalid question" });
        return;
      }

      const chat_id = existingChatId || chatService.getNextChatId();
      const prompt = await processQuery(question);

      if (mode === "stream") {
        try {
          const response = await axios.post(
            STREAM_API_URL,
            { model: "deepseek-r1:1.5b", prompt },
            { responseType: "stream" }
          );

          let fullResponse = "";
          let buffer = "";

          response.data.on("data", (chunk) => {
            buffer += chunk.toString();
            try {
              const jsonChunks = buffer.split("\n").filter(Boolean);
              buffer = ""; // Reset buffer after processing

              jsonChunks.forEach((jsonString) => {
                try {
                  const json = JSON.parse(jsonString);
                  const chunkText = json.response || "";
                  fullResponse += chunkText;
                  socket.emit("ai_stream", { chat_id, chunk: chunkText });
                } catch (parseErr) {
                  console.error("JSON parse error:", parseErr);
                  buffer += jsonString; // Retain unprocessed data
                }
              });
            } catch (err) {
              console.error("Chunk processing error:", err);
            }
          });

          response.data.on("end", () => {
            chatService.saveHistoryEntry(question, chat_id);
            chatService.saveChatEntry(chat_id, question, fullResponse);
            socket.emit("stream_end", { chat_id });
          });

          response.data.on("error", (err) => {
            console.error("Stream error:", err);
            socket.emit("error", { error: "Stream failed", chat_id });
          });
        } catch (error) {
          console.error("Query error:", error);
          socket.emit("error", { error: "Processing failed", chat_id });
        }
      } else {
        // Non-streaming mode
        try {
          const response = await axios.post(STREAM_API_URL, {
            model: "deepseek-r1:1.5b",
            prompt,
          });

          const fullResponse = response.data.response || "";
          chatService.saveHistoryEntry(question, chat_id);
          chatService.saveChatEntry(chat_id, question, fullResponse);

          socket.emit("ai_response", {
            response: chatService.cleanResponse(fullResponse),
            chat_id,
          });
        } catch (error) {
          console.error("Query error:", error);
          socket.emit("error", { error: "Processing failed", chat_id });
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
