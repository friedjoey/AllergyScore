import type { ForecastPayload } from "./types";

const today = new Date();

function isoDate(offset: number) {
  const date = new Date(today);
  date.setDate(today.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function getMockForecast(label = "Corvallis, Oregon, US"): ForecastPayload {
  const days = Array.from({ length: 5 }, (_, dayIndex) => {
    const date = isoDate(dayIndex);
    const peak = dayIndex === 1 ? 1.18 : dayIndex === 3 ? 0.72 : 1;

    return {
      date,
      hours: Array.from({ length: 24 }, (_, hour) => {
        const daytime = hour >= 9 && hour <= 18 ? 1 : 0.45;
        const wave = Math.sin((hour / 24) * Math.PI) + 0.7;

        return {
          time: `${date}T${String(hour).padStart(2, "0")}:00`,
          alder_pollen: 0,
          birch_pollen: Math.min(5, 3.4 * peak * daytime * wave),
          olive_pollen: 0,
          grass_pollen: Math.min(5, 1.8 * peak * daytime * wave),
          mugwort_pollen: 0,
          ragweed_pollen: Math.min(5, 0.5 * peak * daytime * wave),
          wind_speed_10m: 10 + dayIndex * 3 + (hour > 12 ? 8 : 2),
          precipitation: dayIndex === 2 && hour > 5 && hour < 11 ? 1.2 : 0
        };
      })
    };
  });

  return {
    location: {
      latitude: 44.5646,
      longitude: -123.262,
      label
    },
    days,
    hasPollenData: true,
    source: "demo",
    pollenUnit: "upi"
  };
}
