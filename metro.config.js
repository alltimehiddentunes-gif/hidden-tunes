const { getDefaultConfig } = require("expo/metro-config");
const exclusionList =
  require("metro-config/private/defaults/exclusionList").default;
const path = require("path");

const config = getDefaultConfig(__dirname);
const appScriptsPath = path
  .join(__dirname, "scripts")
  .replace(/[/\\]/g, "[/\\\\]");

config.maxWorkers = 1;
if (process.env.EXPO_PUBLIC_METRO_HARNESS === "1") {
  const fs = require("fs");
  const log = path.join(__dirname, ".expo", "metro-harness.jsonl");
  const linkedNodeModules = fs.realpathSync.native(path.join(__dirname, "node_modules"));
  const linkedRoot = path.dirname(linkedNodeModules);
  const linkedPrefix = `./${path.basename(linkedRoot)}/node_modules/`;
  config.watchFolders = [...config.watchFolders, linkedRoot];
  const upstreamResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Expo's release-mode Hermes chunk loader can serialize this junction's
    // physical sibling path as if it were relative to the diagnostic root.
    const target = moduleName.startsWith(linkedPrefix)
      ? path.join(linkedNodeModules, moduleName.slice(linkedPrefix.length))
      : moduleName;
    return (upstreamResolve || context.resolveRequest)(context, target, platform);
  };
  fs.mkdirSync(path.dirname(log), { recursive: true });
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => (req, res, next) => {
      // The installed 1.0.216 dev client requests release-mode JS from Metro.
      // Lazy production chunks require a web location, which native Hermes lacks.
      // Keep the physical-device diagnostic bundle self-contained.
      if (req.url?.startsWith("/index.bundle?") && /[?&]platform=ios(?:&|$)/.test(req.url) && /[?&]dev=false(?:&|$)/.test(req.url)) {
        req.url = req.url.replace(/([?&])lazy=true(?=&|$)/, "$1lazy=false");
      }
      if (req.url !== "/__ht_harness") return middleware(req, res, next);
      if (req.method !== "POST") { res.writeHead(405); return res.end(); }
      let body = "";
      req.on("data", (chunk) => { body += chunk; if (body.length > 65536) req.destroy(); });
      req.on("end", () => {
        try {
          const entries = JSON.parse(body);
          if (!Array.isArray(entries) || entries.length > 100) throw new Error("Invalid batch");
          const safe = entries.map(({ at, sequence, event, details }) => {
            if (typeof event !== "string" || !/^[a-zA-Z0-9_]{1,100}$/.test(event)) throw new Error("Invalid event");
            return { receivedAt: new Date().toISOString(), at, sequence, event, details };
          });
          fs.appendFile(log, safe.map((entry) => JSON.stringify(entry)).join("\n") + "\n", () => {});
          res.writeHead(204); res.end();
        } catch { res.writeHead(400); res.end(); }
      });
    },
  };
}
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
