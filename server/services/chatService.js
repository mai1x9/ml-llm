// // const axios = require("axios");
// // const pool = require("../config/db");
// // const { generateEmbedding } = require("./embeddingService");
// // const chatRepository = require("../repositories/jsonChatRepository");
// // const { logPrompt } = require("../utils/promptLogger");
// // const fs = require("fs");
// // const yaml = require("js-yaml");

// // const STREAM_API_URL = "http://localhost:11434/api/generate";

// // // Query-related functions
// // const fetchSimilarEntries = async (question) => {
// //   const client = await pool.connect();
// //   try {
// //     const queryEmbeddings = await generateEmbedding(question);
// //     const queryEmbedding = queryEmbeddings[0];

// //     if (!Array.isArray(queryEmbedding)) {
// //       throw new Error("Embedding output is not a valid array");
// //     }

// //     const formattedEmbedding = JSON.stringify(queryEmbedding);
// //     const sql = `
// //       SELECT cve_id, data, (embedding <=> $1) AS distance
// //       FROM cve_data
// //       ORDER BY distance DESC
// //       LIMIT 20;
// //     `;
// //     const result = await client.query(sql, [formattedEmbedding]);
// //     return result.rows;
// //   } catch (error) {
// //     console.error("Error in fetchSimilarEntries:", error);
// //     throw new Error("Database query error: " + error.message);
// //   } finally {
// //     client.release();
// //   }
// // };

// // const processQuery = async (text) => {
// //   const similarCVEs = (await fetchSimilarEntries(text)) || [];
// //   const context =
// //     similarCVEs
// //       .map((entry) => {
// //         const d = entry.data;
// //         return [
// //           `CVE: ${entry.cve_id}`,
// //           `Name: ${d.name || "N/A"}`,
// //           `Description: ${d.description || "N/A"}`,
// //           `Severity: ${d.severity || "N/A"}`,
// //           `CVSS: ${d.cvss || "N/A"}`,
// //           `Threat: ${d.threat || "N/A"}`,
// //           `Mitigation: ${d.mitigation || "N/A"}`,
// //           `Product: ${d.product || "N/A"}`,
// //           `Version: ${d.version || "N/A"}`,
// //           `CWE: ${(d.cwe || []).join(", ") || "N/A"}`,
// //         ].join("\n");
// //       })
// //       .join("\n\n---\n\n") || "No relevant CVEs found.";
// //   const prompt = `You are a cybersecurity expert. Answer: ${text}\nCVE data:\n${context}`;
// //   await logPrompt(prompt);
// //   return prompt;
// // };

// // // Chat management functions
// // const getNextChatId = () => {
// //   const history = chatRepository.getHistory();
// //   return history.data.length > 0
// //     ? Math.max(...history.data.map((item) => item.chat_id)) + 1
// //     : 1;
// // };

// // // Improved real-time <think> tag filtering
// // const cleanResponse = (() => {
// //   let inThinkTag = false;

// //   return (chunk) => {
// //     if (inThinkTag) {
// //       const endTagPos = chunk.indexOf("</think>");
// //       if (endTagPos !== -1) {
// //         inThinkTag = false;
// //         return chunk.substring(endTagPos + 8);
// //       }
// //       return "";
// //     }

// //     const startTagPos = chunk.indexOf("<think");
// //     if (startTagPos !== -1) {
// //       inThinkTag = true;
// //       return chunk.substring(0, startTagPos);
// //     }

// //     return chunk;
// //   };
// // })();

// // const saveHistoryEntry = (text, chat_id) => {
// //   const history = chatRepository.getHistory();
// //   const timestamp = Date.now().toString();

// //   const existingEntryIndex = history.data.findIndex(
// //     (entry) => entry.chat_id === chat_id
// //   );

// //   if (existingEntryIndex !== -1) {
// //     history.data[existingEntryIndex].timestamp = timestamp;
// //   } else {
// //     const newEntry = { chat_id, chat_heading: text, timestamp };
// //     history.data = [newEntry, ...history.data].slice(0, 10);
// //   }

// //   chatRepository.saveHistory(history);
// // };

// // const saveChatEntry = (chat_id, text, response) => {
// //   const chats = chatRepository.getChats();
// //   const timestamp = Date.now().toString();

// //   let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);
// //   if (!chatSession) {
// //     chatSession = { chat_id, chat_heading: text, data: [] };
// //     chats.data.unshift(chatSession);
// //   }

// //   chatSession.data.push({
// //     question: text,
// //     response: cleanResponse(response),
// //     timestamp,
// //   });

// //   chatRepository.saveChats(chats);
// // };

// // // Stream response function
// // exports.handleStreamQuery = async (text, chat_id, socketId, io) => {
// //   const newChatId = chat_id || getNextChatId();
// //   const prompt = await processQuery(text);

// //   const response = await axios.post(
// //     STREAM_API_URL,
// //     { model: "gemma3:1b", prompt },
// //     { responseType: "stream" }
// //   );

// //   let fullResponse = "";
// //   let buffer = "";

// //   return new Promise((resolve, reject) => {
// //     response.data.on("data", (chunk) => {
// //       const json = JSON.parse(chunk.toString());
// //       const chunkText = json.response || "";
// //       buffer += chunkText;

// //       const regex = /(\s*\S+\s*)/g;
// //       let match;
// //       while ((match = regex.exec(buffer)) !== null) {
// //         const chunkToEmit = match[0];
// //         const cleanedChunk = cleanResponse(chunkToEmit);
// //         if (cleanedChunk) {
// //           io.to(socketId).emit("ai_stream", {
// //             chat_id: newChatId,
// //             chunk: cleanedChunk,
// //           });
// //           fullResponse += cleanedChunk;
// //         }
// //         buffer = buffer.substring(match.index + chunkToEmit.length);
// //       }
// //     });

// //     response.data.on("end", () => {
// //       if (buffer.trim()) {
// //         const cleanedBuffer = cleanResponse(buffer.trim());
// //         if (cleanedBuffer) {
// //           io.to(socketId).emit("ai_stream", {
// //             chat_id: newChatId,
// //             chunk: cleanedBuffer,
// //           });
// //           fullResponse += cleanedBuffer;
// //         }
// //       }
// //       const finalCleanedResponse = cleanResponse(fullResponse);
// //       saveChatEntry(newChatId, text, finalCleanedResponse);
// //       if (!chat_id) saveHistoryEntry(text, newChatId);
// //       io.to(socketId).emit("stream_end", { chat_id: newChatId });
// //       resolve(newChatId);
// //     });

// //     response.data.on("error", (err) => {
// //       console.error("Stream error:", err);
// //       io.to(socketId).emit("stream_error", { error: "Stream failed" });
// //       reject(err);
// //     });
// //   });
// // };

// // // Retrieve chat history
// // exports.getChatHistory = () => {
// //   return chatRepository.getHistory();
// // };

// // // Retrieve chat by ID
// // exports.getChatById = (chat_id) => {
// //   const chats = chatRepository.getChats();
// //   return chats.data.find((c) => c.chat_id === chat_id);
// // };

// // // Initialize Socket.IO with authentication
// // exports.initializeSocket = (io) => {
// //   console.log("SocketService initialized");

// //   io.on("connection", (socket) => {
// //     console.log(`New client connected: ${socket.id}`);

// //     // Track authentication state
// //     // let isAuthenticated = false;

// //     // Handle authentication event
// //     // socket.on("authenticate", (data) => {
// //     //   const token = data.token;
// //     //   console.log("Received Token:", token);

// //     // Validate the token (simple Bearer check for now)
// //     //   if (!token || !token.startsWith("Bearer ")) {
// //     //     console.log("Invalid or missing token");
// //     //     socket.emit("auth_error", {
// //     //       error: "Authentication failed: Invalid token",
// //     //     });
// //     //     socket.disconnect(); // Disconnect if authentication fails
// //     //   } else {
// //     //     console.log("✅ Token is valid");
// //     //     isAuthenticated = true;
// //     //     socket.emit("auth_success", { message: "Authentication successful" });
// //     //   }
// //     // });

// //     // Handle new messages only if authenticated
// //     socket.on("new-message", async (data) => {
// //       // if (!isAuthenticated) {
// //       //   socket.emit("error", {
// //       //     error: "Unauthorized: Please authenticate first",
// //       //   });
// //       //   return;
// //       // }

// //       const { text, chat_id: existingChatId, socketId } = data;
// //       if (!text?.trim()) {
// //         socket.emit("error", { error: "Invalid text" });
// //         return;
// //       }

// //       try {
// //         const newChatId = await exports.handleStreamQuery(
// //           text,
// //           existingChatId,
// //           socketId || socket.id,
// //           io
// //         );
// //         if (!existingChatId) saveHistoryEntry(text, newChatId);
// //       } catch (error) {
// //         console.error("Socket stream error:", error);
// //         io.to(socketId || socket.id).emit("stream_error", {
// //           error: "Processing failed",
// //           chat_id: existingChatId || getNextChatId(),
// //         });
// //       }
// //     });

// //     // Handle disconnection
// //     socket.on("disconnect", () => {
// //       console.log(`Client disconnected: ${socket.id}`);
// //     });
// //   });
// // };
// // function loadQuestions() {
// //   try {
// //     const file = fs.readFileSync("./config/questions.yml", "utf8");
// //     return yaml.load(file);
// //   } catch (error) {
// //     console.error("Error loading YAML file:", error);
// //     return null;
// //   }
// // }

// // exports.getQuestionsByType = (dashboard, type) => {
// //   const questionsData = loadQuestions();
// //   if (!questionsData) {
// //     throw new Error("Failed to load questions");
// //   }

// //   // Validate dashboard
// //   if (questionsData.dashboard !== dashboard) {
// //     throw new Error(`Invalid dashboard '${dashboard}'`);
// //   }

// //   // Validate type (general or specific)
// //   if (!questionsData.questions[type]) {
// //     throw new Error(`Invalid type '${type}'. Must be 'general' or 'specific'`);
// //   }

// //   return questionsData.questions[type];
// // };

// const axios = require("axios");
// const pool = require("../config/db");
// const { generateEmbedding } = require("./embeddingService");
// const chatRepository = require("../repositories/jsonChatRepository");
// const { logPrompt } = require("../utils/promptLogger");
// const fs = require("fs");
// const yaml = require("js-yaml");

// const STREAM_API_URL = "http://localhost:11434/api/generate";

// // Query-related functions
// const fetchSimilarEntries = async (question) => {
//   const client = await pool.connect();
//   try {
//     const queryEmbeddings = await generateEmbedding(question);
//     const queryEmbedding = queryEmbeddings[0];

//     if (!Array.isArray(queryEmbedding)) {
//       throw new Error("Embedding output is not a valid array");
//     }

//     const formattedEmbedding = JSON.stringify(queryEmbedding);
//     const sql = `
//       SELECT cve_id, data, (embedding <=> $1) AS distance
//       FROM cve_data
//       ORDER BY distance DESC
//       LIMIT 20;
//     `;
//     const result = await client.query(sql, [formattedEmbedding]);
//     return result.rows;
//   } catch (error) {
//     console.error("Error in fetchSimilarEntries:", error);
//     throw new Error("Database query error: " + error.message);
//   } finally {
//     client.release();
//   }
// };

// const processQuery = async (text) => {
//   // Temporarily bypassing cosine similarity logic and CVE context construction
//   // const similarCVEs = (await fetchSimilarEntries(text)) || [];
//   // const context =
//   //   similarCVEs
//   //     .map((entry) => {
//   //       const d = entry.data;
//   //       return [
//   //         `CVE: ${entry.cve_id}`,
//   //         `Name: ${d.name || "N/A"}`,
//   //         `Description: ${d.description || "N/A"}`,
//   //         `Severity: ${d.severity || "N/A"}`,
//   //         `CVSS: ${d.cvss || "N/A"}`,
//   //         `Threat: ${d.threat || "N/A"}`,
//   //         `Mitigation: ${d.mitigation || "N/A"}`,
//   //         `Product: ${d.product || "N/A"}`,
//   //         `Version: ${d.version || "N/A"}`,
//   //         `CWE: ${(d.cwe || []).join(", ") || "N/A"}`,
//   //       ].join("\n");
//   //     })
//   //     .join("\n\n---\n\n") || "No relevant CVEs found.";
//   // const prompt = `You are a cybersecurity expert. Answer: ${text}\nCVE data:\n${context}`;

//   // Simplified prompt for normal chatbot behavior
//   const prompt = `You are a cybersecurity expert. Answer the following question: ${text}`;
//   await logPrompt(prompt);
//   return prompt;
// };

// // Chat management functions
// const getNextChatId = () => {
//   const history = chatRepository.getHistory();
//   return history.data.length > 0
//     ? Math.max(...history.data.map((item) => item.chat_id)) + 1
//     : 1;
// };

// // Improved real-time <think> tag filtering
// const cleanResponse = (() => {
//   let inThinkTag = false;

//   return (chunk) => {
//     if (inThinkTag) {
//       const endTagPos = chunk.indexOf("</think>");
//       if (endTagPos !== -1) {
//         inThinkTag = false;
//         return chunk.substring(endTagPos + 8);
//       }
//       return "";
//     }

//     const startTagPos = chunk.indexOf("<think");
//     if (startTagPos !== -1) {
//       inThinkTag = true;
//       return chunk.substring(0, startTagPos);
//     }

//     return chunk;
//   };
// })();

// const saveHistoryEntry = (text, chat_id) => {
//   const history = chatRepository.getHistory();
//   const timestamp = Date.now().toString();

//   const existingEntryIndex = history.data.findIndex(
//     (entry) => entry.chat_id === chat_id
//   );

//   if (existingEntryIndex !== -1) {
//     history.data[existingEntryIndex].timestamp = timestamp;
//   } else {
//     const newEntry = { chat_id, chat_heading: text, timestamp };
//     history.data = [newEntry, ...history.data].slice(0, 10);
//   }

//   chatRepository.saveHistory(history);
// };

// const saveChatEntry = (chat_id, text, response) => {
//   const chats = chatRepository.getChats();
//   const timestamp = Date.now().toString();

//   let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);
//   if (!chatSession) {
//     chatSession = { chat_id, chat_heading: text, data: [] };
//     chats.data.unshift(chatSession);
//   }

//   chatSession.data.push({
//     question: text,
//     response: cleanResponse(response),
//     timestamp,
//   });

//   chatRepository.saveChats(chats);
// };

// // Stream response function
// exports.handleStreamQuery = async (text, chat_id, socketId, io) => {
//   const newChatId = chat_id || getNextChatId();
//   const prompt = await processQuery(text);

//   const response = await axios.post(
//     STREAM_API_URL,
//     { model: "deepseek-r1:1.5b", prompt },
//     { responseType: "stream" }
//   );

//   let fullResponse = "";
//   let buffer = "";

//   return new Promise((resolve, reject) => {
//     response.data.on("data", (chunk) => {
//       const json = JSON.parse(chunk.toString());
//       const chunkText = json.response || "";
//       buffer += chunkText;

//       const regex = /(\s*\S+\s*)/g;
//       let match;
//       while ((match = regex.exec(buffer)) !== null) {
//         const chunkToEmit = match[0];
//         const cleanedChunk = cleanResponse(chunkToEmit);
//         if (cleanedChunk) {
//           io.to(socketId).emit("ai_stream", {
//             chat_id: newChatId,
//             chunk: cleanedChunk,
//           });
//           fullResponse += cleanedChunk;
//         }
//         buffer = buffer.substring(match.index + chunkToEmit.length);
//       }
//     });

//     response.data.on("end", () => {
//       if (buffer.trim()) {
//         const cleanedBuffer = cleanResponse(buffer.trim());
//         if (cleanedBuffer) {
//           io.to(socketId).emit("ai_stream", {
//             chat_id: newChatId,
//             chunk: cleanedBuffer,
//           });
//           fullResponse += cleanedBuffer;
//         }
//       }
//       const finalCleanedResponse = cleanResponse(fullResponse);
//       saveChatEntry(newChatId, text, finalCleanedResponse);
//       if (!chat_id) saveHistoryEntry(text, newChatId);
//       io.to(socketId).emit("stream_end", { chat_id: newChatId });
//       resolve(newChatId);
//     });

//     response.data.on("error", (err) => {
//       console.error("Stream error:", err);
//       io.to(socketId).emit("stream_error", { error: "Stream failed" });
//       reject(err);
//     });
//   });
// };

// // Retrieve chat history
// exports.getChatHistory = () => {
//   return chatRepository.getHistory();
// };

// // Retrieve chat by ID
// exports.getChatById = (chat_id) => {
//   const chats = chatRepository.getChats();
//   return chats.data.find((c) => c.chat_id === chat_id);
// };

// // Initialize Socket.IO with authentication
// exports.initializeSocket = (io) => {
//   console.log("SocketService initialized");

//   io.on("connection", (socket) => {
//     console.log(`New client connected: ${socket.id}`);

//     // Track authentication state
//     // let isAuthenticated = false;

//     // Handle authentication event
//     // socket.on("authenticate", (data) => {
//     //   const token = data.token;
//     //   console.log("Received Token:", token);

//     // Validate the token (simple Bearer check for now)
//     //   if (!token || !token.startsWith("Bearer ")) {
//     //     console.log("Invalid or missing token");
//     //     socket.emit("auth_error", {
//     //       error: "Authentication failed: Invalid token",
//     //     });
//     //     socket.disconnect(); // Disconnect if authentication fails
//     //   } else {
//     //     console.log("✅ Token is valid");
//     //     isAuthenticated = true;
//     //     socket.emit("auth_success", { message: "Authentication successful" });
//     //   }
//     // });

//     // Handle new messages only if authenticated
//     socket.on("new-message", async (data) => {
//       // if (!isAuthenticated) {
//       //   socket.emit("error", {
//       //     error: "Unauthorized: Please authenticate first",
//       //   });
//       //   return;
//       // }

//       const { text, chat_id: existingChatId, socketId } = data;
//       if (!text?.trim()) {
//         socket.emit("error", { error: "Invalid text" });
//         return;
//       }

//       try {
//         const newChatId = await exports.handleStreamQuery(
//           text,
//           existingChatId,
//           socketId || socket.id,
//           io
//         );
//         if (!existingChatId) saveHistoryEntry(text, newChatId);
//       } catch (error) {
//         console.error("Socket stream error:", error);
//         io.to(socketId || socket.id).emit("stream_error", {
//           error: "Processing failed",
//           chat_id: existingChatId || getNextChatId(),
//         });
//       }
//     });

//     // Handle disconnection
//     socket.on("disconnect", () => {
//       console.log(`Client disconnected: ${socket.id}`);
//     });
//   });
// };

// function loadQuestions() {
//   try {
//     const file = fs.readFileSync("./config/questions.yml", "utf8");
//     return yaml.load(file);
//   } catch (error) {
//     console.error("Error loading YAML file:", error);
//     return null;
//   }
// }

// exports.getQuestionsByType = (dashboard, type) => {
//   const questionsData = loadQuestions();
//   if (!questionsData) {
//     throw new Error("Failed to load questions");
//   }

//   // Validate dashboard
//   if (questionsData.dashboard !== dashboard) {
//     throw new Error(`Invalid dashboard '${dashboard}'`);
//   }

//   // Validate type (general or specific)
//   if (!questionsData.questions[type]) {
//     throw new Error(`Invalid type '${type}'. Must be 'general' or 'specific'`);
//   }

//   return questionsData.questions[type];
// };

const axios = require("axios");
const pool = require("../config/db");
const { generateEmbedding } = require("./embeddingService");
const chatRepository = require("../repositories/jsonChatRepository");
const { logPrompt } = require("../utils/promptLogger");
const fs = require("fs");
const yaml = require("js-yaml");

const STREAM_API_URL = "http://localhost:11434/api/generate";

// Query-related functions
const fetchSimilarEntries = async (question) => {
  const client = await pool.connect();
  try {
    const queryEmbeddings = await generateEmbedding(question);
    const queryEmbedding = queryEmbeddings[0];

    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Embedding output is not a valid array");
    }

    const formattedEmbedding = JSON.stringify(queryEmbedding);
    const sql = `
      SELECT cve_id, data, (embedding <=> $1) AS distance
      FROM cve_data
      ORDER BY distance DESC
      LIMIT 20;
    `;
    const result = await client.query(sql, [formattedEmbedding]);
    return result.rows;
  } catch (error) {
    console.error("Error in fetchSimilarEntries:", error);
    throw new Error("Database query error: " + error.message);
  } finally {
    client.release();
  }
};

const processQuery = async (text, context = {}) => {
  // Simplified prompt with context integration
  let prompt = `You are a cybersecurity expert. Answer the following question: ${text}`;

  // If context is provided, append it to the prompt
  if (Object.keys(context).length > 0) {
    const contextString = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    prompt += `\nAdditional Context:\n${contextString}`;
  }

  await logPrompt(prompt);
  return prompt;
};

// Chat management functions
const getNextChatId = () => {
  const history = chatRepository.getHistory();
  return history.data.length > 0
    ? Math.max(...history.data.map((item) => item.chat_id)) + 1
    : 1;
};

// Improved real-time <think> tag filtering
const cleanResponse = (() => {
  let inThinkTag = false;

  return (chunk) => {
    if (inThinkTag) {
      const endTagPos = chunk.indexOf("</think>");
      if (endTagPos !== -1) {
        inThinkTag = false;
        return chunk.substring(endTagPos + 8);
      }
      return "";
    }

    const startTagPos = chunk.indexOf("<think");
    if (startTagPos !== -1) {
      inThinkTag = true;
      return chunk.substring(0, startTagPos);
    }

    return chunk;
  };
})();

const saveHistoryEntry = (text, chat_id) => {
  const history = chatRepository.getHistory();
  const timestamp = Date.now().toString();

  const existingEntryIndex = history.data.findIndex(
    (entry) => entry.chat_id === chat_id
  );

  if (existingEntryIndex !== -1) {
    history.data[existingEntryIndex].timestamp = timestamp;
  } else {
    const newEntry = { chat_id, chat_heading: text, timestamp };
    history.data = [newEntry, ...history.data].slice(0, 10);
  }

  chatRepository.saveHistory(history);
};

const saveChatEntry = (chat_id, text, response, context = {}) => {
  const chats = chatRepository.getChats();
  const timestamp = Date.now().toString();

  let chatSession = chats.data.find((chat) => chat.chat_id === chat_id);
  if (!chatSession) {
    chatSession = { chat_id, chat_heading: text, data: [] };
    chats.data.unshift(chatSession);
  }

  chatSession.data.push({
    question: text,
    response: cleanResponse(response),
    context, // Save context with the chat entry
    timestamp,
  });

  chatRepository.saveChats(chats);
};

// Stream response function
exports.handleStreamQuery = async (
  text,
  chat_id,
  socketId,
  io,
  context = {}
) => {
  const newChatId = chat_id || getNextChatId();
  const prompt = await processQuery(text, context);

  const response = await axios.post(
    STREAM_API_URL,
    { model: "deepseek-r1:1.5b", prompt },
    { responseType: "stream" }
  );

  let fullResponse = "";
  let buffer = "";

  return new Promise((resolve, reject) => {
    response.data.on("data", (chunk) => {
      const json = JSON.parse(chunk.toString());
      const chunkText = json.response || "";
      buffer += chunkText;

      const regex = /(\s*\S+\s*)/g;
      let match;
      while ((match = regex.exec(buffer)) !== null) {
        const chunkToEmit = match[0];
        const cleanedChunk = cleanResponse(chunkToEmit);
        if (cleanedChunk) {
          io.to(socketId).emit("ai_stream", {
            chat_id: newChatId,
            chunk: cleanedChunk,
          });
          fullResponse += cleanedChunk;
        }
        buffer = buffer.substring(match.index + chunkToEmit.length);
      }
    });

    response.data.on("end", () => {
      if (buffer.trim()) {
        const cleanedBuffer = cleanResponse(buffer.trim());
        if (cleanedBuffer) {
          io.to(socketId).emit("ai_stream", {
            chat_id: newChatId,
            chunk: cleanedBuffer,
          });
          fullResponse += cleanedBuffer;
        }
      }
      const finalCleanedResponse = cleanResponse(fullResponse);
      saveChatEntry(newChatId, text, finalCleanedResponse, context);
      if (!chat_id) saveHistoryEntry(text, newChatId);
      io.to(socketId).emit("stream_end", { chat_id: newChatId });
      resolve(newChatId);
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
      io.to(socketId).emit("stream_error", { error: "Stream failed" });
      reject(err);
    });
  });
};

// Retrieve chat history
exports.getChatHistory = () => {
  return chatRepository.getHistory();
};

// Retrieve chat by ID
exports.getChatById = (chat_id) => {
  const chats = chatRepository.getChats();
  return chats.data.find((c) => c.chat_id === chat_id);
};

// Initialize Socket.IO with authentication
exports.initializeSocket = (io) => {
  console.log("SocketService initialized");

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    socket.on("new-message", async (data) => {
      const { text, chat_id: existingChatId, socketId, context = {} } = data;
      if (!text?.trim()) {
        socket.emit("error", { error: "Invalid text" });
        return;
      }

      try {
        const newChatId = await exports.handleStreamQuery(
          text,
          existingChatId,
          socketId || socket.id,
          io,
          context // Pass context to handleStreamQuery
        );
        if (!existingChatId) saveHistoryEntry(text, newChatId);
      } catch (error) {
        console.error("Socket stream error:", error);
        io.to(socketId || socket.id).emit("stream_error", {
          error: "Processing failed",
          chat_id: existingChatId || getNextChatId(),
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
};

function loadQuestions() {
  try {
    const file = fs.readFileSync("./config/questions.yml", "utf8");
    return yaml.load(file);
  } catch (error) {
    console.error("Error loading YAML file:", error);
    return null;
  }
}

exports.getQuestionsByType = (dashboard, type) => {
  const questionsData = loadQuestions();
  if (!questionsData) {
    throw new Error("Failed to load questions");
  }

  if (questionsData.dashboard !== dashboard) {
    throw new Error(`Invalid dashboard '${dashboard}'`);
  }

  if (!questionsData.questions[type]) {
    throw new Error(`Invalid type '${type}'. Must be 'general' or 'specific'`);
  }

  return questionsData.questions[type];
};
