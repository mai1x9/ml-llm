// services/chatService.js
const chatRepository = require("../repositories/jsonChatRepository");

// Helper to get the next Chat ID based on history data
const getNextChatId = () => {
  const history = chatRepository.getHistory();
  return history.data.length > 0
    ? Math.max(...history.data.map((item) => item.chat_id)) + 1
    : 1;
};

// Remove <think> tags from response (business logic)
const cleanResponse = (response) => {
  return response.replace(/<think>.*?<\/think>/gs, "");
};

// Save an entry in the history JSON file
const saveHistoryEntry = (question, chat_id) => {
  const history = chatRepository.getHistory();
  const timestamp = Math.floor(Date.now() / 1000);

  const newEntry = {
    chat_id,
    chat_heading: question, // Store full question without truncation
    timestamp,
  };

  // Add new entry to beginning and keep only the last 10 entries
  history.data = [newEntry, ...history.data].slice(0, 10);
  chatRepository.saveHistory(history);
};

// Save an entry in the chats JSON file
const saveChatEntry = (chat_id, question, response) => {
  const chats = chatRepository.getChats();
  const timestamp = Math.floor(Date.now() / 1000);

  let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);

  if (!chatSession) {
    chatSession = {
      chat_id,
      chat_heading: question, // Store full question without truncation
      data: [],
    };
    chats.data.unshift(chatSession);
  }

  chatSession.data.push({
    question,
    response: cleanResponse(response),
    timestamp,
  });

  chatRepository.saveChats(chats);
};

module.exports = {
  getNextChatId,
  cleanResponse,
  saveHistoryEntry,
  saveChatEntry,
};
