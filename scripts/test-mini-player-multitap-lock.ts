import assert from "node:assert/strict";
import { createMiniPlayerNavigationLock } from "../utils/miniPlayerNavigationLock";

type Callback = () => void;
let pending: Callback[] = [];
const schedule = (callback: Callback) => {
  pending.push(callback);
  return callback as unknown as ReturnType<typeof setTimeout>;
};
const cancel = (timer: ReturnType<typeof setTimeout>) => {
  pending = pending.filter((callback) => callback !== (timer as unknown as Callback));
};
const expire = () => {
  const callbacks = pending;
  pending = [];
  callbacks.forEach((callback) => callback());
};

const lock = createMiniPlayerNavigationLock(1500, schedule, cancel);
let navigations = 0;
const tap = (key = "metadata:/genre") => {
  if (lock.tryAcquire(key)) navigations += 1;
};

tap();
assert.equal(navigations, 1, "one tap navigates once");
tap();
assert.equal(navigations, 1, "two rapid taps navigate once");
for (let index = 0; index < 8; index += 1) tap();
assert.equal(navigations, 1, "ten rapid taps navigate once");
tap("artwork:/player");
assert.equal(navigations, 1, "artwork cannot cross-trigger while metadata navigation mounts");
assert.equal(lock.isLocked(), true);

expire();
assert.equal(lock.isLocked(), false, "bounded timeout releases the lock");
tap();
assert.equal(navigations, 2, "a later legitimate tap navigates again");

lock.dispose();
assert.equal(lock.isLocked(), false, "unmount disposal releases timer and lock");
assert.equal(pending.length, 0, "unmount leaves no timer behind");

console.log("MiniPlayer multi-tap hard-lock contract passed.");
