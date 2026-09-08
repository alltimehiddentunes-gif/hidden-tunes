import type { ReactNode } from "react";
import { useIosOperationalItemVisibility } from "../hooks/useIosOperationalPolicy";
import { iosOperationalSongRef, type IosOperationalRef } from "../services/iosOperationalPolicy";

export default function IosOperationalItemGate({ item, children }: { item: { id?: unknown; type?: unknown; source?: unknown; metadata?: Record<string, unknown> }; children: ReactNode }) {
  const savedContainer = item.type === "artist" || item.type === "album";
  const ref: IosOperationalRef | null = item.type === "radio_station"
    ? { type: String(item.metadata?.iosPolicyType || "radio_legacy_station"), id: String(item.id || "").replace(/^radio-/, "") }
    : iosOperationalSongRef(item);
  const visible = useIosOperationalItemVisibility(savedContainer ? null : ref);
  return savedContainer || visible ? children : null;
}
