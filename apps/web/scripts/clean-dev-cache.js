const fs = require("fs");
const path = require("path");

const nextDir = path.join(process.cwd(), ".next");

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log("Removed .next directory.");
  } else {
    console.log("No .next directory to remove.");
  }
} catch (error) {
  console.warn("Could not fully remove .next directory:", error.message);
}
