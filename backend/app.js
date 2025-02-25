//app.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const queryRoutes = require("./routes/queryRoutes");
const { allowedOrigins, corsOptions } = require("./config/corsOptions");
const socketService = require("./services/socketService");

const app = express();
const server = http.createServer(app);

app.use(cors(corsOptions));
app.use(express.json());
app.use("/traqez/llm", queryRoutes);

// Initialize WebSocket server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection_error", (err) => {
  console.error("Socket.IO Connection Error:", err.message);
});

// Attach WebSocket event handlers
socketService(io);

// Store io instance globally if needed elsewhere
app.set("io", io);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
