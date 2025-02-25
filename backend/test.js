const { io } = require("socket.io-client");

const socket = io("http://localhost:3000", {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 5000,
});

socket.on("connect", () => {
  console.log("Connected to WebSocket!");
  console.log("Your socketId:", socket.id);
  console.log("Use this socketId in API requests.");
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
