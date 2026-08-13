/**
 * Stale TypeScript entry previously competed with index.js.
 * Node/Expo resolve `./plugins/hidden-audio` to index.js; keep this file as a thin re-export
 * so accidental TS imports cannot load the old partial plugin.
 */
// This shim is evaluated only by Node/Expo build tooling. Keep the CommonJS
// global local to this file instead of adding Node globals to the mobile runtime.
declare const module: { exports: unknown };
// eslint-disable-next-line @typescript-eslint/no-require-imports
module.exports = require("./index.js");
