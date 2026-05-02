import type { DayForecast, ForecastHour, ForecastPayload } from "./types";

type AirQualityResponse = {
  hourly?: Record<string, Array<string | number | null>>;
};

type WeatherResponse = {
  hourly?: Record<string, Array<string | number | null>>;
};

const POLLEN_VARIABLES = [
  "alder_pollen",
  "birch_pollen",
  "grass_pollen",
  "mugwort_pollen",
  "olive_pollen",
  "ragweed_pollen"
];

function toNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : null;
}

function groupByDay(hours: ForecastHour[]): DayForecast[] {
  const map = new Map<string, ForecastHour[]>();

  hours.forEach((hour) => {
    const date = hour.time.slice(0, 10);
    const dayHours = map.get(date) ?? [];
    dayHours.push(hour);
    map.set(date, dayHours);
  });

  return Array.from(map.entries())
    .slice(0, 5)
    .map(([date, dayHours]) => ({ date, hours: dayHours }));
}

export async function fetchOpenMeteoForecast(
  latitude: number,
  longitude: number,
  label: string
): Promise<ForecastPayload> {
  const pollenParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: POLLEN_VARIABLES.join(","),
    forecast_days: "5",
    timezone: "auto"
  });

  const weatherParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "wind_speed_10m,precipitation",
    forecast_days: "5",
    timezone: "auto"
  });

  const [airQualityResponse, weatherResponse] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${pollenParams}`, {
      next: { revalidate: 900 }
    }),
    fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, {
      next: { revalidate: 900 }
    })
  ]);

  if (!airQualityResponse.ok) {
    throw new Error("Open-Meteo air quality request failed");
  }

  if (!weatherResponse.ok) {
    throw new Error("Open-Meteo weather request failed");
  }

  const airQuality = (await airQualityResponse.json()) as AirQualityResponse;
  const weather = (await weatherResponse.json()) as WeatherResponse;
  const times = (airQuality.hourly?.time ?? weather.hourly?.time ?? []) as string[];

  const hours = times.map((time, index) => ({
    time,
    alder_pollen: toNumber(airQuality.hourly?.alder_pollen?.[index]),
    birch_pollen: toNumber(airQuality.hourly?.birch_pollen?.[index]),
    grass_pollen: toNumber(airQuality.hourly?.grass_pollen?.[index]),
    mugwort_pollen: toNumber(airQuality.hourly?.mugwort_pollen?.[index]),
    olive_pollen: toNumber(airQuality.hourly?.olive_pollen?.[index]),
    ragweed_pollen: toNumber(airQuality.hourly?.ragweed_pollen?.[index]),
    wind_speed_10m: toNumber(weather.hourly?.wind_speed_10m?.[index]),
    precipitation: toNumber(weather.hourly?.precipitation?.[index])
  }));

  const hasPollenData = hours.some((hour) =>
    POLLEN_VARIABLES.some((key) => typeof hour[key as keyof ForecastHour] === "number")
  );

  return {
    location: { latitude, longitude, label },
    days: groupByDay(hours),
    hasPollenData,
    source: "open-meteo",
    pollenUnit: "grains_per_m3",
    message: hasPollenData
      ? undefined
      : "Live pollen coverage is unavailable for this location. AllergyScore is using weather context and your symptom profile."
  };
}
