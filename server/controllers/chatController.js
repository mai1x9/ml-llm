const { readJSON } = require("../utils/fileUtils");
const path = require("path");
const CHATS_FILE = path.join(__dirname, "../data/chats.json");

exports.getChatById = (req, res) => {
  try {
    const ai_id = parseInt(req.query.id);
    if (isNaN(ai_id))
      return res
        .status(400)
        .json({ error: "Invalid or missing 'id' query parameter" });
    const chats = readJSON(CHATS_FILE, { data: [] });
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
