/* ---- Track types ---- */

export interface Track {
  id: number;
  name: string;
  artist: string;
  album?: string;
  cover?: string;
  url?: string;
  duration?: number; // milliseconds
  lyric?: string;    // LRC format
  tlyric?: string;   // translated lyric
  djIntro?: string;  // pre-generated DJ commentary for this track
}

/* ---- LLM response types ---- */

export interface DJResponse {
  say: string;          // general welcome/intro commentary
  play: { query: string; intro: string }[]; // tracks with their specific intros
  reason?: string;      // internal reasoning (debug)
  segue?: string;       // transition style hint
}

/* ---- Playlist / Plan ---- */

export interface PlaylistPlan {
  tracks: Track[];
  ttsUrl?: string;
  djMessage: string;
}

export interface PlanRequest {
  mood?: string;
  count?: number;
  message?: string;
  recentPlays?: string[]; // recent track names for context
}

/* ---- Chat ---- */

export interface ChatMessage {
  id: string;
  role: 'user' | 'dj';
  content: string;
  tracks?: Track[];
  ttsUrl?: string;
  timestamp: number;
}

/* ---- Auth ---- */

export interface AuthState {
  authenticated: boolean;
  token?: string;
}

/* ---- Weather ---- */

export interface WeatherInfo {
  temp: number;
  condition: string;   // e.g. "Rain", "Clear", "Clouds"
  description: string; // e.g. "light rain"
  icon: string;
  city: string;
}

/* ---- API responses ---- */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface NowPlayingState {
  track?: Track;
  isPlaying: boolean;
  progress: number; // 0-1
  playlist: Track[];
  currentIndex: number;
  djMessage?: string;
}

/* ---- NCM API types ---- */

export interface NCMSearchResult {
  id: number;
  name: string;
  artists: { id: number; name: string }[];
  album: { id: number; name: string; picUrl: string };
  duration: number;
}

export interface NCMSongUrl {
  id: number;
  url: string;
  type: string;
  size: number;
}

export const FALLBACK_TRACKS: Track[] = [
  {
    id: 1341968063,
    name: 'Plastic Love',
    artist: '竹内 まりや / 竹内玛莉亚',
    url: 'https://music.163.com/song/media/outer/url?id=1341968063.mp3',
  },
  {
    id: 470794465,
    name: 'Fly Me To The Moon',
    artist: 'Lisa Ono / 小野丽莎',
    url: 'https://music.163.com/song/media/outer/url?id=470794465.mp3',
  },
  {
    id: 27864648,
    name: 'Ride On Time',
    artist: '山下达郎',
    url: 'https://music.163.com/song/media/outer/url?id=27864648.mp3',
  },
  {
    id: 146915,
    name: 'Moonlight Shadow',
    artist: 'Groove Coverage',
    url: 'https://music.163.com/song/media/outer/url?id=146915.mp3',
  },
  {
    id: 5243582,
    name: '夜来香',
    artist: '邓丽君',
    url: 'https://music.163.com/song/media/outer/url?id=5243582.mp3',
  },
];
