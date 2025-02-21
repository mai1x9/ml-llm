const { readJSON } = require("../utils/fileUtils");
const path = require("path");
const HISTORY_FILE = path.join(__dirname, "../data/history.json");

exports.getChatHistory = (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] GET /history called`);
    const history = readJSON(HISTORY_FILE, { data: [] });
    res.json(history);
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to load history" });
  }
};
