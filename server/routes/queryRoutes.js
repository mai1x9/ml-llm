// routes/queryRoutes.js
const express = require("express");
const {
  getQueryResponse,
  streamResponse,
} = require("../controllers/queryController");
const router = express.Router();

// Endpoint for full response
router.post("/query", getQueryResponse);

// Endpoint for streaming response
router.post("/query/stream", streamResponse);

router.post("/traqez/a/dashboards/ai/history", aiHistory);

module.exports = router;
