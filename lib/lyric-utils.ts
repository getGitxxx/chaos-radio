export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
}

/**
 * Parses a standard LRC string into an array of LyricLine objects.
 * [mm:ss.xx] Lyric text
 */
export function parseLrc(lrc: string, tlyric?: string): LyricLine[] {
  if (!lrc) return [];

  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseInt(match[3], 10);
      
      // Handle cases where ms is 2 digits (centiseconds) or 3 digits
      const time = minutes * 60 + seconds + ms / (match[3].length === 2 ? 100 : 1000);
      const text = line.replace(timeRegex, '').trim();
      
      if (text) {
        result.push({ time, text });
      }
    }
  }

  // Sort by time just in case
  result.sort((a, b) => a.time - b.time);

  // Merge translations if available
  if (tlyric) {
    const tLines = tlyric.split('\n');
    for (const tLine of tLines) {
      const match = timeRegex.exec(tLine);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const ms = parseInt(match[3], 10);
        const tTime = minutes * 60 + seconds + ms / (match[3].length === 2 ? 100 : 1000);
        const tText = tLine.replace(timeRegex, '').trim();

        // Find the matching line in the main lyrics
        // Use a small epsilon for floating point comparison
        const mainLine = result.find(l => Math.abs(l.time - tTime) < 0.05);
        if (mainLine) {
          mainLine.translation = tText;
        }
      }
    }
  }

  return result;
}

/**
 * Finds the index of the lyric line that should be active at the given time.
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) return -1;
  
  // Find the last line whose time is <= currentTime
  let index = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}
