const { io } = require("socket.io-client");
const axios = require("axios");

const socket = io("http://localhost:3000", {
  reconnection: false, // Disable reconnection to run only once
});

socket.on("connect", async () => {
  console.log("Connected to WebSocket!");
  console.log("Your socketId:", socket.id);
  console.log("Use this socketId in API requests.");

  // Correct payload structure for streamResponse
  const payload = {
    text: "give summary of CVE-2024-32002",
    chat_id: null,
    socketId: socket.id,
  };

  try {
    console.log("Sending payload:", payload);
    const response = await axios.post(
      "http://localhost:3000/traqez/llm/query/stream", // Corrected endpoint
      payload,
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("Server response:", response.data); // Should log { chat_id: "<some_id>" }
  } catch (error) {
    console.error(
      "Request error:",
      error.response ? error.response.data : error.message
    );
    socket.disconnect(); // Disconnect on error
    process.exit(1); // Exit with error code
  }
});

let currentResponse = "";

socket.on("ai_stream", (data) => {
  if (data && typeof data.chunk === "string") {
    currentResponse += data.chunk;
    console.clear();
    console.log("Current response:", currentResponse);
  } else {
    console.error("Invalid ai_stream data:", data);
  }
});

socket.on("stream_end", (data) => {
  console.log("\nStream ended:", data);
  socket.disconnect(); // Disconnect after stream ends
  process.exit(0); // Exit successfully
});

socket.on("stream_error", (data) => {
  console.error("Stream error:", data);
  socket.disconnect(); // Disconnect on error
  process.exit(1); // Exit with error code
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error.message);
  process.exit(1); // Exit if connection fails
});

// No need for process.stdin.resume() since we exit explicitly
