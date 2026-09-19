import { readFile, writeFile } from "node:fs/promises";

function synchsafe(value: number) {
  return Buffer.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

async function main() {
  const sourcePath = process.argv[2];
  const outputPath = process.argv[3];
  if (!sourcePath || !outputPath) throw new Error("Pass source and output paths.");

  const audio = await readFile(sourcePath);
  const lyricText = "Embedded fixture line one\nEmbedded fixture line two";
  const framePayload = Buffer.concat([
    Buffer.from([3]),
    Buffer.from("eng", "ascii"),
    Buffer.from([0]),
    Buffer.from(lyricText, "utf8"),
  ]);
  const frameHeader = Buffer.concat([
    Buffer.from("USLT", "ascii"),
    synchsafe(framePayload.length),
    Buffer.from([0, 0]),
  ]);
  const tagBody = Buffer.concat([frameHeader, framePayload]);
  const tagHeader = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.from([4, 0, 0]),
    synchsafe(tagBody.length),
  ]);
  await writeFile(outputPath, Buffer.concat([tagHeader, tagBody, audio]));
  console.log(JSON.stringify({ created: true, outputPath, lyricCharacters: lyricText.length, lyricLines: 2 }));
}

void main();
