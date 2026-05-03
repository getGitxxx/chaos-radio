import type { WeatherInfo } from './types';

export async function getCurrentWeather(): Promise<WeatherInfo | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const city = process.env.WEATHER_CITY || 'Shanghai';

  if (!apiKey) {
    console.warn('[Weather] OPENWEATHER_API_KEY not configured');
    return null;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error('[Weather] API returned:', res.status);
      return null;
    }

    const data = await res.json();
    return {
      temp: Math.round(data.main.temp),
      condition: data.weather[0]?.main || 'Unknown',
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '',
      city: data.name,
    };
  } catch (error) {
    console.error('[Weather] Fetch error:', error);
    return null;
  }
}
