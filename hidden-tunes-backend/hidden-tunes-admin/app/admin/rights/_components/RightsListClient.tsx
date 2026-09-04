"use client";

import { useEffect, useState } from "react";

import { getActiveUploaderSession } from "@/lib/auth";

export default function RightsListClient({ endpoint, collection, empty }: { endpoint: string; collection: string; empty: string }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void getActiveUploaderSession().then(async ({ session }) => {
      if (!session || controller.signal.aborted) return;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(body.error ?? "Unable to load rights data."));
      if (!controller.signal.aborted) setItems((body[collection] as Record<string, unknown>[]) ?? []);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [collection, endpoint]);
  if (error) return <p className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">{error}</p>;
  if (items.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-white/55">{empty}</p>;
  return <div className="space-y-3">{items.map((item, index) => <article key={String(item.id ?? index)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><pre className="overflow-auto whitespace-pre-wrap text-xs text-white/70">{JSON.stringify(item, null, 2)}</pre></article>)}</div>;
}

