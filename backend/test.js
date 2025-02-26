const { io } = require("socket.io-client");
const axios = require("axios");

const socket = io("http://localhost:4000", {
  // Updated port to 3000
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 5000,
});

socket.on("connect", async () => {
  console.log("Connected to WebSocket!");
  console.log("Your socketId:", socket.id);
  console.log("Use this socketId in API requests.");

  // Simulate frontend payload and send POST request
  const payload = {
    sender: "user",
    text: "heloo",
    timestamp: new Date().toISOString(),
    socketId: socket.id,
  };

  try {
    console.log("Sending payload:", payload);
    const response = await axios.post(
      "http://localhost:4000/traqez/llm/query/stream",
      payload,
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("Server response:", response.data); // Should log { chat_id: "<some_id>" }
  } catch (error) {
    console.error(
      "Request error:",
      error.response ? error.response.data : error.message
    );
  }
});

let currentResponse = ""; // Accumulate response for display

socket.on("ai_stream", (data) => {
  currentResponse += data; // Add new chunk to response
  console.clear(); // Clear console for clean display
  console.log(currentResponse); // Print updated response
});

socket.on("stream_end", (data) => {
  console.log("\nStream ended:", data);
});

socket.on("stream_error", (data) => {
  console.log("Stream error:", data);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
});

process.stdin.resume();
