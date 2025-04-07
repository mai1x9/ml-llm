// backgroundService.js
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { spawn } = require("child_process");
const config = require("../config/config");

function countTokens(text) {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", ["./services/tokenize.py", "count"]);
    let output = "";

    python.stdin.write(text);
    python.stdin.end();

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      console.error(`Python error: ${data}`);
    });

    python.on("close", (code) => {
      if (code === 0) {
        resolve(parseInt(output.trim()));
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });
}

function chunkText(text) {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", [
      "./services/tokenize.py",
      "chunk",
      config.CHUNK_TOKEN_LIMIT.toString(),
    ]);
    let output = "";

    python.stdin.write(text);
    python.stdin.end();

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      console.error(`Python error: ${data}`);
    });

    python.on("close", (code) => {
      if (code === 0) {
        resolve(JSON.parse(output.trim()));
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });
}

async function generateSummariesForRun(clusterRunId) {
  try {
    console.log(`Starting summary generation for run ID: ${clusterRunId}`);

    const clusterGroups = await getClusterGroups(clusterRunId);
    if (!clusterGroups || Object.keys(clusterGroups).length === 0) {
      throw new Error(
        `No valid cluster groups found for cluster_run_id: ${clusterRunId}`
      );
    }

    let output = [];
    for (const [clusterId, cveList] of Object.entries(clusterGroups)) {
      console.log(`Processing cluster ${clusterId} with CVEs:`, cveList);

      const start = new Date();
      const cveData = await getCveData(cveList);
      const question = constructPrompt(cveData); // Original prompt
      const tokenCount = await countTokens(question); // Token count of original prompt
      console.log(`Token count for cluster ${clusterId}: ${tokenCount}`);

      let summaryResult;
      let chunked = false;
      if (tokenCount <= config.CHUNK_TOKEN_LIMIT) {
        summaryResult = await generateClusterSummary(cveList);
      } else {
        chunked = true;
        const chunks = await chunkText(question);
        console.log(`Split cluster ${clusterId} into ${chunks.length} chunks`);

        const chunkSummaries = await Promise.all(
          chunks.map(async (chunk, index) => {
            const chunkTokenCount = await countTokens(chunk);
            console.log(
              `Processing chunk ${index + 1} with ${chunkTokenCount} tokens`
            );
            const { summary, tokenInput, tokenOutput } = await generateSummary(
              chunk
            );
            return { summary, tokenInput, tokenOutput };
          })
        );

        const combinedPrompt = `Combine the following ${
          chunks.length
        } summaries into a detailed yet concise overall summary. Ensure that key points from each summary are preserved while avoiding unnecessary repetition:\n${chunkSummaries
          .map((s, i) => `${i + 1}. ${s.summary}`)
          .join("\n")}`;
        summaryResult = await generateSummary(combinedPrompt);

        summaryResult.tokenInput =
          chunkSummaries.reduce((sum, s) => sum + s.tokenInput, 0) +
          summaryResult.tokenInput;
        summaryResult.tokenOutput =
          chunkSummaries.reduce((sum, s) => sum + s.tokenOutput, 0) +
          summaryResult.tokenOutput;
      }

      const { summary, tokenInput, tokenOutput } = summaryResult;
      const end = new Date();
      const duration = (end - start) / 1000;
      const size = Buffer.byteLength(summary, "utf8") / 1024;

      const options = {
        model: config.MODEL_NAME,
        num_ctx: config.MAX_TOKENS,
      };

      output.push({
        cluster: clusterId,
        cve: cveList,
        llm: summary,
        start: start.toISOString(),
        end: end.toISOString(),
        duration,
        options,
        question, // Original prompt
        original_token_count: tokenCount, // Token count of original prompt
        chunked, // True if chunked, false otherwise
        token_input: tokenInput, // Total input tokens used
        token_output: tokenOutput, // Total output tokens
        size,
      });
    }

    const outputFile = path.join(
      config.SUMMARY_OUTPUT_DIR,
      `summary_run1_${clusterRunId}.json`
    );
    await fs.writeFile(outputFile, JSON.stringify(output, null, 2));

    console.log(`✅ Summary saved to: ${outputFile}`);
    return { status: "completed", outputFile, data: output };
  } catch (error) {
    console.error(`❌ Failed for ${clusterRunId}:`, error);
    return { status: "failed", message: error.message };
  }
}

async function getClusterGroups(clusterRunId) {
  try {
    console.log(`Reading clustering data from: ${config.CLUSTERING_DATA_FILE}`);
    const fileContent = await fs.readFile(config.CLUSTERING_DATA_FILE, "utf8");
    const clusteringData = JSON.parse(fileContent);
    console.log("Clustering data:", JSON.stringify(clusteringData, null, 2));

    const data = clusteringData.data || clusteringData;
    if (!data || typeof data !== "object") {
      throw new Error(
        `Invalid clustering data structure for run ID: ${clusterRunId}`
      );
    }
    console.log("Extracted data:", JSON.stringify(data, null, 2));

    const clusterGroups = {};
    for (const key in data) {
      if (config.EXCLUDED_CLUSTER_KEYS.includes(key)) {
        console.log(`Skipping excluded key: ${key}`);
        continue;
      }
      if (!isNaN(Number(key))) {
        console.log(`Processing cluster key: ${key}`);
        const cveList = data[key];
        if (Array.isArray(cveList)) {
          clusterGroups[key] = cveList;
        } else {
          console.warn(`Invalid CVE list for key ${key}:`, cveList);
        }
      } else {
        console.log(`Ignoring non-numeric key: ${key}`);
      }
    }

    if (Object.keys(clusterGroups).length === 0) {
      throw new Error(
        `No valid cluster groups found for cluster_run_id: ${clusterRunId}`
      );
    }

    console.log("Cluster groups extracted:", clusterGroups);
    return clusterGroups;
  } catch (error) {
    console.error(
      `Error in getClusterGroups for run ${clusterRunId}:`,
      error.message
    );
    throw error;
  }
}

async function getCveData(cveIds) {
  try {
    console.log(`Reading CVE data from: ${config.CVE_DATA_FILE}`);
    const fileContent = await fs.readFile(config.CVE_DATA_FILE, "utf8");
    const cveData = JSON.parse(fileContent);

    // Check if 'results' key exists and is an array
    const allCveData = cveData.results || cveData;
    if (!Array.isArray(allCveData)) {
      throw new Error(`CVE data is not an array: ${typeof allCveData}`);
    }

    // Filter and restructure CVE entries to include only specified keys
    const filteredCveData = allCveData
      .filter(
        (cve) =>
          cve.cve &&
          Array.isArray(cve.cve) &&
          cve.cve.some((id) => cveIds.includes(id))
      )
      .map((cve) => ({
        cve_id: cve.cve[0], // Take the first CVE ID from the array
        name: cve.name || "",
        description: cve.description || "",
        severity: cve.severity || "",
        product: cve.product || "",
        version: cve.version || "",
        mitigation: cve.mitigation || "",
      }));

    return filteredCveData;
  } catch (error) {
    console.error("Error in getCveData:", error.message);
    throw error;
  }
}

async function generateSummary(prompt) {
  try {
    const response = await axios.post(
      config.STREAM_API_URL,
      {
        model: config.MODEL_NAME,
        prompt,
        options: { num_ctx: config.MAX_TOKENS },
      },
      { responseType: "stream" }
    );

    let summary = "";
    let tokenInput = 0;
    let tokenOutput = 0;

    return new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        try {
          const jsonChunk = JSON.parse(chunk.toString());
          if (jsonChunk.response) {
            summary += jsonChunk.response;
          }
          if (jsonChunk.done) {
            tokenInput = jsonChunk.prompt_eval_count || 0;
            tokenOutput = jsonChunk.eval_count || 0;
          }
        } catch (err) {
          console.error("Failed to parse JSON chunk:", err);
        }
      });

      response.data.on("end", () => {
        resolve({ summary: summary.trim(), tokenInput, tokenOutput });
      });
      response.data.on("error", (err) => reject(err));
    });
  } catch (error) {
    if (error.response && error.response.status === 413) {
      throw new Error("Prompt too large");
    }
    console.error("Error generating summary:", error);
    throw new Error("Failed to generate summary from Ollama API");
  }
}

async function generateClusterSummary(cveList) {
  const cveData = await getCveData(cveList);
  const prompt = constructPrompt(cveData);

  try {
    const { summary, tokenInput, tokenOutput } = await generateSummary(prompt);
    return { summary, tokenInput, tokenOutput };
  } catch (error) {
    if (error.message === "Prompt too large" && cveList.length > 1) {
      const mid = Math.floor(cveList.length / 2);
      const left = await generateClusterSummary(cveList.slice(0, mid));
      const right = await generateClusterSummary(cveList.slice(mid));
      const combinedPrompt = `Combine the following two summaries into a detailed yet concise overall summary. Ensure that key points from each summary are preserved while avoiding unnecessary repetition:\n1. ${left.summary}\n2. ${right.summary}`;
      const { summary, tokenInput, tokenOutput } = await generateSummary(
        combinedPrompt
      );
      return {
        summary,
        tokenInput: left.tokenInput + right.tokenInput + tokenInput,
        tokenOutput: left.tokenOutput + right.tokenOutput + tokenOutput,
      };
    }
    throw error;
  }
}

function constructPrompt(cveData) {
  const jsonData = JSON.stringify(cveData, null, 2);
  const prompt = `
Summarize the key vulnerabilities from the JSON data below. Instead of listing each CVE separately, merge the information to produce one high-level summary focusing on:
- Vulnerability names
- Severity levels
- Affected systems
- Brief descriptions

Combine similar descriptions into a cohesive narrative and ignore redundant or irrelevant details. Use keywords such as "CVE", "exploit", and "patch" for guidance. If fewer than 10 critical vulnerabilities are present, provide a concise paragraph summary. Additionally, include actionable recommendations, specifying the product version that should be updated to mitigate these vulnerabilities.

JSON Data:
${jsonData}
  `;
  return prompt.trim();
}

module.exports = { generateSummariesForRun };
