import type { ForecastPayload } from "./types";

const today = new Date();

function isoDate(offset: number) {
  const date = new Date(today);
  date.setDate(today.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function getMockForecast(label = "Demo Meadow, CA"): ForecastPayload {
  const days = Array.from({ length: 5 }, (_, dayIndex) => {
    const date = isoDate(dayIndex);
    const peak = dayIndex === 1 ? 1.35 : dayIndex === 3 ? 0.7 : 1;

    return {
      date,
      hours: Array.from({ length: 24 }, (_, hour) => {
        const daytime = hour >= 9 && hour <= 18 ? 1 : 0.45;
        const wave = Math.sin((hour / 24) * Math.PI) + 0.7;

        return {
          time: `${date}T${String(hour).padStart(2, "0")}:00`,
          alder_pollen: Math.round(120 * peak * daytime * wave),
          birch_pollen: Math.round(560 * peak * daytime * wave),
          olive_pollen: Math.round(90 * peak * daytime * wave),
          grass_pollen: Math.round(145 * peak * daytime * wave),
          mugwort_pollen: Math.round(6 * peak * daytime * wave),
          ragweed_pollen: Math.round(18 * peak * daytime * wave),
          wind_speed_10m: 10 + dayIndex * 3 + (hour > 12 ? 8 : 2),
          precipitation: dayIndex === 2 && hour > 5 && hour < 11 ? 1.2 : 0
        };
      })
    };
  });

  return {
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
      label
    },
    days,
    hasPollenData: true,
    source: "demo",
    pollenUnit: "grains_per_m3"
  };
}
