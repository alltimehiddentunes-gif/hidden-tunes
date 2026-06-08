#!/usr/bin/env node
/**
 * Gradle 9.x removed JvmVendorSpec.IBM_SEMERU. React Native gradle-plugin pins
 * foojay-resolver-convention 0.5.0, which crashes Android prebuild on Gradle 9.
 */
import fs from "fs";
import path from "path";
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

if (!fs.existsSync(target)) {
  console.log("[patch-android-gradle-foojay] skip: gradle-plugin not installed");
  process.exit(0);
}

const source = fs.readFileSync(target, "utf8");
if (source.includes(NEW)) {
  console.log("[patch-android-gradle-foojay] already patched");
  process.exit(0);
}

if (!source.includes(OLD)) {
  console.warn(
    "[patch-android-gradle-foojay] unexpected settings.gradle.kts; no patch applied"
  );
  process.exit(0);
}

fs.writeFileSync(target, source.replace(OLD, NEW));
console.log("[patch-android-gradle-foojay] bumped foojay-resolver-convention to 1.0.0");
