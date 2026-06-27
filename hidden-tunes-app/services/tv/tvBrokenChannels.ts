const brokenChannelIds = new Set<string>();

export function markTvChannelBroken(channelId: string) {
  if (!channelId) return;
  brokenChannelIds.add(channelId);
}

export function clearTvChannelBroken(channelId: string) {
  brokenChannelIds.delete(channelId);
}

export function isTvChannelMarkedBroken(channelId: string) {
  return brokenChannelIds.has(channelId);
}
