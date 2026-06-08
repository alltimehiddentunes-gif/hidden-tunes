#!/usr/bin/env node
/**
 * Gradle 9.x removed JvmVendorSpec.IBM_SEMERU. React Native gradle-plugin pins
 * foojay-resolver-convention 0.5.0, which crashes Android prebuild on Gradle 9.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native",
  "gradle-plugin",
  "settings.gradle.kts"
);
const OLD =
  'id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")';
const NEW =
  'id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")';

const androidGradleProperties = path.join(__dirname, "..", "android", "gradle.properties");

function hasExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findLinuxJdkWithCompiler() {
  if (process.platform !== "linux") return null;

  const home = os.homedir();
  const roots = [
    path.join(home, ".gradle", "jdks"),
    path.join(home, ".jdks"),
    "/usr/lib/jvm",
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const candidates = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => path.join(root, entry.name))
      .sort();

    for (const candidate of candidates) {
      if (
        hasExecutable(path.join(candidate, "bin", "java")) &&
        hasExecutable(path.join(candidate, "bin", "javac"))
      ) {
        return candidate;
      }
    }
  }

  return null;
}

function ensureAndroidGradleJavaHome() {
  if (!fs.existsSync(androidGradleProperties)) return;
  const jdk = findLinuxJdkWithCompiler();
  if (!jdk) return;

  const source = fs.readFileSync(androidGradleProperties, "utf8");
  const line = `org.gradle.java.home=${jdk}`;
  const existing = /^org\.gradle\.java\.home=.*$/m;
  let next = source;

  if (existing.test(source)) {
    next = source.replace(existing, line);
  } else {
    next = source.replace(
      /^(org\.gradle\.jvmargs=.*)$/m,
      `$1
${line}`
    );
  }

  if (next !== source) {
    fs.writeFileSync(androidGradleProperties, next);
    console.log(`[patch-android-gradle-foojay] pinned Gradle Java home to ${jdk}`);
  }
}

if (!fs.existsSync(target)) {
  console.log("[patch-android-gradle-foojay] skip: gradle-plugin not installed");
  ensureAndroidGradleJavaHome();
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (source.includes(NEW)) {
  console.log("[patch-android-gradle-foojay] already patched");
  ensureAndroidGradleJavaHome();
  process.exit(0);
}

if (!source.includes(OLD)) {
  console.warn(
    "[patch-android-gradle-foojay] unexpected settings.gradle.kts; no patch applied"
  );
  ensureAndroidGradleJavaHome();
  process.exit(0);
}

fs.writeFileSync(target, source.replace(OLD, NEW));
console.log("[patch-android-gradle-foojay] bumped foojay-resolver-convention to 1.0.0");
ensureAndroidGradleJavaHome();
