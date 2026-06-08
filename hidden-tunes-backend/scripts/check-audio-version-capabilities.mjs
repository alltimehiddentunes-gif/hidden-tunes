import { getAudioVersionCapabilityReport } from "../services/audioVersionCapabilityReport.js";

function parseArgs(argv) {
  return {
    probeOnly: argv.includes("--probe-only"),
    json: argv.includes("--json"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await getAudioVersionCapabilityReport();

  if (args.json || !args.probeOnly) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (!report.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Audio version capability check failed:", error);
  process.exitCode = 1;
});
