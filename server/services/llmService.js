const axios = require("axios");

const STREAM_API_URL = "http://localhost:11434/api/generate";

const callLLM = async (prompt, responseType = "json") => {
  const options = { model: "deepseek-r1:1.5b", prompt };
  return axios.post(STREAM_API_URL, options, { responseType });
};

module.exports = { callLLM };
