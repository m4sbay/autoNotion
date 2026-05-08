require("dotenv").config();

const { updateStatuses } = require("./index");

async function main() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("Missing env NOTION_TOKEN");
  }
  if (!process.env.NOTION_DATABASE_ID) {
    throw new Error("Missing env NOTION_DATABASE_ID");
  }

  await updateStatuses();
}

main().catch((err) => {
  // Keep log succinct for GitHub Actions
  console.error("[Auto] Fatal:", err?.message || err);
  process.exitCode = 1;
});

