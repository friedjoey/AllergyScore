import type { DayForecast, ForecastHour, ForecastPayload } from "./types";

type GoogleDate = {
  year: number;
  month: number;
  day: number;
};

type GooglePollenType = {
  code: "TREE" | "GRASS" | "WEED";
  displayName?: string;
  inSeason?: boolean;
  indexInfo?: {
    code?: string;
    displayName?: string;
    value?: number;
    category?: string;
  };
  healthRecommendations?: string[];
};

type GoogleDayInfo = {
  date: GoogleDate;
  pollenTypeInfo?: GooglePollenType[];
};

type GooglePollenResponse = {
  regionCode?: string;
  dailyInfo?: GoogleDayInfo[];
};

type WeatherResponse = {
  hourly?: Record<string, Array<string | number | null>>;
};

function dateToIso(date: GoogleDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function pollenIndex(day: GoogleDayInfo, code: GooglePollenType["code"]) {
  const value = day.pollenTypeInfo?.find((item) => item.code === code)?.indexInfo?.value;
  return typeof value === "number" ? value : 0;
}

function getWeatherByDate(weather: WeatherResponse) {
  const map = new Map<string, Array<Pick<ForecastHour, "wind_speed_10m" | "precipitation">>>();
  const times = (weather.hourly?.time ?? []) as string[];

  times.forEach((time, index) => {
    const date = time.slice(0, 10);
    const hours = map.get(date) ?? [];
    hours.push({
      wind_speed_10m:
        typeof weather.hourly?.wind_speed_10m?.[index] === "number"
          ? (weather.hourly.wind_speed_10m[index] as number)
          : null,
      precipitation:
        typeof weather.hourly?.precipitation?.[index] === "number"
          ? (weather.hourly.precipitation[index] as number)
          : null
    });
    map.set(date, hours);
  });

  return map;
}

async function fetchWeather(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "wind_speed_10m,precipitation",
    forecast_days: "5",
    timezone: "auto"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 900 }
  });

  if (!response.ok) {
    return new Map<string, Array<Pick<ForecastHour, "wind_speed_10m" | "precipitation">>>();
  }

  return getWeatherByDate((await response.json()) as WeatherResponse);
}

export async function fetchGooglePollenForecast(
  latitude: number,
  longitude: number,
  label: string,
  apiKey: string
): Promise<ForecastPayload> {
  const params = new URLSearchParams({
    key: apiKey,
    "location.latitude": String(latitude),
    "location.longitude": String(longitude),
    days: "5",
    plantsDescription: "false",
    languageCode: "en"
  });

  const [pollenResponse, weatherByDate] = await Promise.all([
    fetch(`https://pollen.googleapis.com/v1/forecast:lookup?${params}`, {
      next: { revalidate: 900 }
    }),
    fetchWeather(latitude, longitude)
  ]);

  if (!pollenResponse.ok) {
    const errorText = await pollenResponse.text();
    throw new Error(`Google Pollen request failed: ${errorText}`);
  }

  const pollen = (await pollenResponse.json()) as GooglePollenResponse;
  const dailyInfo = pollen.dailyInfo ?? [];

  if (dailyInfo.length === 0) {
    throw new Error("Google Pollen returned no daily forecast data for this location.");
  }

  const days: DayForecast[] = dailyInfo.slice(0, 5).map((day) => {
    const date = dateToIso(day.date);
    const treeIndex = pollenIndex(day, "TREE");
    const grassIndex = pollenIndex(day, "GRASS");
    const weedIndex = pollenIndex(day, "WEED");
    const weatherHours = weatherByDate.get(date) ?? [];

    const hours = Array.from({ length: 24 }, (_, hourIndex): ForecastHour => {
      const weatherHour = weatherHours[hourIndex] ?? {};

      return {
        time: `${date}T${String(hourIndex).padStart(2, "0")}:00`,
        alder_pollen: 0,
        birch_pollen: treeIndex,
        olive_pollen: 0,
        grass_pollen: grassIndex,
        mugwort_pollen: 0,
        ragweed_pollen: weedIndex,
        wind_speed_10m: weatherHour.wind_speed_10m ?? null,
        precipitation: weatherHour.precipitation ?? null
      };
    });

    return { date, hours };
  });

  return {
    location: { latitude, longitude, label },
    days,
    hasPollenData: true,
    source: "google-pollen",
    pollenUnit: "upi"
  };
}
