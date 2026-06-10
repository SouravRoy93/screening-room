export interface MediaItem {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  year: number | null;
  genres: string[];
  poster_path: string | null;
  vote_average: number | null;
  popularity: number | null;
}

export interface TrackedItem {
  id?: string;
  user_id?: string;
  vertical: string;
  tmdb_id: string;
  media_type: string;
  title: string;
  year: number | null;
  genres: string[];
  poster_path: string | null;
  status: "want" | "watching" | "watched";
  rating?: number | null;
  answers?: unknown;
  rated_at?: string | null;
  updated_at?: string;
}

export interface DiningItem {
  id: number;
  name: string;
  cuisine: string;
  format: string;
  neighborhood: string;
  borough: string;
  price: number;
  rope: number;
  occasion: string[];
  recognition: string;
  signature: string;
  blurb: string;
}

export interface PlaceItem {
  id: number;
  name: string;
  area: string;
  vibe: string;
  styles: string[];
  moods: string[];
  best: string;
  dur: number;
  crowd: string;
  price: string;
  dress: string;
  hours: string;
  resv: string;
  photo: string;
  cafe: string;
  dinner: string;
  insider: string;
  worth: string;
  skip: string;
  badges: string[];
  scores: { b: number; u: number; e: number; c: number; v: number; l: number };
  rain: boolean;
  img: string;
  imgAttr?: string;
  imgLink?: string;
  lat?: number;
  lng?: number;
  city?: string;
}

export const GENRE_COLORS: Record<string, [string, string]> = {
  Action: ["#ff6b6b", "#c92a2a"],
  "Action & Adventure": ["#ff6b6b", "#c92a2a"],
  Adventure: ["#ff922b", "#e8590c"],
  Comedy: ["#ffd43b", "#f59f00"],
  Drama: ["#748ffc", "#3b5bdb"],
  "Sci-Fi": ["#3bc9db", "#0c8599"],
  "Sci-Fi & Fantasy": ["#3bc9db", "#0c8599"],
  Fantasy: ["#b197fc", "#6741d9"],
  Horror: ["#5c636e", "#212529"],
  Thriller: ["#f06595", "#a61e4d"],
  Crime: ["#9775fa", "#5f3dc4"],
  Romance: ["#faa2c1", "#e64980"],
  Animation: ["#69db7c", "#2f9e44"],
  Family: ["#63e6be", "#099268"],
  Mystery: ["#5c7cfa", "#364fc7"],
  History: ["#e8a87c", "#b08968"],
  War: ["#868e96", "#495057"],
  "War & Politics": ["#868e96", "#495057"],
  Music: ["#da77f2", "#9c36b5"],
  Documentary: ["#4dabf7", "#1971c2"],
  Western: ["#d9a066", "#a86a36"],
};

export function colorFor(genre: string): [string, string] {
  return GENRE_COLORS[genre] || ["#8b5cf6", "#ec4899"];
}

export const IMG_BASE = "https://image.tmdb.org/t/p/w342";
export const IMG_BACKDROP = "https://image.tmdb.org/t/p/w1280";
export const IMG_PROFILE = "https://image.tmdb.org/t/p/w185";
