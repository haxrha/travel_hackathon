/**
 * OpenWeather — live conditions for World Model + Guardian auto-replan.
 */

export interface WeatherSnapshot {
  condition: string;
  tempC: number;
  rainChance: number;
  humidity?: number;
  windMs?: number;
  city?: string;
  live: boolean;
  rawMain?: string;
}

export async function fetchWeather(city: string): Promise<WeatherSnapshot> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return {
      condition: "clear",
      tempC: 22,
      rainChance: 12,
      city,
      live: false,
    };
  }
  try {
    const q = encodeURIComponent(city.split(",")[0]!.trim());
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${key}&units=metric`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) throw new Error("weather fail");
    const data = await res.json();
    const main = String(data.weather?.[0]?.main ?? "Clear").toLowerCase();
    const rainChance =
      main.includes("rain") || main.includes("thunder")
        ? 75
        : main.includes("drizzle")
          ? 55
          : main.includes("cloud")
            ? 30
            : 10;
    return {
      condition: main,
      tempC: Math.round(Number(data.main?.temp ?? 20)),
      rainChance,
      humidity: data.main?.humidity,
      windMs: data.wind?.speed,
      city: data.name ?? city,
      live: true,
      rawMain: main,
    };
  } catch {
    return { condition: "clear", tempC: 22, rainChance: 12, city, live: false };
  }
}

/** Returns true if weather warrants outdoor-activity replan. */
export function shouldReplanForWeather(w: WeatherSnapshot) {
  return w.rainChance >= 60 || /rain|thunder|storm/.test(w.condition);
}
