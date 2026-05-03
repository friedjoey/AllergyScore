import type {
  AllergyKey,
  DayForecast,
  ForecastHour,
  PollenCounts,
  ReactionScore,
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
  Low: "Air quality is manageable for you today.",
  Moderate: "Consider taking allergy medication before extended outdoor exposure.",
  High: "Limit outdoor time. Take medication and monitor symptoms.",
  Severe: "Stay indoors if possible. High personal risk today."
};

export function defaultProfile(): UserProfile {
  return {
    locationLabel: "Wilsonville, Oregon, US",
    latitude: 45.2998,
    longitude: -122.7737,
    mode: "known",
    allergies: {
      tree: true,
      grass: true,
      weed: true
    },
    sensitivities: {
      tree: 3,
      grass: 3,
      weed: 3
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

  });

  return {
    tree: average(tree),
    grass: average(grass),
    weed: average(weed)
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

function getEnvironmentalPollenScore(totalPollen: number) {
  if (totalPollen <= 50) {
    return clamp((totalPollen / 50) * 20);
  }

  if (totalPollen <= 150) {
    return 21 + ((totalPollen - 51) / 99) * 19;
  }

  if (totalPollen <= 500) {
    return 41 + ((totalPollen - 151) / 349) * 29;
  }

  return clamp(71 + ((totalPollen - 500) / 1000) * 29);
}

function getEnvironmentalUpiScore(pollenCounts: PollenCounts) {
  const rawScores = (Object.keys(pollenCounts) as AllergyKey[]).reduce(
    (next, key) => {
      const normalizedUpi = clamp(pollenCounts[key], 0, 5) / 5;
      next[key] = Math.pow(normalizedUpi, 1.25) * (1 + normalizedUpi * 0.3);
      return next;
    },
    { tree: 0, grass: 0, weed: 0 } as Record<AllergyKey, number>
  );
  const dominant = (Object.entries(rawScores) as Array<[AllergyKey, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0][0];
  const composite = (Object.keys(rawScores) as AllergyKey[]).reduce((sum, key) => {
    const weight = key === dominant ? 0.6 : 0.2;
    return sum + rawScores[key] * weight;
  }, 0);

  return clamp(composite * 105);
}

function getDailyPollenCounts(day: DayForecast): PollenCounts {
  const tree: number[] = [];
  const grass: number[] = [];
  const weed: number[] = [];

  day.hours.forEach((hour) => {
    const groups = getPollenGroups(hour);

    if (groups.tree !== null) tree.push(groups.tree);
    if (groups.grass !== null) grass.push(groups.grass);
    if (groups.weed !== null) weed.push(groups.weed);

  });

  return {
    tree: average(tree),
    grass: average(grass),
    weed: average(weed)
  };
}

function getReactionScore(
  pollenCounts: PollenCounts,
  allergies: Record<AllergyKey, boolean>,
  sensitivities: Sensitivities,
  mode: UserProfile["mode"]
): ReactionScore {
  const effectiveAllergies =
    mode === "general"
      ? { tree: true, grass: true, weed: true }
      : allergies;
  const effectiveSensitivities =
    mode === "general"
      ? { tree: 3, grass: 3, weed: 3 }
      : sensitivities;

  const activeKeys = (Object.keys(pollenCounts) as AllergyKey[]).filter(
    (key) => effectiveAllergies[key]
  );

  const weightedUpiContributions = (Object.keys(pollenCounts) as AllergyKey[]).reduce(
    (next, key) => {
      next[key] =
        activeKeys.includes(key)
          ? pollenCounts[key] * 3.8 * effectiveSensitivities[key]
          : 0;
      return next;
    },
    { tree: 0, grass: 0, weed: 0 } as Record<AllergyKey, number>
  );

  const contributions =
    weightedUpiContributions;

  const total = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const topEntry = (Object.entries(contributions) as Array<[AllergyKey, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const score = clamp(total * 1.08);

  return {
    score,
    level: getLevel(score),
    topAllergen: topEntry[0],
    topContributionPercent: total > 0 ? Math.round((topEntry[1] / total) * 100) : 0,
    contributions
  };
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
  };

  return `${label[active[0][0]]} is driving today's risk`;
}

export function calculateDaySeverity(
  day: DayForecast,
  profile: UserProfile,
  pollenUnit: "upi" | "grains_per_m3" = "grains_per_m3"
): SeverityResult {
  const triggerBreakdown = getDailyBreakdown(day);
  const pollenCounts = getDailyPollenCounts(day);
  const totalPollen = Object.values(pollenCounts).reduce((sum, value) => sum + value, 0);
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
  const reactionScore = getReactionScore(
    pollenCounts,
    profile.allergies,
    profile.sensitivities,
    profile.mode
  );

  const score =
    pollenUnit === "upi"
      ? getEnvironmentalUpiScore(pollenCounts)
      : getEnvironmentalPollenScore(totalPollen);

  return {
    date: day.date,
    score,
    level: getLevel(score),
    pollenRisk,
    sensitivityRisk,
    symptomRisk,
    weatherModifier,
    triggerBreakdown,
    pollenCounts,
    reactionScore,
    mainTrigger: getMainTrigger(triggerBreakdown, profile.allergies),
    hasPollenData
  };
}

export function calculateForecast(
  days: DayForecast[],
  profile: UserProfile,
  pollenUnit: "upi" | "grains_per_m3" = "grains_per_m3"
) {
  return days.map((day) => calculateDaySeverity(day, profile, pollenUnit));
}
