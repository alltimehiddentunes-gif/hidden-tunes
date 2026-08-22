import { createScopedActionLock, type ScopedActionLock } from "./scopedActionLock";

export type MiniPlayerNavigationLock = ScopedActionLock;
export const createMiniPlayerNavigationLock = createScopedActionLock;
