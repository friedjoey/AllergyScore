import type {
  AllergyKey,
  DayForecast,
  ForecastHour,
  Sensitivities,
  SeverityLevel,
  SeverityResult,
  TriggerBreakdown,
  UserProfile
} from "./types";

const POLLEN_THRESHOLDS: Record<"tree" | "grass" | "weed", number> = {
  tree: 180,
  grass: 75,
  weed: 90
};

export const recommendationByLevel: Record<SeverityLevel, string> = {
  Low: "Normal outdoor activity should be fine.",
  Moderate: "Consider taking allergy medication before extended outdoor exposure.",
  High: "Limit outdoor activity during peak hours, keep windows closed, and shower after being outside.",
  Severe: "Avoid long outdoor exposure, use medication as directed, and consider a mask outdoors."
};

export function defaultProfile(): UserProfile {
  return {
    locationLabel: "",
    latitude: null,
    longitude: null,
    allergies: {
      tree: true,
      grass: true,
      weed: true,
      mold: false
    },
    sensitivities: {
      tree: 3,
      grass: 3,
      weed: 3,
      mold: 2
    },
    currentSymptoms: 2,
    medicationTaken: false,
    outdoorExposure: true
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalize(value: number, threshold: number) {
  return clamp((value / threshold) * 100);
}

function sumPresent(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

export function getPollenGroups(hour: ForecastHour) {
  return {
    tree: sumPresent([hour.alder_pollen, hour.birch_pollen, hour.olive_pollen]),
    grass: sumPresent([hour.grass_pollen]),
    weed: sumPresent([hour.ragweed_pollen, hour.mugwort_pollen])
  };
}

function getDailyBreakdown(day: DayForecast): TriggerBreakdown {
  const tree: number[] = [];
  const grass: number[] = [];
  const weed: number[] = [];
  const mold: number[] = [];

  day.hours.forEach((hour) => {
    const groups = getPollenGroups(hour);

    if (groups.tree !== null) {
      tree.push(normalize(groups.tree, POLLEN_THRESHOLDS.tree));
    }

    if (groups.grass !== null) {
      grass.push(normalize(groups.grass, POLLEN_THRESHOLDS.grass));
    }

    if (groups.weed !== null) {
      weed.push(normalize(groups.weed, POLLEN_THRESHOLDS.weed));
    }

    const wind = hour.wind_speed_10m ?? 0;
    const rain = hour.precipitation ?? 0;
    // Mold has no direct Open-Meteo pollen variable in this MVP, so damp/rainy
    // conditions act as a light contextual proxy instead of a hard signal.
    mold.push(clamp(rain * 12 + Math.max(0, wind - 18) * 1.5, 0, 55));
  });

  return {
    tree: average(tree),
    grass: average(grass),
    weed: average(weed),
    mold: average(mold)
  };
}

function getWeatherModifier(day: DayForecast) {
  const hourlyModifiers = day.hours.map((hour) => {
    const wind = hour.wind_speed_10m ?? 0;
    const precipitation = hour.precipitation ?? 0;
    const windBoost = wind > 22 ? Math.min(18, (wind - 22) * 1.2) : 0;
    const rainRelief = precipitation > 0.2 ? Math.min(20, precipitation * 8) : 0;

    return clamp(50 + windBoost - rainRelief);
  });

  return average(hourlyModifiers);
}

function getSensitivityRisk(allergies: Record<AllergyKey, boolean>, sensitivities: Sensitivities) {
  const activeSensitivity = (Object.keys(allergies) as AllergyKey[])
    .filter((key) => allergies[key])
    .map((key) => sensitivities[key] * 20);

  return average(activeSensitivity);
}

function getLevel(score: number): SeverityLevel {
  if (score >= 76) {
    return "Severe";
  }

  if (score >= 56) {
    return "High";
  }

  if (score >= 31) {
    return "Moderate";
  }

  return "Low";
}

function getMainTrigger(breakdown: TriggerBreakdown, allergies: Record<AllergyKey, boolean>) {
  const active = (Object.entries(breakdown) as Array<[AllergyKey, number]>)
    .filter(([key]) => allergies[key])
    .sort((a, b) => b[1] - a[1]);

  if (active.length === 0 || active[0][1] < 12) {
    return "weather and your symptom baseline are the main context today";
  }

  const label: Record<AllergyKey, string> = {
    tree: "tree pollen",
    grass: "grass pollen",
    weed: "weed and ragweed pollen",
    mold: "mold-like weather conditions"
  };

  return `${label[active[0][0]]} is driving today's risk`;
}

export function calculateDaySeverity(day: DayForecast, profile: UserProfile): SeverityResult {
  const triggerBreakdown = getDailyBreakdown(day);
  const hasPollenData = day.hours.some((hour) => {
    const groups = getPollenGroups(hour);
    return groups.tree !== null || groups.grass !== null || groups.weed !== null;
  });

  const activePollenRisks = (Object.keys(profile.allergies) as AllergyKey[])
    .filter((key) => profile.allergies[key])
    .map((key) => triggerBreakdown[key] * (profile.sensitivities[key] / 5));

  const pollenRisk = hasPollenData ? average(activePollenRisks) : 0;
  const sensitivityRisk = getSensitivityRisk(profile.allergies, profile.sensitivities);
  const symptomRisk = profile.currentSymptoms * 10;
  const weatherModifier = getWeatherModifier(day);

  // Weighted MVP score: pollen dominates, user sensitivity and current symptoms
  // personalize it, and weather nudges risk up or down for wind/rain.
  let score =
    0.55 * pollenRisk +
    0.25 * sensitivityRisk +
    0.15 * symptomRisk +
    0.05 * weatherModifier;

  if (profile.outdoorExposure) {
    score += 4;
  }

  if (profile.medicationTaken) {
    score -= 6;
  }

  score = clamp(score);

  return {
    date: day.date,
    score,
    level: getLevel(score),
    pollenRisk,
    sensitivityRisk,
    symptomRisk,
    weatherModifier,
    triggerBreakdown,
    mainTrigger: getMainTrigger(triggerBreakdown, profile.allergies),
    hasPollenData
  };
}

export function calculateForecast(days: DayForecast[], profile: UserProfile) {
  return days.map((day) => calculateDaySeverity(day, profile));
}
