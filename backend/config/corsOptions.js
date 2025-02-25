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

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

module.exports = { allowedOrigins, corsOptions };
