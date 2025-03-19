const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const chatRoutes = require("./routes/chatRoutes");
const { corsOptions } = require("./config/corsOptions");
const chatService = require("./services/chatService");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/traqez/llm", chatRoutes);

// Socket.IO setup
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
chatService.initializeSocket(io); // Updated to call a method from chatService
app.set("io", io);

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
