import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = fs.readFileSync(
  path.join(root, "deployment/nginx/api.hiddentunes.com.conf"),
  "utf8"
);

assert.match(config, /server_name api\.hiddentunes\.com/);
assert.match(
  config,
  /location ~ \^\/api\/podcasts\/\(tree.*category.*show.*search.*play/
);
assert.match(
  config,
  /location ~ \^\/api\/\(tv.*audiobooks.*podcasts.*radio.*lectures.*motivation.*music\/emotional-worlds/
);

const compatibilityLocation = config.slice(
  config.indexOf("location ~ ^/api/("),
  config.indexOf("location / {")
);
assert.match(compatibilityLocation, /proxy_pass http:\/\/127\.0\.0\.1:3000/);
assert.doesNotMatch(compatibilityLocation, /proxy_pass http:\/\/127\.0\.0\.1:3100/);

const legacyPodcastLocation = config.slice(
  config.indexOf("location ~ ^/api/podcasts/"),
  config.indexOf("# Multi-family compatibility")
);
assert.match(legacyPodcastLocation, /proxy_pass http:\/\/127\.0\.0\.1:3100/);

const defaultLocation = config.slice(config.indexOf("location / {"));
assert.match(defaultLocation, /proxy_pass http:\/\/127\.0\.0\.1:3100/);

console.log("test-cross-family-api-proxy-contract: PASS");
