const chatService = require("../services/chatService");

exports.getQueryResponse = async (req, res) => {
  try {
    const { question, chat_id } = req.body;
    if (!question?.trim()) {
      return res.status(400).json({ error: "Invalid question" });
    }
    const { response, chatId } = await chatService.handleQuery(
      question,
      chat_id
    );
    res.json({ response, chat_id: chatId });
  } catch (error) {
    console.error("Query error:", error);
    res.status(500).json({ error: "Processing failed" });
  }
};

exports.streamResponse = async (req, res) => {
  try {
    const { text, chat_id, socketId } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Invalid text" });
    if (!socketId) return res.status(400).json({ error: "Missing socketId" });

    const io = req.app.get("io");
    const newChatId = await chatService.handleStreamQuery(
      text,
      chat_id,
      socketId,
      io
    );
    res.json({ chat_id: newChatId });
  } catch (error) {
    console.error("Stream error:", error);
    res.status(500).json({ error: "Stream setup failed" });
  }
};

exports.getChatHistory = (req, res) => {
  try {
    const history = chatService.getChatHistory();
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
      return res.status(400).json({ error: "Invalid or missing 'id'" });
    }
    const chat = chatService.getChatById(chat_id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json({ error: false, msg: "Successfully retrieved chat", data: chat });
  } catch (error) {
    console.error("Chat fetch error:", error);
    res.status(500).json({ error: "Failed to load chat" });
  }
};
exports.getQuestions = (req, res) => {
  const { dashboard, type } = req.body;

  if (!dashboard || !type) {
    return res
      .status(400)
      .json({ error: "Missing 'dashboard' or 'type' parameter" });
  }

  try {
    const questions = chatService.getQuestionsByType(dashboard, type);
    res.json({ questions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
