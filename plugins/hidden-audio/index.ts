/**
 * Stale TypeScript entry previously competed with index.js.
 * Node/Expo resolve `./plugins/hidden-audio` to index.js; keep this file as a thin re-export
 * so accidental TS imports cannot load the old partial plugin.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
module.exports = require("./index.js");
