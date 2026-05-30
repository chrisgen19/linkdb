export interface Actress {
  id: string;
  name: string;
}

export interface Link {
  id: string;
  url: string;
  title: string | null;
  image: string | null;
  favorite: boolean;
  clickCount: number;
  actressId: string | null;
  actress: Actress | null;
  createdAt: string;
}

export type FilterType = "all" | "favorites" | "most-viewed" | "actresses";

export interface ActressSummary {
  id: string;
  name: string;
  /** Distinct thumbnails from this actress's links, newest-first (may be empty). */
  images: string[];
  /** Number of links tagged with this actress. */
  count: number;
}
