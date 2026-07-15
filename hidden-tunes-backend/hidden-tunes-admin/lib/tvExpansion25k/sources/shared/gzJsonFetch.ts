import zlib from "node:zlib";
import { promisify } from "node:util";

import { retryFetch } from "@/lib/tvExpansion25k/sources/shared/retryFetch";

const gunzip = promisify(zlib.gunzip);

export async function fetchGzJson<T>(url: string): Promise<T> {
  const response = await retryFetch(url, {
    headers: {
      Accept: "application/json, application/gzip, application/octet-stream",
      "Accept-Encoding": "gzip",
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  let text: string;
  try {
    text = (await gunzip(buffer)).toString("utf8");
  } catch {
    text = buffer.toString("utf8");
  }

  return JSON.parse(text) as T;
}
