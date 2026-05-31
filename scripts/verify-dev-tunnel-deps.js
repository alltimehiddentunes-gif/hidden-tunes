/**
 * Verifies Expo SDK 54 + dev-client + @expo/ngrok before starting a tunnel session.
 * Exits 1 with actionable fixes when something is missing.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
}

function hasNgrokInstalled() {
  try {
    require.resolve("@expo/ngrok");
    return true;
  } catch {
    return false;
  }
}

function main() {
  const pkg = readPackageJson();
  const expoVersion = pkg.dependencies?.expo;
  const devClientVersion = pkg.dependencies?.["expo-dev-client"];
  const ngrokDeclared =
    pkg.devDependencies?.["@expo/ngrok"] || pkg.dependencies?.["@expo/ngrok"];

  console.log("[HiddenTunes] Expo dev tunnel preflight");
  console.log(`  expo: ${expoVersion || "MISSING"}`);
  console.log(`  expo-dev-client: ${devClientVersion || "MISSING"}`);
  console.log(`  @expo/ngrok (package.json): ${ngrokDeclared || "not declared"}`);
  console.log(`  @expo/ngrok (node_modules): ${hasNgrokInstalled() ? "OK" : "MISSING"}`);

  let failed = false;

  if (!expoVersion) {
    console.error("\nFix: install expo — npx expo install expo");
    failed = true;
  }

  if (!devClientVersion) {
    console.error("\nFix: install expo-dev-client — npx expo install expo-dev-client");
    failed = true;
  }

  if (!hasNgrokInstalled()) {
    console.error(
      "\nFix: install tunnel dependency in this project:\n" +
        "  cd hidden-tunes-app\n" +
        "  npx expo install @expo/ngrok --dev\n" +
        "\nThen retry:\n" +
        "  npm run start:dev-client:tunnel"
    );
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\nPreflight passed. Starting Metro with --dev-client --host tunnel …\n");
}

main();
