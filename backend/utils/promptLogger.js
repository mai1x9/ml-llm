// promptLogger.js
const fs = require("fs").promises;
const path = require("path");

// Define the log file path (e.g., logs/prompts.log in your project root)
const LOG_FILE = path.join(__dirname, "..", "logs", "prompts.log");

// Ensure the logs directory exists
async function ensureLogDirectory() {
  const logDir = path.dirname(LOG_FILE);
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.error("Failed to create logs directory:", err);
    }
  }
}

// Log the prompt to the file
async function logPrompt(prompt) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}]\n${prompt}\n---\n`;

  try {
    await ensureLogDirectory();
    await fs.appendFile(LOG_FILE, logEntry, "utf8");
    console.log("Prompt logged to", LOG_FILE);
  } catch (err) {
    console.error("Failed to log prompt:", err);
  }
}

module.exports = { logPrompt };
