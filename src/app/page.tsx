"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Compass,
  Loader2,
  MapPin,
  Pill,
  Search,
  Sprout,
  SunMedium,
  Wind
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  calculateForecast,
  defaultProfile,
  recommendationByLevel
} from "@/lib/severity";
import type {
  AllergyKey,
  ForecastPayload,
  Sensitivities,
  SeverityLevel,
  SeverityResult,
  SymptomLog,
  UserProfile
} from "@/lib/types";

const PROFILE_KEY = "allergycast-profile";
const LOG_KEY = "allergycast-symptom-logs";

const allergyLabels: Record<AllergyKey, string> = {
  tree: "Tree",
  grass: "Grass",
  weed: "Weed/ragweed",
  mold: "Mold"
};

const allergyColors: Record<AllergyKey, string> = {
  tree: "#2d6a4f",
  grass: "#52b788",
  weed: "#f4a261",
  mold: "#9b5de5"
};

const levelStyles: Record<SeverityLevel, string> = {
  Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Moderate: "bg-yellow-100 text-yellow-900 border-yellow-200",
  High: "bg-orange-100 text-orange-900 border-orange-200",
  Severe: "bg-red-100 text-red-900 border-red-200"
};

type LocationOption = {
  latitude: number;
  longitude: number;
  label: string;
};

type QuizState = {
  season: "spring" | "summer" | "fall" | "all";
  outdoors: "yes" | "no" | "sometimes";
  severity: "mild" | "moderate" | "severe";
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function scoreColor(score: number) {
  if (score >= 76) return "bg-red-500";
  if (score >= 56) return "bg-orange-500";
  if (score >= 31) return "bg-yellow-400";
  return "bg-emerald-500";
}

function pollenLevel(count: number) {
  if (count >= 500) return { label: "Very High", className: "bg-red-100 text-red-800 border-red-200" };
  if (count >= 151) return { label: "High", className: "bg-orange-100 text-orange-800 border-orange-200" };
  if (count >= 51) return { label: "Moderate", className: "bg-yellow-100 text-yellow-900 border-yellow-200" };
  return { label: "Low", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

function trendArrow(day: SeverityResult, today?: SeverityResult) {
  if (!today) return "→";
  const delta = day.score - today.score;
  if (delta > 3) return "↑";
  if (delta < -3) return "↓";
  return "→";
}

function conditionIcon(day: SeverityResult) {
  if (day.weatherModifier > 58) return Wind;
  if (day.weatherModifier < 44) return Cloud;
  return SunMedium;
}

function normalizeProfile(saved: Partial<UserProfile>): UserProfile {
  const base = defaultProfile();

  return {
    ...base,
    ...saved,
    mode: saved.mode ?? base.mode,
    allergies: { ...base.allergies, ...saved.allergies },
    sensitivities: { ...base.sensitivities, ...saved.sensitivities }
  };
}

function estimateSensitivities(quiz: QuizState): Sensitivities {
  const next: Sensitivities = { tree: 3, grass: 3, weed: 3, mold: 3 };

  if (quiz.season === "spring") next.tree = 5;
  if (quiz.season === "summer") next.grass = 5;
  if (quiz.season === "fall") next.weed = 5;
  if (quiz.season === "all") {
    next.tree = 4;
    next.grass = 4;
    next.weed = 4;
    next.mold = 4;
  }

  if (quiz.outdoors === "yes") {
    next.tree = Math.min(5, next.tree + 1);
    next.grass = Math.min(5, next.grass + 1);
    next.weed = Math.min(5, next.weed + 1);
  }

  if (quiz.severity === "severe") {
    (Object.keys(next) as AllergyKey[]).forEach((key) => {
      next[key] = Math.min(5, next[key] + 1);
    });
  }

  if (quiz.severity === "mild") {
    (Object.keys(next) as AllergyKey[]).forEach((key) => {
      next[key] = Math.max(1, next[key] - 1);
    });
  }

  return next;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload as T;
}

export default function Home() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [query, setQuery] = useState("");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [quiz, setQuiz] = useState<QuizState>({
    season: "spring",
    outdoors: "sometimes",
    severity: "moderate"
  });

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(PROFILE_KEY);
    const savedLogs = window.localStorage.getItem(LOG_KEY);

    if (savedProfile) {
      setProfile(normalizeProfile(JSON.parse(savedProfile) as Partial<UserProfile>));
    }

    if (savedLogs) {
      setLogs(JSON.parse(savedLogs) as SymptomLog[]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  }, [logs]);

  const severity = useMemo<SeverityResult[]>(() => {
    if (!forecast) return [];
    return calculateForecast(forecast.days, profile);
  }, [forecast, profile]);

  const today = severity[0];
  const reaction = today?.reactionScore;
  const loggedToday = logs.some((log) => log.date === todayKey());
  const totalPollen = today
    ? Object.values(today.pollenCounts).reduce((sum, value) => sum + value, 0)
    : 0;

  useEffect(() => {
    if (query.trim().length < 2) {
      setLocationOptions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggesting(true);

      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          setLocationOptions([]);
          return;
        }

        const payload = (await response.json()) as LocationOption & { results?: LocationOption[] };
        setLocationOptions(payload.results ?? [payload]);
      } catch (locationError) {
        if (locationError instanceof DOMException && locationError.name === "AbortError") return;
        setLocationOptions([]);
      } finally {
        setSuggesting(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  async function loadForecast(nextProfile: UserProfile) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        label: nextProfile.locationLabel || "Selected location"
      });

      if (nextProfile.latitude !== null && nextProfile.longitude !== null) {
        params.set("lat", String(nextProfile.latitude));
        params.set("lon", String(nextProfile.longitude));
      }

      const payload = await fetchJson<ForecastPayload>(`/api/forecast?${params}`);
      setForecast(payload);
      setProfile((current) => ({
        ...current,
        locationLabel: payload.location.label,
        latitude: payload.location.latitude,
        longitude: payload.location.longitude
      }));
    } catch (forecastError) {
      setError(forecastError instanceof Error ? forecastError.message : "Could not load forecast.");
    } finally {
      setLoading(false);
    }
  }

  async function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      setError("Enter a city or ZIP code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const location = await fetchJson<LocationOption>(
        `/api/geocode?q=${encodeURIComponent(query)}`
      );
      await selectLocation(location);
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not find that location.");
    } finally {
      setLoading(false);
    }
  }

  async function selectLocation(location: LocationOption) {
    const nextProfile = {
      ...profile,
      latitude: location.latitude,
      longitude: location.longitude,
      locationLabel: location.label
    };

    setQuery(location.label);
    setLocationOptions([]);
    setProfile(nextProfile);
    await loadForecast(nextProfile);
  }

  function useGps() {
    if (!navigator.geolocation) {
      setError("GPS is not available in this browser.");
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextProfile = {
          ...profile,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationLabel: "Current location"
        };

        setProfile(nextProfile);
        setLocating(false);
        await loadForecast(nextProfile);
      },
      () => {
        setLocating(false);
        setError("Location permission was denied. Enter a city or ZIP instead.");
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  }

  function updateSensitivity(key: AllergyKey, value: number) {
    setProfile((current) => ({
      ...current,
      mode: "known",
      sensitivities: {
        ...current.sensitivities,
        [key]: value
      }
    }));
  }

  function toggleAllergy(key: AllergyKey) {
    setProfile((current) => ({
      ...current,
      mode: "known",
      allergies: {
        ...current.allergies,
        [key]: !current.allergies[key]
      }
    }));
  }

  function setProfileMode(mode: UserProfile["mode"]) {
    setProfile((current) => ({
      ...current,
      mode,
      allergies:
        mode === "general"
          ? { tree: true, grass: true, weed: true, mold: true }
          : current.allergies,
      sensitivities:
        mode === "general"
          ? { tree: 3, grass: 3, weed: 3, mold: 3 }
          : current.sensitivities
    }));
  }

  function applyQuizEstimate() {
    setProfile((current) => ({
      ...current,
      mode: "known",
      allergies: { tree: true, grass: true, weed: true, mold: true },
      sensitivities: estimateSensitivities(quiz)
    }));
  }

  function logSymptoms() {
    if (loggedToday) return;

    setLogs((current) => [
      {
        date: todayKey(),
        score: profile.currentSymptoms,
        notes: profile.medicationTaken ? "Medication taken" : undefined
      },
      ...current
    ]);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-4 overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5">
      <header className="flex flex-col justify-between gap-2 border-b border-moss/10 pb-3 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-fern">
            <Sprout size={15} />
            Pollen risk forecast
          </div>
          <h1 className="mt-1 text-3xl font-bold text-ink sm:text-4xl">AllergyScore</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/70">
            A personalized pollen and weather risk dashboard for seasonal allergies.
          </p>
        </div>
      </header>

      <section className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.35fr)_minmax(300px,0.95fr)] xl:grid-rows-[auto_auto_auto] xl:items-stretch">
        <aside className="order-1 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <section className="rounded-lg border border-moss/10 bg-white p-3 shadow-soft">
            <h2 className="text-lg font-bold text-ink">Profile</h2>
            <div className="mt-4 grid grid-cols-2 rounded-md bg-moss/10 p-1">
              {(["known", "general"] as const).map((mode) => (
                <button
                  className={`focus-ring rounded px-3 py-2 text-sm font-semibold ${
                    profile.mode === mode ? "bg-white text-moss shadow-sm" : "text-ink/65"
                  }`}
                  key={mode}
                  onClick={() => setProfileMode(mode)}
                  type="button"
                >
                  {mode === "known" ? "I know my triggers" : "General / Unknown"}
                </button>
              ))}
            </div>

            <form className="mt-3 space-y-2.5" onSubmit={submitLocation}>
              <label className="block">
                <span className="text-sm font-semibold text-ink/70">Location</span>
                <div className="relative mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="focus-ring w-full rounded-md border border-moss/20 px-3 py-2.5"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="City or ZIP"
                      value={query}
                    />
                    {query.trim().length >= 2 && (locationOptions.length > 0 || suggesting) ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-moss/15 bg-white shadow-soft">
                        {suggesting ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-sm text-ink/60">
                            <Loader2 className="animate-spin" size={15} />
                            Searching locations
                          </div>
                        ) : null}
                        {locationOptions.map((option) => (
                          <button
                            className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm transition hover:bg-mint/60 focus:bg-mint/60 focus:outline-none"
                            key={`${option.latitude}-${option.longitude}-${option.label}`}
                            onClick={() => selectLocation(option)}
                            type="button"
                          >
                            <MapPin className="mt-0.5 shrink-0 text-fern" size={15} />
                            <span className="font-medium text-ink">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    aria-label="Search location"
                    className="focus-ring grid h-11 w-11 place-items-center rounded-md bg-fern text-white transition hover:bg-moss"
                    type="submit"
                  >
                    {loading ? <Loader2 className="animate-spin" size={19} /> : <Search size={19} />}
                  </button>
                </div>
              </label>

              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-4 py-2.5 font-semibold text-moss transition hover:bg-mint"
                onClick={useGps}
                type="button"
              >
                {locating ? <Loader2 className="animate-spin" size={18} /> : <Compass size={18} />}
                Use GPS location
              </button>

              {profile.locationLabel ? (
                <div className="flex items-center gap-2 text-sm font-medium text-ink/65">
                  <MapPin size={16} />
                  {profile.locationLabel}
                </div>
              ) : null}
            </form>

            {profile.mode === "known" ? (
              <div className="mt-3 space-y-2.5">
                {(Object.keys(allergyLabels) as AllergyKey[]).map((key) => (
                  <div key={key} className="rounded-md border border-moss/10 p-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 font-semibold text-ink">
                        <input
                          checked={profile.allergies[key]}
                          onChange={() => toggleAllergy(key)}
                          type="checkbox"
                        />
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: allergyColors[key] }}
                          />
                          {allergyLabels[key]}
                        </span>
                      </label>
                      <span className="text-sm text-ink/60">Sensitivity {profile.sensitivities[key]}</span>
                    </div>
                    <input
                      className="mt-2 w-full"
                      disabled={!profile.allergies[key]}
                      max={5}
                      min={1}
                      onChange={(event) => updateSensitivity(key, Number(event.target.value))}
                      type="range"
                      value={profile.sensitivities[key]}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-moss/10 bg-mint/30 p-3">
                <p className="font-bold text-ink">Estimate your sensitivities</p>
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-semibold text-ink/70">
                    Which seasons are worst for you?
                    <select
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-3 py-2"
                      onChange={(event) =>
                        setQuiz((current) => ({
                          ...current,
                          season: event.target.value as QuizState["season"]
                        }))
                      }
                      value={quiz.season}
                    >
                      <option value="spring">Spring</option>
                      <option value="summer">Summer</option>
                      <option value="fall">Fall</option>
                      <option value="all">All year</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-ink/70">
                    Do outdoor activities make symptoms worse?
                    <select
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-3 py-2"
                      onChange={(event) =>
                        setQuiz((current) => ({
                          ...current,
                          outdoors: event.target.value as QuizState["outdoors"]
                        }))
                      }
                      value={quiz.outdoors}
                    >
                      <option value="yes">Yes</option>
                      <option value="sometimes">Sometimes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-ink/70">
                    Typical symptom severity
                    <select
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-3 py-2"
                      onChange={(event) =>
                        setQuiz((current) => ({
                          ...current,
                          severity: event.target.value as QuizState["severity"]
                        }))
                      }
                      value={quiz.severity}
                    >
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                  </label>
                </div>
                <button
                  className="focus-ring mt-4 w-full rounded-md bg-moss px-4 py-3 font-semibold text-white hover:bg-ink"
                  onClick={applyQuizEstimate}
                  type="button"
                >
                  Estimate sensitivities
                </button>
              </div>
            )}
          </section>
        </aside>

        <div className="order-2 contents">
            <section className="flex min-h-[240px] flex-col justify-between rounded-lg border border-moss/10 bg-white p-4 shadow-soft xl:col-start-2 xl:row-start-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase text-fern">Today</p>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    {today ? today.level : "No forecast yet"}
                  </h2>
                </div>
                <div
                  className={`grid h-24 w-24 shrink-0 place-items-center rounded-full border-8 sm:h-28 sm:w-28 ${
                    today ? levelStyles[today.level] : "border-moss/10 bg-mint/50 text-moss"
                  }`}
                >
                  <span className="text-3xl font-black">{today ? Math.round(today.score) : "--"}</span>
                </div>
              </div>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-moss/10">
                <div
                  className={`h-full rounded-full transition-all ${today ? scoreColor(today.score) : "bg-moss/20"}`}
                  style={{ width: `${today ? today.score : 0}%` }}
                />
              </div>

              <div className="mt-4 rounded-md bg-skywash p-3">
                <div className="flex items-start gap-3">
                  <SunMedium className="mt-0.5 text-moss" size={20} />
                  <div>
                    <h3 className="font-bold text-ink">What should I do?</h3>
                    <p className="mt-1 text-sm leading-6 text-ink/75">
                      {today ? recommendationByLevel[today.level] : "Add a location to get guidance."}
                    </p>
                  </div>
                </div>
              </div>

              {today ? (
                <p className="mt-4 text-sm font-medium text-ink/70">{today.mainTrigger}.</p>
              ) : null}
            </section>

          <section className="flex min-h-[210px] flex-col justify-between rounded-lg border border-moss/10 bg-white p-4 shadow-soft xl:col-start-2 xl:row-start-2">
            <p className="text-sm font-semibold uppercase text-fern">
              {profile.mode === "general"
                ? "Average risk for allergy sufferers in your area"
                : "Your Reaction Score"}
            </p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-4xl font-black text-ink">
                  {reaction ? Math.round(reaction.score) : "--"}
                </h2>
                <span
                  className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${
                    reaction ? levelStyles[reaction.level] : "border-moss/10 bg-mint/50 text-moss"
                  }`}
                >
                  {reaction ? reaction.level : "Waiting"}
                </span>
              </div>
              <div className="h-24 w-24 rounded-full bg-moss/10 p-2">
                <div className="grid h-full w-full place-items-center rounded-full bg-white">
                  <div
                    className="h-16 w-16 rounded-full"
                    style={{
                      background: `conic-gradient(#52b788 ${reaction?.score ?? 0}%, #e6ece7 0)`
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/70">
              {reaction
                ? `${allergyLabels[reaction.topAllergen]} is responsible for ${reaction.topContributionPercent}% of your score today.`
                : "Add a location to calculate your reaction score."}
            </p>
            {profile.mode === "general" ? (
              <div className="mt-4 rounded-md border border-moss/10 bg-mint/35 p-3">
                <p className="text-sm font-semibold text-ink">Get a more accurate score</p>
                <p className="mt-1 text-sm text-ink/65">Set your sensitivities to personalize this number.</p>
                <button
                  className="focus-ring mt-3 rounded-md bg-moss px-3 py-2 text-sm font-semibold text-white hover:bg-ink"
                  onClick={() => setProfileMode("known")}
                  type="button"
                >
                  Set sensitivities
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-moss/10 bg-white p-4 shadow-soft xl:col-span-3 xl:col-start-1 xl:row-start-3">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <h2 className="text-lg font-bold text-ink">5-day forecast</h2>
              <span className="text-sm text-ink/60">
                {forecast
                  ? `${
                      forecast.source === "demo"
                        ? "Demo"
                        : forecast.source === "google-pollen"
                          ? "Google Pollen"
                          : "Open-Meteo"
                    } data for ${forecast.location.label}`
                  : "Waiting for location"}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {severity.length > 0
                ? severity.map((day) => {
                    const ConditionIcon = conditionIcon(day);

                    return (
                      <article key={day.date} className="rounded-md border border-moss/10 bg-[#fbfdf9] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink/60">{formatDate(day.date)}</p>
                          <ConditionIcon className="text-fern" size={18} />
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${levelStyles[day.level]}`}>
                            {day.level}
                          </span>
                          <span className="flex items-center gap-2 text-2xl font-black text-ink">
                            <span className="text-lg text-ink/50">{trendArrow(day, today)}</span>
                            {Math.round(day.score)}
                          </span>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-moss/10">
                          <div className={`h-full ${scoreColor(day.score)}`} style={{ width: `${day.score}%` }} />
                        </div>
                      </article>
                    );
                  })
                : Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-36 rounded-md border border-dashed border-moss/20 bg-mint/20" />
                  ))}
            </div>
          </section>
        </div>

        <aside className="order-3 contents">
          <section className="rounded-lg border border-moss/10 bg-white p-4 shadow-soft xl:col-start-3 xl:row-start-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Trigger breakdown</h2>
              <Activity className="text-fern" size={21} />
            </div>
            <div className="mt-3 rounded-md bg-mint/35 p-3">
              <p className="text-sm font-semibold text-ink/60">Total pollen today</p>
              <p className="mt-1 text-2xl font-black text-ink">{Math.round(totalPollen)} grains/m³</p>
            </div>
            <div className="mt-4 space-y-4">
              {(Object.keys(allergyLabels) as AllergyKey[]).map((key) => {
                const count = today?.pollenCounts[key] ?? 0;
                const level = pollenLevel(count);
                const width = Math.min(100, (count / 500) * 100);

                return (
                  <div key={key}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: allergyColors[key] }}
                        />
                        <span className="font-semibold text-ink">{allergyLabels[key]}</span>
                      </div>
                      <span className="text-right text-sm font-bold text-ink">
                        {Math.round(count)} grains/m³
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-moss/10">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${width}%`, backgroundColor: allergyColors[key] }}
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${level.className}`}>
                        {level.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {forecast && !forecast.hasPollenData ? (
              <div className="mt-5 flex gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <span>{forecast.message}</span>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-moss/10 bg-white p-4 shadow-soft xl:col-start-3 xl:row-start-2">
              <h2 className="text-lg font-bold text-ink">Today&apos;s symptoms</h2>
            <label className="mt-4 block">
              <div className="flex justify-between gap-3 text-sm font-semibold text-ink/70">
                <span>Current symptoms</span>
                <span>{profile.currentSymptoms}/10</span>
              </div>
              <input
                className="mt-3 w-full"
                max={10}
                min={0}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    currentSymptoms: Number(event.target.value)
                  }))
                }
                type="range"
                value={profile.currentSymptoms}
              />
            </label>

            <div className="mt-4 grid gap-3">
              <label className="flex items-center justify-between gap-3 rounded-md border border-moss/10 p-3 font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <Pill className="shrink-0" size={17} />
                  <span>Medication taken</span>
                </span>
                <input
                  checked={profile.medicationTaken}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      medicationTaken: event.target.checked
                    }))
                  }
                  type="checkbox"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-moss/10 p-3 font-medium">
                <span>Outdoor exposure planned</span>
                <input
                  checked={profile.outdoorExposure}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      outdoorExposure: event.target.checked
                    }))
                  }
                  type="checkbox"
                />
              </label>
            </div>

            <button
              className={`focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold text-white transition ${
                loggedToday ? "bg-emerald-600" : "bg-moss hover:bg-ink"
              }`}
              disabled={loggedToday}
              onClick={logSymptoms}
              type="button"
            >
              <CheckCircle2 size={18} />
              {loggedToday ? "Logged today" : "Log symptoms"}
            </button>
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
              {error}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
