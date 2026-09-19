import type { ExternalCatalogSourceAdapter, ResolvedMedia, SourceMetadata } from "../sourceAdapter";
import type { DiscoveredSourceItem, RightsEvaluationInput, SourceDiscoveryRequest, SourceHealth, SourceRateLimitPolicy } from "../types";

const DEFAULT_BASE_URL = "https://play.dogmazic.net";
const API_VERSION = "600000";
const USER_AGENT = "HiddenTunes-ExternalCatalog-Qualification/0.1 (+rights-review; no-publish)";
const LICENSE_EVIDENCE_URL = "https://dogmazic.net/licences.php?lang=en";
const MAX_DISCOVERY_LIMIT = 100;

type FetchLike = typeof fetch;
type JsonObject = Record<string, unknown>;
type NamedReference = { id?: string; name?: string; basename?: string | null };
type GenreReference = { id?: string; name?: string };

type AmpacheLicense = {
  id: string;
  name: string;
  description: string;
  external_link: string;
};

type AmpacheSong = {
  id: string;
  title?: string | null;
  name?: string | null;
  artist?: NamedReference;
  album?: NamedReference;
  composer?: string | null;
  songwriter?: string | null;
  lyricist?: string | null;
  copyright?: string | null;
  description?: string | null;
  sourceCredits?: string | null;
  originalWorkDeclaration?: string | null;
  genre?: GenreReference[];
  time?: number;
  year?: number;
  format?: string | null;
  bitrate?: number | null;
  rate?: number | null;
  mime?: string | null;
  size?: number | null;
  art?: string | null;
  license?: string | null;
  language?: string | null;
  url?: string | null;
};

type DiscoveryCursor = { offsets: Record<string, number> };
export type DogmazicDiscoveryPage = { items: readonly DiscoveredSourceItem[]; nextCursor: string | null };
export type DogmazicProviderCapabilities = {
  api: "AMPACHE";
  pagination: true;
  resumable: true;
  maxBatchSize: 100;
  licenseFilteredDiscovery: true;
  mediaResolution: "EPHEMERAL";
};

export type DogmazicAdapterOptions = {
  apiKey: string;
  enabled?: boolean;
  allowMediaResolution?: boolean;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
};

const ACCEPTED_LICENSE_NAMES = new Set([
  "Creative Commons - by 2.0",
  "Creative Commons - by 2.5",
  "Creative Commons - by 3.0",
  "Creative Commons - by 4.0",
  "Licence Creative Commons 0",
  "Domaine Public",
]);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Dogmazic schema error: missing ${field}.`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Dogmazic schema error: ${context} is not an object.`);
  return value as JsonObject;
}

function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Dogmazic schema error: ${context} is not an array.`);
  return value;
}

function normalizeUrlForComparison(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^http:/, "https:").replace(/\/$/, "");
  }
}

function encodeCursor(cursor: DiscoveryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value?: string | null): DiscoveryCursor {
  if (!value) return { offsets: {} };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const object = asObject(parsed, "cursor");
    const offsets = asObject(object.offsets, "cursor offsets");
    const clean: Record<string, number> = {};
    for (const [id, offset] of Object.entries(offsets)) {
      if (!/^\d+$/.test(id) || !Number.isInteger(offset) || Number(offset) < 0) throw new Error("invalid cursor value");
      clean[id] = Number(offset);
    }
    return { offsets: clean };
  } catch {
    throw new Error("Invalid Dogmazic discovery cursor.");
  }
}

function licenseIdentifier(license: AmpacheLicense): string {
  const name = license.name.toLowerCase();
  const ccBy = name.match(/^creative commons - by (\d\.\d)$/);
  if (ccBy) return `CC-BY-${ccBy[1]}`;
  if (name === "licence creative commons 0") return "CC0-1.0";
  if (name === "domaine public") return "PUBLIC-DOMAIN";
  return `DOGMAZIC-LICENSE-${license.id}`;
}

function parseLicense(value: unknown): AmpacheLicense {
  const item = asObject(value, "license");
  return {
    id: requiredString(item.id, "license.id"),
    name: requiredString(item.name, "license.name"),
    description: optionalString(item.description) || "",
    external_link: optionalString(item.external_link) || "",
  };
}

function parseSong(value: unknown): AmpacheSong {
  const item = asObject(value, "song");
  const id = requiredString(item.id, "song.id");
  const title = optionalString(item.title) || optionalString(item.name);
  if (!title) throw new Error(`Dogmazic schema error: song ${id} has no title.`);
  const artist = asObject(item.artist, `song ${id} artist`) as NamedReference;
  if (!optionalString(artist.name)) throw new Error(`Dogmazic schema error: song ${id} has no artist.`);
  const album = item.album == null ? undefined : asObject(item.album, `song ${id} album`) as NamedReference;
  const genre = item.genre == null ? [] : asArray(item.genre, `song ${id} genre`).map((entry) => asObject(entry, `song ${id} genre entry`) as GenreReference);
  return { ...item, id, title, artist, album, genre } as AmpacheSong;
}

function safeSongMetadata(song: AmpacheSong, license: AmpacheLicense, baseUrl: string): SourceMetadata {
  return {
    provider: "dogmazic",
    sourceItemId: song.id,
    sourceUrl: `${baseUrl}/song.php?action=show_song&song_id=${encodeURIComponent(song.id)}`,
    title: optionalString(song.title) || optionalString(song.name),
    artist: optionalString(song.artist?.name),
    artistId: optionalString(song.artist?.id),
    album: optionalString(song.album?.name),
    albumId: optionalString(song.album?.id),
    composer: optionalString(song.composer),
    songwriter: optionalString(song.songwriter),
    lyricist: optionalString(song.lyricist),
    copyright: optionalString(song.copyright),
    description: optionalString(song.description),
    sourceCredits: optionalString(song.sourceCredits),
    originalWorkDeclaration: optionalString(song.originalWorkDeclaration),
    genres: (song.genre || []).map((entry) => optionalString(entry.name)).filter((entry): entry is string => Boolean(entry)),
    durationSeconds: Number.isFinite(song.time) ? Number(song.time) : null,
    year: Number.isFinite(song.year) && Number(song.year) > 0 ? Number(song.year) : null,
    format: optionalString(song.format),
    contentType: optionalString(song.mime),
    bitrate: Number.isFinite(song.bitrate) ? Number(song.bitrate) : null,
    sampleRate: Number.isFinite(song.rate) ? Number(song.rate) : null,
    byteSize: Number.isFinite(song.size) ? Number(song.size) : null,
    artworkUrl: optionalString(song.art),
    language: optionalString(song.language),
    licenseId: license.id,
    licenseName: license.name,
    licenseIdentifier: licenseIdentifier(license),
    licenseUrl: license.external_link || optionalString(song.license),
    licenseEvidenceUrl: LICENSE_EVIDENCE_URL,
    mediaResolutionRequired: true,
  };
}

function attributionText(metadata: SourceMetadata, license: AmpacheLicense): string {
  const creator = optionalString(metadata.artist) || "Unknown artist";
  const title = optionalString(metadata.title) || "Untitled";
  const licenseUrl = license.external_link || LICENSE_EVIDENCE_URL;
  return `${creator} — ${title}; ${license.name}; ${licenseUrl}`;
}

export class DogmazicAdapter implements ExternalCatalogSourceAdapter {
  readonly providerId = "dogmazic" as const;
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly allowMediaResolution: boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private session: { token: string; expiresAt: number } | null = null;
  private licenses: AmpacheLicense[] | null = null;
  private readonly songs = new Map<string, { song: AmpacheSong; license: AmpacheLicense }>();
  private nextRequestAt = 0;

  constructor(options: DogmazicAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    this.enabled = options.enabled === true;
    this.allowMediaResolution = options.allowMediaResolution === true;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || (() => new Date());
    this.sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  rateLimitPolicy(): SourceRateLimitPolicy {
    return { maxConcurrency: 1, minimumDelayMs: 1100, maxRetries: 3 };
  }

  providerCapabilities(): DogmazicProviderCapabilities {
    return { api: "AMPACHE", pagination: true, resumable: true, maxBatchSize: 100, licenseFilteredDiscovery: true, mediaResolution: "EPHEMERAL" };
  }

  resumeCursor(page: DogmazicDiscoveryPage): string | null {
    return page.nextCursor;
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = this.now().toISOString();
    if (!this.enabled) return { providerId: this.providerId, enabled: false, reachable: false, checkedAt, reason: "Dogmazic adapter is disabled by feature flag." };
    if (!this.apiKey) return { providerId: this.providerId, enabled: true, reachable: false, checkedAt, reason: "DOGMAZIC_API_KEY is required." };
    try {
      await this.getAcceptedLicenses();
      return { providerId: this.providerId, enabled: true, reachable: true, checkedAt };
    } catch (error) {
      return { providerId: this.providerId, enabled: true, reachable: false, checkedAt, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async discover(request: SourceDiscoveryRequest): Promise<readonly DiscoveredSourceItem[]> {
    return (await this.discoverPage(request)).items;
  }

  async discoverPage(request: SourceDiscoveryRequest): Promise<DogmazicDiscoveryPage> {
    this.assertEnabled();
    if (request.query) throw new Error("Dogmazic qualification discovery is license-filtered; free-text queries are not enabled.");
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_DISCOVERY_LIMIT) throw new Error("Dogmazic discovery limit must be between 1 and 100.");
    const licenses = await this.getAcceptedLicenses();
    const cursor = decodeCursor(request.cursor);
    const items: DiscoveredSourceItem[] = [];
    const perLicense = Math.max(1, Math.ceil(request.limit / licenses.length));

    for (const license of licenses) {
      if (items.length >= request.limit) break;
      const offset = cursor.offsets[license.id] || 0;
      const limit = Math.min(perLicense, request.limit - items.length);
      const response = await this.apiRequest("license_songs", { filter: license.id, offset: String(offset), limit: String(limit), sort: "id,DESC" });
      const songs = asArray(response.song, `license ${license.id} songs`).map(parseSong);
      for (const song of songs) {
        const songLicense = this.matchSongLicense(song, licenses) || license;
        if (!ACCEPTED_LICENSE_NAMES.has(songLicense.name)) throw new Error(`Dogmazic fail-closed: unexpected license ${songLicense.name} in accepted-license response.`);
        this.songs.set(song.id, { song, license: songLicense });
        const metadata = safeSongMetadata(song, songLicense, this.baseUrl);
        items.push({ sourceItemId: song.id, sourceUrl: requiredString(metadata.sourceUrl, "normalized sourceUrl"), title: optionalString(metadata.title), artist: optionalString(metadata.artist), metadata });
      }
      cursor.offsets[license.id] = offset + songs.length;
    }

    if (items.length !== request.limit) throw new Error(`Dogmazic returned ${items.length} items for requested dry batch of ${request.limit}; refusing a partial silent result.`);
    return { items, nextCursor: encodeCursor(cursor) };
  }

  async fetchItem(sourceItemId: string): Promise<SourceMetadata> {
    return this.fetchMetadata(sourceItemId);
  }

  async fetchMetadata(sourceItemId: string): Promise<SourceMetadata> {
    const entry = await this.getSong(sourceItemId);
    return safeSongMetadata(entry.song, entry.license, this.baseUrl);
  }

  async fetchRights(sourceItemId: string): Promise<RightsEvaluationInput> {
    const { song, license } = await this.getSong(sourceItemId);
    const metadata = safeSongMetadata(song, license, this.baseUrl);
    const isPublicDomain = license.name === "Domaine Public";
    const isCc0 = license.name === "Licence Creative Commons 0";
    const allowed = ACCEPTED_LICENSE_NAMES.has(license.name);
    const isNonCommercial = /(?:^|[-\s])nc(?:[-\s]|$)|noncommercial|non-commercial/i.test(license.name);
    const recordingStatement = `Dogmazic API license ${license.id}: ${license.name}. ${license.description}`.trim();

    return {
      recording: {
        layer: "recording",
        licenseName: license.name,
        licenseIdentifier: licenseIdentifier(license),
        licenseUrl: license.external_link || optionalString(song.license),
        attributionText: allowed && !isCc0 ? attributionText(metadata, license) : null,
        attributionRequired: allowed ? !isCc0 : null,
        commercialUseAllowed: isNonCommercial ? false : allowed ? true : null,
        redistributionAllowed: allowed ? true : isNonCommercial ? false : null,
        derivativeWorksAllowed: allowed ? true : null,
        jurisdiction: isPublicDomain ? null : "WORLDWIDE_LICENSE_TERMS",
        rightsStatement: recordingStatement,
        evidencePresent: true,
      },
      composition: {
        layer: "composition",
        licenseName: null,
        licenseIdentifier: null,
        licenseUrl: null,
        attributionText: null,
        attributionRequired: null,
        commercialUseAllowed: null,
        redistributionAllowed: null,
        derivativeWorksAllowed: null,
        jurisdiction: null,
        rightsStatement: "Dogmazic exposes one track-level license but no independent composition-rights assertion; manual review is required before GREEN approval.",
        evidencePresent: true,
      },
    };
  }

  async resolveMedia(sourceItemId: string): Promise<ResolvedMedia> {
    this.assertEnabled();
    if (!this.allowMediaResolution) throw new Error("Dogmazic media resolution is disabled; enable it only for an approved staging download phase.");
    const { song } = await this.getSong(sourceItemId, true);
    const mediaUrl = requiredString(song.url, `song ${sourceItemId} media URL`);
    const url = new URL(mediaUrl);
    if (url.protocol !== "https:" || url.hostname !== new URL(this.baseUrl).hostname) throw new Error("Dogmazic returned an unexpected media host.");
    return { mediaUrl, contentType: optionalString(song.mime), expiresAt: this.session ? new Date(this.session.expiresAt).toISOString() : null };
  }

  normalize(metadata: SourceMetadata): SourceMetadata {
    const sourceItemId = requiredString(metadata.sourceItemId, "normalized sourceItemId");
    const title = requiredString(metadata.title, `song ${sourceItemId} normalized title`);
    const artist = requiredString(metadata.artist, `song ${sourceItemId} normalized artist`);
    return { ...metadata, sourceItemId, title, artist };
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error("Dogmazic adapter is disabled by feature flag.");
    if (!this.apiKey) throw new Error("DOGMAZIC_API_KEY is required.");
  }

  private async getAcceptedLicenses(): Promise<AmpacheLicense[]> {
    this.assertEnabled();
    if (!this.licenses) {
      const response = await this.apiRequest("licenses", { limit: "100", offset: "0", sort: "name,ASC" });
      const licenses = asArray(response.license, "licenses").map(parseLicense);
      const accepted = licenses.filter((license) => ACCEPTED_LICENSE_NAMES.has(license.name));
      if (accepted.length !== ACCEPTED_LICENSE_NAMES.size) {
        const found = accepted.map((license) => license.name).join(", ");
        throw new Error(`Dogmazic fail-closed: accepted license catalogue changed (found: ${found || "none"}).`);
      }
      this.licenses = licenses;
    }
    return this.licenses.filter((license) => ACCEPTED_LICENSE_NAMES.has(license.name));
  }

  private matchSongLicense(song: AmpacheSong, licenses: AmpacheLicense[]): AmpacheLicense | null {
    const songUrl = normalizeUrlForComparison(song.license);
    if (!songUrl) return null;
    return licenses.find((license) => normalizeUrlForComparison(license.external_link) === songUrl) || null;
  }

  private async getSong(sourceItemId: string, forceRefresh = false): Promise<{ song: AmpacheSong; license: AmpacheLicense }> {
    this.assertEnabled();
    const cleanId = requiredString(sourceItemId, "sourceItemId");
    if (!/^\d+$/.test(cleanId)) throw new Error("Dogmazic source item ID must be numeric.");
    if (!forceRefresh) {
      const cached = this.songs.get(cleanId);
      if (cached) return cached;
    }
    const licenses = await this.getAllLicenses();
    const response = await this.apiRequest("song", { filter: cleanId });
    const song = parseSong(response);
    const license = this.matchSongLicense(song, licenses);
    if (!license) throw new Error(`Dogmazic fail-closed: song ${cleanId} license URL is missing or unknown.`);
    const entry = { song, license };
    this.songs.set(cleanId, entry);
    return entry;
  }

  private async getAllLicenses(): Promise<AmpacheLicense[]> {
    if (!this.licenses) await this.getAcceptedLicenses();
    return this.licenses || [];
  }

  private async authenticate(): Promise<string> {
    this.assertEnabled();
    const now = this.now().getTime();
    if (this.session && this.session.expiresAt - now > 60_000) return this.session.token;
    const response = await this.request({ action: "handshake", version: API_VERSION }, this.apiKey, false);
    const token = requiredString(response.auth, "handshake auth token");
    const expiry = Date.parse(requiredString(response.session_expire, "handshake session expiry"));
    if (!Number.isFinite(expiry)) throw new Error("Dogmazic schema error: invalid session expiry.");
    this.session = { token, expiresAt: expiry };
    return token;
  }

  private async apiRequest(action: string, parameters: Record<string, string>): Promise<JsonObject> {
    const token = await this.authenticate();
    return this.request({ action, ...parameters }, token, true);
  }

  private async request(parameters: Record<string, string>, bearer: string, retryAuthentication: boolean): Promise<JsonObject> {
    const policy = this.rateLimitPolicy();
    for (let attempt = 0; attempt <= policy.maxRetries; attempt += 1) {
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (wait > 0) await this.sleep(wait);
      this.nextRequestAt = Date.now() + policy.minimumDelayMs;
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/server/json.server.php`, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Accept: "application/json" },
          body: new URLSearchParams(parameters),
          signal: AbortSignal.timeout(30_000),
        });
        const retryAfter = Number(response.headers.get("retry-after") || "0");
        if (response.status === 429 || response.status >= 500) {
          if (attempt === policy.maxRetries) throw new Error(`Dogmazic request failed after retries: HTTP ${response.status}.`);
          await this.sleep(Math.min(30_000, Math.max(retryAfter * 1000, 500 * (2 ** attempt))));
          continue;
        }
        if (!response.ok) throw new Error(`Dogmazic request failed: HTTP ${response.status}.`);
        const parsed = asObject(await response.json(), "API response");
        if (parsed.error) {
          const error = asObject(parsed.error, "API error");
          const code = optionalString(error.errorCode);
          if (retryAuthentication && code === "4701") {
            this.session = null;
            if (attempt === policy.maxRetries) throw new Error("Dogmazic session authentication failed after refresh.");
            bearer = await this.authenticate();
            continue;
          }
          throw new Error(`Dogmazic API error ${code || "unknown"}: ${optionalString(error.errorMessage) || "unknown error"}.`);
        }
        return parsed;
      } catch (error) {
        if (attempt === policy.maxRetries || (error instanceof Error && /schema|disabled|required|API error|HTTP 4\d\d/.test(error.message))) throw error;
        await this.sleep(500 * (2 ** attempt));
      }
    }
    throw new Error("Dogmazic request failed unexpectedly.");
  }
}

export function createDogmazicAdapterFromEnv(env: NodeJS.ProcessEnv = process.env, overrides: Omit<DogmazicAdapterOptions, "apiKey" | "enabled"> = {}): DogmazicAdapter {
  const enabled = String(env.EXTERNAL_CATALOG_ACQUISITION_ENABLED || "").toLowerCase() === "true"
    && String(env.EXTERNAL_CATALOG_SOURCE_DOGMAZIC || "").toLowerCase() === "true";
  return new DogmazicAdapter({ ...overrides, apiKey: env.DOGMAZIC_API_KEY || "", enabled });
}
