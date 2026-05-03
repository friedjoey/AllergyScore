export type AllergyKey = "tree" | "grass" | "weed";

export type SeverityLevel = "Low" | "Moderate" | "High" | "Severe";

export type Sensitivities = Record<AllergyKey, number>;

export type ProfileMode = "known" | "general";

export type UserProfile = {
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  mode: ProfileMode;
  allergies: Record<AllergyKey, boolean>;
  sensitivities: Sensitivities;
  asthmaRisk: boolean;
  currentSymptoms: number;
  medicationTaken: boolean;
  outdoorExposure: boolean;
};

export type SymptomLog = {
  date: string;
  score: number;
  notes?: string;
  allergyScore?: number;
  topTrigger?: AllergyKey;
};

export type ForecastHour = {
  time: string;
  alder_pollen?: number | null;
  birch_pollen?: number | null;
  grass_pollen?: number | null;
  mugwort_pollen?: number | null;
  olive_pollen?: number | null;
  ragweed_pollen?: number | null;
  wind_speed_10m?: number | null;
  precipitation?: number | null;
};

export type DayForecast = {
  date: string;
  hours: ForecastHour[];
};

export type TriggerBreakdown = {
  tree: number;
  grass: number;
  weed: number;
};

export type PollenCounts = Record<AllergyKey, number>;

export type AllergyScoreResult = {
  score: number;
  level: SeverityLevel;
  topAllergen: AllergyKey;
  topContributionPercent: number;
  contributions: Record<AllergyKey, number>;
};

export type SeverityResult = {
  date: string;
  score: number;
  level: SeverityLevel;
  pollenRisk: number;
  sensitivityRisk: number;
  symptomRisk: number;
  weatherModifier: number;
  triggerBreakdown: TriggerBreakdown;
  pollenCounts: PollenCounts;
  allergyScore: AllergyScoreResult;
  mainTrigger: string;
  hasPollenData: boolean;
};

export type ForecastPayload = {
  location: {
    latitude: number;
    longitude: number;
    label: string;
  };
  days: DayForecast[];
  hasPollenData: boolean;
  source: "google-pollen" | "open-meteo" | "demo";
  pollenUnit: "upi" | "grains_per_m3";
  message?: string;
};
