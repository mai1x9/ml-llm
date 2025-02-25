//queryRoutes.js
const express = require("express");
const {
  getQueryResponse,
  streamResponse,
  getChatHistory,
  getChatById,
} = require("../controllers/queryController");

const router = express.Router();

router.post("/query", getQueryResponse);
router.post("/query/stream", streamResponse);
router.get("/history", getChatHistory);
router.get("/history/details", getChatById);

module.exports = router;
