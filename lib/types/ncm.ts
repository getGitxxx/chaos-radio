export interface NCMArtist {
  id: number;
  name: string;
}

export interface NCMAlbum {
  id: number;
  name: string;
  picUrl: string;
}

export interface NCMSong {
  id: number;
  name: string;
  ar: NCMArtist[];
  al: NCMAlbum;
  dt: number;
}

export interface NCMSearchResponseBody {
  result: {
    songs: NCMSong[];
  };
}

export interface NCMSearchResponse {
  body: NCMSearchResponseBody;
}

export interface NCMLikeListResponseBody {
  ids: number[];
}

export interface NCMLikeListResponse {
  body: NCMLikeListResponseBody;
}

export interface NCMSongDetailResponseBody {
  songs: NCMSong[];
}

export interface NCMSongDetailResponse {
  body: NCMSongDetailResponseBody;
}

export interface NCMPlaylistCreator {
  userId: number;
}

export interface NCMPlaylist {
  id: number;
  name: string;
  trackCount: number;
  creator: NCMPlaylistCreator;
  createTime: number;
}

export interface NCMUserPlaylistResponseBody {
  playlist: NCMPlaylist[];
}

export interface NCMUserPlaylistResponse {
  body: NCMUserPlaylistResponseBody;
}

export interface NCMPlaylistTrackResponseBody {
  songs: NCMSong[];
}

export interface NCMPlaylistTrackResponse {
  body: NCMPlaylistTrackResponseBody;
}

export interface NCMLyricResponseBody {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
}

export interface NCMLyricResponse {
  body: NCMLyricResponseBody;
}

export interface NCMSongUrlData {
  url: string | null;
}

export interface NCMSongUrlResponseBody {
  data: NCMSongUrlData[];
}

export interface NCMSongUrlResponse {
  body: NCMSongUrlResponseBody;
}

export function isNCMSearchResponse(data: unknown): data is NCMSearchResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMSearchResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  if (typeof response.body.result !== 'object' || response.body.result === null) return false;
  return Array.isArray(response.body.result.songs);
}

export function isNCMLikeListResponse(data: unknown): data is NCMLikeListResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMLikeListResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  return Array.isArray(response.body.ids);
}

export function isNCMSongDetailResponse(data: unknown): data is NCMSongDetailResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMSongDetailResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  return Array.isArray(response.body.songs);
}

export function isNCMUserPlaylistResponse(data: unknown): data is NCMUserPlaylistResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMUserPlaylistResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  return Array.isArray(response.body.playlist);
}

export function isNCMPlaylistTrackResponse(data: unknown): data is NCMPlaylistTrackResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMPlaylistTrackResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  return Array.isArray(response.body.songs);
}

export function isNCMLyricResponse(data: unknown): data is NCMLyricResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMLyricResponse;
  return typeof response.body === 'object' && response.body !== null;
}

export function isNCMSongUrlResponse(data: unknown): data is NCMSongUrlResponse {
  if (typeof data !== 'object' || data === null) return false;
  const response = data as NCMSongUrlResponse;
  if (typeof response.body !== 'object' || response.body === null) return false;
  return Array.isArray(response.body.data);
}

export function isNCMSong(data: unknown): data is NCMSong {
  if (typeof data !== 'object' || data === null) return false;
  const song = data as NCMSong;
  return (
    typeof song.id === 'number' &&
    typeof song.name === 'string' &&
    Array.isArray(song.ar) &&
    typeof song.al === 'object' && song.al !== null &&
    typeof song.dt === 'number'
  );
}