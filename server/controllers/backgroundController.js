const backgroundService = require("../services/backgroundService");

/**
 * Handles requests to generate summaries for a cluster run in the background.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
async function generateSummaries(req, res) {
  const { clusterRunId } = req.params;

  if (!clusterRunId) {
    return res
      .status(400)
      .send("Error: clusterRunId is required in the URL path");
  }

  try {
    console.log(
      `🚀 Received request to start background summary for run: ${clusterRunId}`
    );

    // Trigger background summary generation
    backgroundService
      .generateSummariesForRun(clusterRunId)
      .then((result) => {
        if (result.status === "completed") {
          console.log(
            `✅ Summaries generated successfully for clusterRunId: ${clusterRunId}`
          );
          console.log(`📁 Summary saved at: ${result.outputFile}`);
        } else {
          console.error(`❌ Summary generation failed: ${result.message}`);
        }
      })
      .catch((error) => {
        console.error(
          `❌ Background summary generation failed for ${clusterRunId}:`,
          error
        );
      });

    // Respond immediately to the client with a friendly message
    res
      .status(202)
      .send(
        `✅ Cluster Run ID: ${clusterRunId}\nSummary generation has started in the background.\nPlease check logs or the output file once completed.`
      );
  } catch (error) {
    console.error("Error initiating summary generation:", error);
    res
      .status(500)
      .send(`❌ Failed to initiate summary generation:\n${error.message}`);
  }
}

module.exports = { generateSummaries };
