const express = require("express");
const {
  getQueryResponse,
  streamResponse,
  getChatHistory,
  getChatById,
} = require("../controllers/chatController");
const { generateSummaries } = require("../controllers/backgroundController");

const router = express.Router();

// Existing routes (unchanged)
router.post("/query", getQueryResponse);
router.post("/query/stream", streamResponse);
router.get("/history", getChatHistory);
router.get("/history/details", getChatById);

// Updated route for background summary generation (kept as GET)
router.get("/background/:clusterRunId", generateSummaries);

module.exports = router;
