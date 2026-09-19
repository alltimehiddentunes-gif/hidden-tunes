import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTvPlayback } from "@/lib/tvProviders";

const ids = [
  "608181d420fc8500075f612a", "69492467ae33e24d916e56cf",
  "5d4947590ba40f75dc29c26b", "69b968ba255fecb01f602257",
  "6672f49f61a39900089db68e", "69b968e011fc7b9e27c0d958",
  "69a554179a3f3bb488c7d2be", "69b968ca1c36025fd0a3d92d",
  "5dc280c9aa218c0009724b4b", "5d767ae7b456c8cf265ce922",
] as const;

function capture(source: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-t", "12", "-vf", "thumbnail,scale=480:-2", "-frames:v", "1", output], { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 35_000);
    child.once("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
    child.once("error", () => { clearTimeout(timer); resolve(false); });
  });
}

async function main() {
  const directory = join(tmpdir(), "hidden-tunes-pluto-phase2-frames");
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const results = [];
  for (const [index, channelId] of ids.entries()) {
    const playback = await resolveTvPlayback({ provider: "pluto", providerChannelId: channelId, region: "CH" });
    const output = join(directory, `${String(index + 1).padStart(2, "0")}-${channelId}.jpg`);
    results.push({ channelId, canonicalName: playback.canonicalName, decoded: await capture(playback.source, output), output });
  }
  console.log(JSON.stringify({ directory, rawPlaybackUrlsEmitted: 0, results }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

