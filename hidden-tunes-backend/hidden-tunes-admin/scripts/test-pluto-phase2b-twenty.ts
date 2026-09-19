import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTvPlayback } from "@/lib/tvProviders";

const channels = [
  ["66c45b1803e3b20008d8c200", "CNNi"], ["5e7cb84a172a0f0007da69e4", "Red Bull TV"],
  ["660bfc032433010008def35a", "FIFA+"], ["5caf325764025859afdd6c4d", "MTV Pluto TV"],
  ["65b923f90cb1a100088a03ab", "Terra Mater WILD"], ["65b9268fc798e800085add89", "SPIEGEL TV Konflikte"],
  ["6870c9333ffa5e0c914e9205", "Tennis Channel"], ["64b67f0424ade50008a3be17", "DAZN Darts x Pluto TV"],
  ["64afe50c5dc16600087f3227", "DAZN Heldinnen x Pluto TV"], ["66337ea1307fa300082c28a0", "BVB-Frauen"],
  ["685aaec481c345899e4458bb", "Dominance FC TV"], ["6866525c8a412a0e95c438b4", "Dyn Sport Mix"],
  ["66337e6ba0a74e000889563b", "MODUS Super Series Darts"], ["5f760c3d41aa2d0007bfde19", "Auto Motor Sport"],
  ["663a15d7cb3ea10008edac88", "Farmland TV"], ["62a0b2aff4cf470007e47e29", "Fluss-Monster"],
  ["66a10384d5125900089dfd04", "Top Gear Challenge"], ["663a163f8ea5560008a3f234", "Andromeda"],
  ["6305ca798bd95300072d2f93", "Filmgold"], ["5cb5cfe5caf83414128f209e", "KultKrimi"],
] as const;
const slateHashes = ["9896530d4d230e00","4b9b3529c1463630","9c96530f2d232e00","4b9b3529c5463630","9c93534d25232600","6b8931295b443430","9c16514d6d2b2e00","c39b3d29c6463630"].map((value) => BigInt(`0x${value}`));

function hamming(a: bigint, b: bigint) { let value = a ^ b; let count = 0; while (value) { count++; value &= value - 1n; } return count; }

function decode(source: string, output: string): Promise<{ ok: boolean; hash: string | null; minSlateDistance: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-t", "12", "-vf", "thumbnail,scale=480:-2", "-frames:v", "1", output], { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 35_000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, hash: null, minSlateDistance: null });
      const hashChild = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", output, "-vf", "scale=9:8,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { windowsHide: true });
      const chunks: Buffer[] = []; hashChild.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      hashChild.once("exit", () => {
        const bytes = Buffer.concat(chunks); if (bytes.length < 72) return resolve({ ok: true, hash: null, minSlateDistance: null });
        let bits = ""; for (let y=0;y<8;y++) for(let x=0;x<8;x++) bits += bytes[y*9+x] > bytes[y*9+x+1] ? "1" : "0";
        const value = BigInt(`0b${bits}`); resolve({ ok: true, hash: value.toString(16).padStart(16,"0"), minSlateDistance: Math.min(...slateHashes.map((sample) => hamming(value, sample))) });
      });
    });
    child.once("error", () => { clearTimeout(timer); resolve({ ok: false, hash: null, minSlateDistance: null }); });
  });
}

async function main() {
  const directory = join(tmpdir(), "hidden-tunes-pluto-phase2b-20"); await rm(directory,{recursive:true,force:true}); await mkdir(directory,{recursive:true});
  const results=[];
  for (const [index,[id,expected]] of channels.entries()) {
    try { const playback=await resolveTvPlayback({provider:"pluto",providerChannelId:id,region:"DE"}); const output=join(directory,`${String(index+1).padStart(2,"0")}-${id}.jpg`); const decoded=await decode(playback.source,output); results.push({id,expected,canonicalName:playback.canonicalName,identityExact:playback.canonicalName===expected,decoded,...decoded,automaticState:decoded.ok && decoded.minSlateDistance !== null && decoded.minSlateDistance <= 8 ? "END_OF_AVAILABILITY" : decoded.ok ? "NEEDS_VISUAL_CONTENT_REVIEW" : "DEAD",output}); }
    catch(error){results.push({id,expected,decoded:false,automaticState:"UNKNOWN",error:error instanceof Error?error.message:String(error)});}
  }
  console.log(JSON.stringify({directory,rawPlaybackUrlsEmitted:0,results},null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1});
