/** Minimal declarations for the Node 22 runtime builtin; no package or global type upgrade. */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      run(...values: Array<string | number | null>): { changes: number | bigint };
      get(...values: Array<string | number | null>): Record<string, string | number | null> | undefined;
      all(...values: Array<string | number | null>): Array<Record<string, string | number | null>>;
    };
    close(): void;
  }
}
