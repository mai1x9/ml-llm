const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Server } = require("socket.io");
const queryRoutes = require("./routes/queryRoutes");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://20.185.25.32:3000",
  "http://localhost:3001",
  "http://20.185.25.32:3001",
  "http://localhost:3002",
  "http://20.185.25.32:3002",
  "http://localhost:3003",
  "http://20.185.25.32:3003",
  "http://127.0.0.1:8080",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Middleware
app.use(bodyParser.json());
app.use("/traqez/llm", queryRoutes);

// Initialize WebSocket server
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Ensure WebSocket CORS matches API CORS
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Listen for user input from frontend
  socket.on("new-message", (message, chat_id) => {
    if (!message || !chat_id) {
      console.error("Invalid message payload received.");
      return;
    }

    const userMessage = {
      sender: "user",
      id: chat_id,
      text: message.trim(),
      timestamp: new Date(),
    };

    console.log(`User input received: ${JSON.stringify(userMessage)}`);

    // Simulate AI processing response
    let response = `AI Response: "${data}"`;

    // Send response back to frontend
    socket.emit("ai_response", response);
  });

  // Handle disconnects
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
