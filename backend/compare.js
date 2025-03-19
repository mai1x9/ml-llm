const { generateAndSavePrompts } = require("./promptGenerator");

async function comparePrompts(question) {
  try {
    const { promptWithoutMMR, promptWithMMR } = await generateAndSavePrompts(
      question
    );
    console.log("Prompt generation complete. Check the files for comparison.");
    console.log(
      "First 100 chars without MMR:",
      promptWithoutMMR.substring(0, 100)
    );
    console.log("First 100 chars with MMR:", promptWithMMR.substring(0, 100));
  } catch (error) {
    console.error("Comparison failed:", error);
  }
}

// Example usage
comparePrompts(
  "Give me a summary of all the distinct vulnerabilities in mozilla firefox with severity score more than 9?"
);
