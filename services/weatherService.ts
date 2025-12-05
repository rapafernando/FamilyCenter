
import { WeatherData } from '../types';

export const fetchWeather = async (lat: number, lon: number): Promise<WeatherData | null> => {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`
    );

    if (!response.ok) return null;

    const data = await response.json();

    const daily = data.daily.time.map((date: string, index: number) => ({
      date: date,
      max: Math.round(data.daily.temperature_2m_max[index]),
      min: Math.round(data.daily.temperature_2m_min[index]),
      code: data.daily.weather_code[index]
    }));

    return {
      current: {
        temp: Math.round(data.current.temperature_2m),
        code: data.current.weather_code
      },
      daily: daily
    };
  } catch (e) {
    console.error("Weather fetch failed", e);
    return null;
  }
};
