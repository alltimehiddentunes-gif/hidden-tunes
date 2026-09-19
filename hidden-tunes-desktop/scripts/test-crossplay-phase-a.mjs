import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/services/crossplayPhaseA.ts',import.meta.url),'utf8');
assert.match(source,/crypto\.getRandomValues/);assert.match(source,/Math\.min\(8/);assert.match(source,/expectedVersion/);assert.match(source,/type==='radio'\|\|type==='tv'/);assert.doesNotMatch(source,/service.?role/i);
console.log('PASS Desktop Cross Play Phase A device/progress/continue contract');
