import fs from "node:fs";
import path from "node:path";

const ACTIVE_WAVE_FILE = "data/tv-expansion-25k/active-wave.json";

export type ExpansionActiveWave = 2 | 3 | 4;

export function getExpansionActiveWave(adminRoot = process.cwd()): ExpansionActiveWave {
  const filePath = path.join(adminRoot, ACTIVE_WAVE_FILE);
  if (!fs.existsSync(filePath)) return 2;
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as { wave?: number };
    if (payload.wave === 4) return 4;
    if (payload.wave === 3) return 3;
    return 2;
  } catch {
    return 2;
  }
}

export function setExpansionActiveWave(wave: ExpansionActiveWave, adminRoot = process.cwd()) {
  const filePath = path.join(adminRoot, ACTIVE_WAVE_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ wave, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}
