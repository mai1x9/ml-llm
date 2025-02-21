const { fetchSimilarCVEs } = require("../services/queryService");
const { callLLM } = require("../services/llmService");
const {
  getNextAiId,
  saveHistoryEntry,
  saveChatEntry,
} = require("../services/chatService");
const { cleanResponse } = require("../utils/fileUtils");

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

exports.handleSocketQuery = async (socket, data) => {
  try {
    const { question, ai_id: existingAiId } = data;
    if (!question?.trim()) {
      socket.emit("error", { error: "Invalid question" });
      return;
    }
    const ai_id = existingAiId || getNextAiId();
    const prompt = await processQuery(question);
    const response = await callLLM(prompt, "stream");

    let fullResponse = "";
    response.data.on("data", (chunk) => {
      try {
        const json = JSON.parse(chunk.toString());
        const chunkText = json.response || "";
        fullResponse += chunkText;
        socket.emit("ai_stream", { chunk: chunkText });
      } catch (err) {
        console.error("Socket chunk error:", err);
      }
    });

    response.data.on("end", () => {
      if (!existingAiId) saveHistoryEntry(question, ai_id);
      saveChatEntry(ai_id, question, fullResponse);
      socket.emit("stream_end", { ai_id });
    });

    response.data.on("error", (err) => {
      console.error("Socket stream error:", err);
      socket.emit("stream_error", { error: "Stream failed" });
    });
  } catch (error) {
    console.error("Socket query error:", error);
    socket.emit("error", { error: "Processing failed" });
  }
};
