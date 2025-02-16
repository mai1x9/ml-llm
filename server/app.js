// app.js
const express = require("express");
const bodyParser = require("body-parser");
const queryRoutes = require("./routes/queryRoutes");

const app = express();

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Mount API routes under /api
app.use("/api", queryRoutes);

const PORT = process.env.PORT || 8010;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
