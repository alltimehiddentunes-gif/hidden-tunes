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
  new RegExp(`${appScriptsPath}[/\\\\].*`),
  /[/\\]node_modules[/\\]@types[/\\]\.[^/\\]+[/\\]?/,
  /[/\\]node_modules[/\\]\.pump-[^/\\]+[/\\]?/,
]);

module.exports = config;
