const path = require("path");
const { readJSON, saveJSON, cleanResponse } = require("../utils/fileUtils");

const HISTORY_FILE = path.join(__dirname, "../data/history.json");
const CHATS_FILE = path.join(__dirname, "../data/chats.json");

const defaultHistory = {
  error: false,
  errmsg: null,
  msg: "Successfully sent ai history",
  data: [],
};
const defaultChats = {
  error: false,
  errmsg: null,
  msg: "Successfully sent chat data",
  data: [],
};

const initializeFile = (filePath, initialData) => {
  const fs = require("fs");
  if (
    !fs.existsSync(filePath) ||
    fs.readFileSync(filePath, "utf8").trim() === ""
  ) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
};

initializeFile(HISTORY_FILE, defaultHistory);
initializeFile(CHATS_FILE, defaultChats);

const getNextAiId = () => {
  const history = readJSON(HISTORY_FILE, defaultHistory);
  return history.data.length > 0
    ? Math.max(...history.data.map((i) => i.ai_id)) + 1
    : 1;
};

const saveHistoryEntry = (question, ai_id) => {
  const history = readJSON(HISTORY_FILE, defaultHistory);
  const timestamp = Math.floor(Date.now() / 1000);
  const newEntry = {
    ai_id,
    chat_heading:
      question.length > 50 ? question.substring(0, 47) + "..." : question,
    timestamp,
  };
  history.data = [newEntry, ...history.data].slice(0, 10);
  saveJSON(HISTORY_FILE, history);
};

const saveChatEntry = (ai_id, question, response) => {
  const chats = readJSON(CHATS_FILE, defaultChats);
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

module.exports = { getNextAiId, saveHistoryEntry, saveChatEntry };
