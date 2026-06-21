export const MEDIA_DISCOVERY_PAGE_SIZE = 40;

export type MediaDiscoveryPaginationState = {
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  activeQuery: string;
  activeCategory: string;
  activeCountry: string;
  activeLanguage: string;
  activeGenre: string;
};

export const EMPTY_MEDIA_DISCOVERY_PAGINATION: MediaDiscoveryPaginationState = {
  page: 1,
  pageSize: MEDIA_DISCOVERY_PAGE_SIZE,
  hasMore: false,
  isLoadingMore: false,
  activeQuery: "",
  activeCategory: "",
  activeCountry: "",
  activeLanguage: "",
  activeGenre: "",
};

export function pageFromOffset(offset: number, pageSize = MEDIA_DISCOVERY_PAGE_SIZE) {
  return Math.floor(Math.max(0, offset) / pageSize) + 1;
}
