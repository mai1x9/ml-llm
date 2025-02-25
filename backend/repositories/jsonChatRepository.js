// repositories/jsonChatRepository.js
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = path.join(__dirname, "../data/history.json");
const CHATS_FILE = path.join(__dirname, "../data/chats.json");

const initializeFile = (filePath, initialData) => {
  if (
    !fs.existsSync(filePath) ||
    fs.readFileSync(filePath, "utf8").trim() === ""
  ) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
};

const initializeFiles = () => {
  initializeFile(HISTORY_FILE, {
    error: false,
    errmsg: null,
    msg: "Successfully sent ai history",
    data: [],
  });
  initializeFile(CHATS_FILE, {
    error: false,
    errmsg: null,
    msg: "Successfully sent chat data",
    data: [],
  });
};

const readJSON = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return { error: true, errmsg: error.message, data: [] };
  }
};

const saveJSON = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
};

const getHistory = () => {
  return readJSON(HISTORY_FILE);
};

const saveHistory = (history) => {
  saveJSON(HISTORY_FILE, history);
};

const getChats = () => {
  return readJSON(CHATS_FILE);
};

const saveChats = (chats) => {
  saveJSON(CHATS_FILE, chats);
};

const getChatIdFromChatId = (chat_id) => {
  const chats = getChats();
  const chatEntry = chats.data.find(
    (chat) => String(chat.chat_id) === String(chat_id)
  );
  return chatEntry ? chatEntry.chat_id : null;
};

module.exports = {
  initializeFiles,
  getHistory,
  saveHistory,
  getChats,
  saveChats,
  getChatIdFromChatId,
};
