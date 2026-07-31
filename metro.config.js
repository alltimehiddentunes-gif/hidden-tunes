const { getDefaultConfig } = require("expo/metro-config");
const exclusionList =
  require("metro-config/private/defaults/exclusionList").default;
const path = require("path");

const config = getDefaultConfig(__dirname);
const appScriptsPath = path
  .join(__dirname, "scripts")
  .replace(/[/\\]/g, "[/\\\\]");

config.maxWorkers = 1;
config.resolver.blockList = exclusionList([
  /[/\\]\.expo[/\\].*/,
  /[/\\]\.git[/\\].*/,
  // IPA/IPA-probe dumps under audit/release — watching them crashes Metro when
  // probe folders are deleted mid-session (ENOENT on watch).
  /[/\\]audit[/\\]release[/\\].*/,
  new RegExp(`${appScriptsPath}[/\\\\].*`),
  /[/\\]node_modules[/\\]@types[/\\]\.[^/\\]+[/\\]?/,
  /[/\\]node_modules[/\\]\.pump-[^/\\]+[/\\]?/,
]);

module.exports = config;
