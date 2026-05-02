"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  Pill,
  Radar,
  Search,
  Sprout,
  SunMedium
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

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(PROFILE_KEY);
    const savedLogs = window.localStorage.getItem(LOG_KEY);

    if (savedProfile) {
      setProfile(JSON.parse(savedProfile) as UserProfile);
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
    if (!forecast) {
      return [];
    }

    return calculateForecast(forecast.days, profile);
  }, [forecast, profile]);

  const today = severity[0];
  const loggedToday = logs.some((log) => log.date === todayKey());

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
        if (locationError instanceof DOMException && locationError.name === "AbortError") {
          return;
        }

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

  async function loadForecast(nextProfile: UserProfile, demo = false) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        demo: String(demo),
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
      sensitivities: {
        ...current.sensitivities,
        [key]: value
      }
    }));
  }

  function toggleAllergy(key: AllergyKey) {
    setProfile((current) => ({
      ...current,
      allergies: {
        ...current.allergies,
        [key]: !current.allergies[key]
      }
    }));
  }

  function logSymptoms() {
    if (loggedToday) {
      return;
    }

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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 border-b border-moss/10 pb-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase text-fern">
            <Sprout size={18} />
            Hackathon MVP
          </div>
          <h1 className="mt-2 text-4xl font-bold text-ink sm:text-5xl">AllergyCast</h1>
          <p className="mt-2 max-w-2xl text-base text-ink/70">
            A personalized pollen and weather risk dashboard for seasonal allergies.
          </p>
        </div>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-moss"
          onClick={() => loadForecast(profile, true)}
          type="button"
        >
          <Radar size={18} />
          Demo mode
        </button>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
            <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase text-fern">Today</p>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    {today ? today.level : "No forecast yet"}
                  </h2>
                </div>
                <div
                  className={`grid h-28 w-28 place-items-center rounded-full border-8 ${
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

              <div className="mt-5 rounded-md bg-skywash p-4">
                <div className="flex items-start gap-3">
                  <SunMedium className="mt-0.5 text-moss" size={20} />
                  <div>
                    <h3 className="font-bold text-ink">What should I do?</h3>
                    <p className="mt-1 text-sm leading-6 text-ink/75">
                      {today ? recommendationByLevel[today.level] : "Add a location or start demo mode to get guidance."}
                    </p>
                  </div>
                </div>
              </div>

              {today ? (
                <p className="mt-4 text-sm font-medium text-ink/70">{today.mainTrigger}.</p>
              ) : null}
            </section>

            <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Trigger breakdown</h2>
                <Activity className="text-fern" size={21} />
              </div>
              <div className="mt-5 space-y-4">
                {(Object.keys(allergyLabels) as AllergyKey[]).map((key) => {
                  const value = today?.triggerBreakdown[key] ?? 0;

                  return (
                    <div key={key}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-semibold text-ink">{allergyLabels[key]}</span>
                        <span className="text-ink/60">{Math.round(value)}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-moss/10">
                        <div className="h-full rounded-full bg-fern" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {forecast && !forecast.hasPollenData ? (
                <div className="mt-5 flex flex-col gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                  <span>{forecast.message}</span>
                  </div>
                  <button
                    className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-yellow-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink"
                    onClick={() => loadForecast(profile, true)}
                    type="button"
                  >
                    <Radar size={15} />
                    Show demo pollen data
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-soft">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <h2 className="text-xl font-bold text-ink">5-day forecast</h2>
              <span className="text-sm text-ink/60">
                {forecast ? `${forecast.source === "demo" ? "Seeded demo" : "Open-Meteo"} data for ${forecast.location.label}` : "Waiting for location"}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {severity.length > 0
                ? severity.map((day) => (
                    <article key={day.date} className="rounded-md border border-moss/10 bg-[#fbfdf9] p-4">
                      <p className="text-sm font-semibold text-ink/60">{formatDate(day.date)}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`rounded-full border px-3 py-1 text-sm font-bold ${levelStyles[day.level]}`}>
                          {day.level}
                        </span>
                        <span className="text-2xl font-black text-ink">{Math.round(day.score)}</span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-moss/10">
                        <div className={`h-full ${scoreColor(day.score)}`} style={{ width: `${day.score}%` }} />
                      </div>
                      <p className="mt-3 text-xs leading-5 text-ink/65">{day.mainTrigger}.</p>
                    </article>
                  ))
                : Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-36 rounded-md border border-dashed border-moss/20 bg-mint/20" />
                  ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-bold text-ink">Profile</h2>
            <form className="mt-4 space-y-4" onSubmit={submitLocation}>
              <label className="block">
                <span className="text-sm font-semibold text-ink/70">Location</span>
                <div className="relative mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="focus-ring w-full rounded-md border border-moss/20 px-3 py-3"
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
                    className="focus-ring grid h-12 w-12 place-items-center rounded-md bg-fern text-white transition hover:bg-moss"
                    type="submit"
                    aria-label="Search location"
                  >
                    {loading ? <Loader2 className="animate-spin" size={19} /> : <Search size={19} />}
                  </button>
                </div>
              </label>

              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-4 py-3 font-semibold text-moss transition hover:bg-mint"
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

            <div className="mt-5 space-y-4">
              {(Object.keys(allergyLabels) as AllergyKey[]).map((key) => (
                <div key={key} className="rounded-md border border-moss/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 font-semibold text-ink">
                      <input
                        checked={profile.allergies[key]}
                        onChange={() => toggleAllergy(key)}
                        type="checkbox"
                      />
                      {allergyLabels[key]}
                    </label>
                    <span className="text-sm text-ink/60">Sensitivity {profile.sensitivities[key]}</span>
                  </div>
                  <input
                    className="mt-3 w-full"
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
          </section>

          <section className="rounded-lg border border-moss/10 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-bold text-ink">Today's symptoms</h2>
            <label className="mt-4 block">
              <div className="flex justify-between text-sm font-semibold text-ink/70">
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
              <label className="flex items-center justify-between rounded-md border border-moss/10 p-3 font-medium">
                <span className="flex items-center gap-2">
                  <Pill size={17} />
                  Medication taken
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
              <label className="flex items-center justify-between rounded-md border border-moss/10 p-3 font-medium">
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
              className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-moss/35"
              disabled={loggedToday}
              onClick={logSymptoms}
              type="button"
            >
              <CheckCircle2 size={18} />
              {loggedToday ? "Logged today" : "Log symptoms"}
            </button>

            {logs.length > 0 ? (
              <div className="mt-4 space-y-2">
                {logs.slice(0, 4).map((log) => (
                  <div key={log.date} className="flex justify-between rounded-md bg-mint/45 px-3 py-2 text-sm">
                    <span>{formatDate(log.date)}</span>
                    <span className="font-bold">{log.score}/10</span>
                  </div>
                ))}
              </div>
            ) : null}
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
