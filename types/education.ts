export type EducationalContentFormat = "audio" | "video" | "unknown";

export type EducationalCategory = {
  id: string;
  slug: string;
  name: string;
  title: string;
  sort_order?: number;
  item_count?: number;
};

export type EducationalProgram = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  educatorName?: string | null;
  institutionName?: string | null;
  primarySubjectSlug?: string | null;
  topicTags: string[];
  artworkUrl?: string | null;
  language?: string | null;
  country?: string | null;
  educationLevel?: string | null;
  difficultyLevel?: string | null;
  contentFormat: EducationalContentFormat;
  sessionCount: number;
  totalDurationSeconds?: number | null;
  mature?: boolean;
  featured?: boolean;
  verified?: boolean;
  rightsType?: string | null;
  attribution?: string | null;
  publishedAt?: string | null;
};

export type EducationalSession = {
  id: string;
  programId: string;
  title: string;
  slug?: string | null;
  description?: string | null;
  sequenceNumber: number;
  moduleNumber?: number | null;
  lessonNumber?: number | null;
  educatorName?: string | null;
  artworkUrl?: string | null;
  contentFormat: EducationalContentFormat;
  durationSeconds?: number | null;
  language?: string | null;
  mature?: boolean;
  public?: boolean;
  verified?: boolean;
  playable?: boolean;
  publishedAt?: string | null;
};

export type EducationalOffsetPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type EducationalProgramDetail = {
  program: EducationalProgram;
  sessions: EducationalSession[];
  pagination: EducationalOffsetPagination;
};

export type EducationalSessionPlayItem = EducationalSession & {
  playableUrl: string;
  mediaType: "audio" | "video";
  mimeType?: string | null;
};

export type EducationalPlaybackResolve = {
  programId: string;
  sessionId: string;
  mediaType: "audio" | "video";
  playableUrl: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
};
