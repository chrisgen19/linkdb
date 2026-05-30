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

export type FilterType = "all" | "favorites" | "most-viewed";
