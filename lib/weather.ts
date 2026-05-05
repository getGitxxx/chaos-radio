import type { WeatherInfo } from './types';
import { fetchWithTimeout, withRetry } from './retry';

const WEATHER_CACHE_TTL = 2 * 60 * 60 * 1000;

interface WeatherCache {
  data: WeatherInfo;
  fetchedAt: number;
}

let cache: WeatherCache | null = null;

export async function getCurrentWeather(): Promise<WeatherInfo | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || 'Shanghai';

  if (!apiKey) {
    console.warn('[Weather] OPENWEATHER_API_KEY not configured');
    return null;
  }

  if (cache && (Date.now() - cache.fetchedAt) < WEATHER_CACHE_TTL) {
    const age = Math.round((Date.now() - cache.fetchedAt) / 60000);
    console.log(`[Weather] Cache hit (${age}min old)`);
    return cache.data;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;

    const res = await withRetry(
      () => fetchWithTimeout(url, { next: { revalidate: 1800 } }, 5000),
      { retries: 1, delayMs: 1000 }
    );

    if (!res.ok) {
      console.error('[Weather] API returned:', res.status);
      return cache?.data ?? null;
    }

    const data = await res.json();
    const result: WeatherInfo = {
      temp: Math.round(data.main.temp),
      condition: data.weather[0]?.main || 'Unknown',
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '',
      city: data.name,
    };

    cache = { data: result, fetchedAt: Date.now() };
    console.log(`[Weather] Fetched: ${result.city} ${result.temp}°C ${result.description}`);
    return result;
  } catch (error) {
    console.error('[Weather] Fetch error:', error);
    return cache?.data ?? null;
  }
}
