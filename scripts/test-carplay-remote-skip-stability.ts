import assert from "node:assert/strict";
import fs from "node:fs";

import { createRemoteTransportSkipGate } from "../services/playback/remoteTransportSkipGate";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function testRapidCommandsDoNotQueue() {
  const gate = createRemoteTransportSkipGate();
  const transition = deferred();
  let calls = 0;
  const run = () =>
    gate.run({
      direction: "next",
      owner: "shared-audio",
      isOwnerCurrent: () => true,
      action: async () => {
        calls += 1;
        await transition.promise;
      },
    });

  const first = run();
  const duplicates = await Promise.all(Array.from({ length: 19 }, run));
  assert.equal(calls, 1, "rapid commands execute one transition");
  assert.deepEqual(
    duplicates,
    Array.from({ length: 19 }, () => "dropped"),
    "duplicates are discarded rather than queued"
  );
  transition.resolve();
  assert.equal(await first, "completed");

  assert.equal(await run(), "completed", "later legitimate command is accepted");
  assert.equal(calls, 2);
  gate.dispose();
}

async function testConflictingDirectionsAndOwnerSwitch() {
  const gate = createRemoteTransportSkipGate();
  const transition = deferred();
  let owner = "shared-audio";
  const next = gate.run({
    direction: "next",
    owner,
    isOwnerCurrent: () => owner === "shared-audio",
    action: () => transition.promise,
  });
  assert.equal(
    await gate.run({
      direction: "previous",
      owner,
      isOwnerCurrent: () => owner === "shared-audio",
      action: async () => assert.fail("conflicting command must not execute"),
    }),
    "dropped"
  );
  transition.resolve();
  await next;

  owner = "tv";
  assert.equal(
    await gate.run({
      direction: "next",
      owner: "shared-audio",
      isOwnerCurrent: () => owner === "shared-audio",
      action: async () => assert.fail("stale owner must not execute"),
    }),
    "stale_owner"
  );
  gate.dispose();
}

function testIntegrationContracts() {
  const player = fs.readFileSync("context/PlayerContext.tsx", "utf8");
  const native = fs.readFileSync(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift",
    "utf8"
  );
  const tv = fs.readFileSync("services/tv/tvRemoteTransport.ts", "utf8");

  assert.match(player, /remoteTransportSkipGateRef\.current\.run\(/);
  assert.match(player, /await dispatchTvRemoteTransportCommand\(mapped\)/);
  assert.match(player, /return subscribeHiddenAudioDiagnostics/);
  assert.match(native, /if remoteCommandsRegistered \{ return \}/);
  assert.match(native, /remoteCommandsRegistered = true/);
  assert.match(tv, /await api\.nextChannel\?\.\(\)/);
  assert.match(tv, /await api\.previousChannel\?\.\(\)/);
}

async function main() {
  await testRapidCommandsDoNotQueue();
  await testConflictingDirectionsAndOwnerSwitch();
  testIntegrationContracts();
  console.log("carplay-remote-skip-stability: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
