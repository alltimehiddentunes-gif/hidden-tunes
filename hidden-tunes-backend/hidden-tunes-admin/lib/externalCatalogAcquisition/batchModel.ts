export type AcquisitionBatchStatus = "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
export const QUALIFICATION_BATCH_SIZES = [50, 100, 500, 1000, 5000] as const;
export function assertBatchSize(size: number): number { if (!Number.isInteger(size) || size < 1 || size > 5000) throw new Error("External acquisition batches must contain between 1 and 5,000 assets."); return size; }

