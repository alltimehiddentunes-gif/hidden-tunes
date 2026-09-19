import type { TvPlaybackSourceCandidate } from "./types";
type Refresh = (channelId: string) => Promise<TvPlaybackSourceCandidate>;
export class VerifiedTvSourceResolverCache {
  private readonly cache = new Map<string, TvPlaybackSourceCandidate>();
  private readonly inFlight = new Map<string, Promise<TvPlaybackSourceCandidate>>();
  constructor(private readonly refresh: Refresh) {}
  seed(channelId: string, source: TvPlaybackSourceCandidate) { this.cache.set(channelId, source); }
  invalidate(channelId: string, health: "VERIFIED_STALE" | "TEMPORARILY_UNAVAILABLE" | "REFRESH_REQUIRED" | "IDENTITY_INVALIDATED" | "SOURCE_INVALIDATED") { const source=this.cache.get(channelId);if(source)this.cache.set(channelId,{...source,health}); }
  async resolve(channelId: string) { const cached=this.cache.get(channelId);if(cached&&cached.health==="VERIFIED_HEALTHY"&&(!cached.freshnessExpiresAt||Date.parse(cached.freshnessExpiresAt)>Date.now()))return{source:cached,cacheHit:true,refreshed:false};let pending=this.inFlight.get(channelId);if(!pending){pending=this.refresh(channelId).then(source=>{this.cache.set(channelId,source);return source}).finally(()=>this.inFlight.delete(channelId));this.inFlight.set(channelId,pending)}return{source:await pending,cacheHit:false,refreshed:true}; }
}
