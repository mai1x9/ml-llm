const chatRepository = require("../repositories/jsonChatRepository");

const getNextChatId = () => {
  const history = chatRepository.getHistory();
  return history.data.length > 0
    ? Math.max(...history.data.map((item) => item.chat_id)) + 1
    : 1;
};

const cleanResponse = (response) => {
  return response.replace(/<think>.*?<\/think>/gs, "");
};

const saveHistoryEntry = (text, chat_id) => {
  const history = chatRepository.getHistory();
  const timestamp = Math.floor(Date.now() / 1000);

  const existingEntryIndex = history.data.findIndex(
    (entry) => entry.chat_id === chat_id
  );

  if (existingEntryIndex !== -1) {
    // Update timestamp only, keep original chat_heading
    history.data[existingEntryIndex].timestamp = timestamp;
  } else {
    // Add new entry with initial chat_heading
    const newEntry = {
      chat_id,
      chat_heading: text,
      timestamp,
    };
    history.data = [newEntry, ...history.data].slice(0, 10);
  }

  chatRepository.saveHistory(history);
};

const saveChatEntry = (chat_id, text, response) => {
  const chats = chatRepository.getChats();
  const timestamp = Math.floor(Date.now() / 1000);

  let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);

  if (!chatSession) {
    chatSession = {
      chat_id,
      chat_heading: text, // First query as heading here too, if desired
      data: [],
    };
    chats.data.unshift(chatSession);
  }

  chatSession.data.push({
    question: text,
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
