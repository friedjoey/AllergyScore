"use client";

import {
  Activity,
  AlertTriangle,
  Cloud,
  Compass,
  Trash2,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Save,
  Search,
  Sprout,
  SunMedium,
  UserPlus,
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
const PROFILE_LIST_KEY = "allergycast-saved-profiles";
const ACTIVE_PROFILE_KEY = "allergycast-active-profile-id";

const allergyLabels: Record<AllergyKey, string> = {
  tree: "Tree",
  grass: "Grass",
  weed: "Weed/ragweed"
};

const allergyColors: Record<AllergyKey, string> = {
  tree: "#2d6a4f",
  grass: "#52b788",
  weed: "#f4a261"
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

type SavedProfile = {
  id: string;
  name: string;
  profile: UserProfile;
  logs: SymptomLog[];
  updatedAt: string;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function getMockSymptomLogs(): SymptomLog[] {
  const scores = [4, 5, 7, 6, 5, 8, 6];
  const notes = [
    "Runny nose and mild itchy eyes after walking outside.",
    "Runny nose, sneezing, and light congestion.",
    "Hives, runny nose, itchy eyes, and congestion after outdoor exposure.",
    "Runny nose, itchy throat, and moderate congestion.",
    "Sneezing and runny nose, improved indoors.",
    "Hives, runny nose, itchy eyes, and worse congestion after yard work.",
    "Runny nose, watery eyes, and mild skin itching."
  ];
  const today = new Date();

  return scores.map((score, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);

    return {
      date: date.toISOString().slice(0, 10),
      score,
      notes: notes[index]
    };
  });
}

function scoreColor(score: number) {
  if (score >= 76) return "bg-red-500";
  if (score >= 56) return "bg-orange-500";
  if (score >= 31) return "bg-yellow-400";
  return "bg-emerald-500";
}

function displayedLevel(score: number, asthmaRisk: boolean): SeverityLevel {
  if (asthmaRisk) {
    if (score >= 65) return "Severe";
    if (score >= 31) return "High";
    if (score >= 16) return "Moderate";
    return "Low";
  }

  if (score >= 76) return "Severe";
  if (score >= 56) return "High";
  if (score >= 31) return "Moderate";
  return "Low";
}

function recommendationFor(level: SeverityLevel, asthmaRisk: boolean) {
  if (!asthmaRisk) {
    return recommendationByLevel[level];
  }

  const asthmaAdvice: Record<SeverityLevel, string> = {
    Low: "Breathing risk looks manageable today. Keep your usual inhaler or care plan available if you use one.",
    Moderate: "Plan ahead before outdoor exposure. Keep rescue medication nearby and watch for coughing, wheezing, or chest tightness.",
    High: "Limit outdoor time and monitor breathing closely. Follow your care plan if symptoms start.",
    Severe: "Stay indoors if possible. Seek medical help if breathing symptoms worsen or rescue medicine is not helping."
  };

  return asthmaAdvice[level];
}

function pollenLevel(count: number) {
  if (count >= 500) return { label: "Very High", className: "bg-red-100 text-red-800 border-red-200" };
  if (count >= 151) return { label: "High", className: "bg-orange-100 text-orange-800 border-orange-200" };
  if (count >= 51) return { label: "Moderate", className: "bg-yellow-100 text-yellow-900 border-yellow-200" };
  return { label: "Low", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

function upiLevel(index: number) {
  if (index >= 5) return { label: "Very High", className: "bg-red-100 text-red-800 border-red-200" };
  if (index >= 4) return { label: "High", className: "bg-orange-100 text-orange-800 border-orange-200" };
  if (index >= 3) return { label: "Moderate", className: "bg-yellow-100 text-yellow-900 border-yellow-200" };
  if (index >= 1) return { label: "Low", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  return { label: "None", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

function formatPollenValue(value: number, unit?: ForecastPayload["pollenUnit"]) {
  if (unit === "upi") {
    return `${value.toFixed(1)} UPI`;
  }

  return `${Math.round(value)} grains/m³`;
}

function trendArrow(day: SeverityResult, today?: SeverityResult) {
  if (!today) return "→";
  const delta = day.allergyScore.score - today.allergyScore.score;
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
  const next: Sensitivities = { tree: 3, grass: 3, weed: 3 };

  if (quiz.season === "spring") next.tree = 5;
  if (quiz.season === "summer") next.grass = 5;
  if (quiz.season === "fall") next.weed = 5;
  if (quiz.season === "all") {
    next.tree = 4;
    next.grass = 4;
    next.weed = 4;
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
  const [profileName, setProfileName] = useState("My profile");
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [loadedInitialForecast, setLoadedInitialForecast] = useState(false);
  const [symptomNotes, setSymptomNotes] = useState("");
  const [editingTodayLog, setEditingTodayLog] = useState(false);
  const [quiz, setQuiz] = useState<QuizState>({
    season: "spring",
    outdoors: "sometimes",
    severity: "moderate"
  });

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(PROFILE_KEY);
    const savedLogs = window.localStorage.getItem(LOG_KEY);
    const savedProfileList = window.localStorage.getItem(PROFILE_LIST_KEY);
    const savedActiveProfileId = window.localStorage.getItem(ACTIVE_PROFILE_KEY);

    if (savedProfileList) {
      const parsedProfiles = JSON.parse(savedProfileList) as SavedProfile[];
      setSavedProfiles(parsedProfiles);

      if (savedActiveProfileId) {
        const activeProfile = parsedProfiles.find((item) => item.id === savedActiveProfileId);
        if (activeProfile) {
          setActiveProfileId(activeProfile.id);
          setProfileName(activeProfile.name);
          setProfile(normalizeProfile(activeProfile.profile));
          setLogs(activeProfile.logs);
          setQuery(activeProfile.profile.locationLabel);
          return;
        }
      }
    }

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

  useEffect(() => {
    window.localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(savedProfiles));
  }, [savedProfiles]);

  useEffect(() => {
    if (activeProfileId) {
      window.localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
    }
  }, [activeProfileId]);

  const severity = useMemo<SeverityResult[]>(() => {
    if (!forecast) return [];
    return calculateForecast(forecast.days, profile, forecast.pollenUnit);
  }, [forecast, profile]);

  const today = severity[0];
  const allergyScore = today?.allergyScore;
  const todayLevel = today ? displayedLevel(today.score, profile.asthmaRisk) : undefined;
  const allergyScoreLevel = allergyScore ? displayedLevel(allergyScore.score, profile.asthmaRisk) : undefined;
  const totalPollen = today
    ? Object.values(today.pollenCounts).reduce((sum, value) => sum + value, 0)
    : 0;
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayLog = logs.find((log) => log.date === todayDate);
  const loggedToday = Boolean(todayLog);
  const patternTrigger = allergyScore ? allergyLabels[allergyScore.topAllergen] : "Tree";
  const averageSymptomScore =
    logs.length > 0
      ? logs.reduce((sum, log) => sum + log.score, 0) / logs.length
      : 0;

  useEffect(() => {
    if (loadedInitialForecast || forecast || profile.latitude === null || profile.longitude === null) {
      return;
    }

    setLoadedInitialForecast(true);
    void loadForecast(profile);
  }, [forecast, loadedInitialForecast, profile]);

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

  async function loadDemoForecast() {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchJson<ForecastPayload>("/api/forecast?demo=true&label=Corvallis%2C%20Oregon%2C%20US");
      setForecast(payload);
      setProfile((current) => ({
        ...current,
        locationLabel: payload.location.label,
        latitude: payload.location.latitude,
        longitude: payload.location.longitude
      }));
      setQuery(payload.location.label);
      setLogs(getMockSymptomLogs());
    } catch (forecastError) {
      setError(forecastError instanceof Error ? forecastError.message : "Could not load demo forecast.");
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
        let locationLabel = "Current location";
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        try {
          const location = await fetchJson<LocationOption>(
            `/api/geocode?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
          );
          locationLabel = location.label;
        } catch {
          locationLabel = "Current location";
        }

        const nextProfile = {
          ...profile,
          latitude,
          longitude,
          locationLabel
        };

        setQuery(locationLabel);
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
          ? { tree: true, grass: true, weed: true }
          : current.allergies,
      sensitivities:
        mode === "general"
          ? { tree: 3, grass: 3, weed: 3 }
          : current.sensitivities
    }));
  }

  function applyQuizEstimate() {
    setProfile((current) => ({
      ...current,
      mode: "known",
      allergies: { tree: true, grass: true, weed: true },
      sensitivities: estimateSensitivities(quiz)
    }));
  }

  function logSymptoms() {
    const nextLog: SymptomLog = {
      date: todayDate,
      score: profile.currentSymptoms,
      notes: symptomNotes || `AllergyScore ${allergyScore ? Math.round(allergyScore.score) : "--"}`,
      allergyScore: allergyScore ? Math.round(allergyScore.score) : undefined,
      topTrigger: allergyScore?.topAllergen
    };

    if (loggedToday && editingTodayLog) {
      setLogs((current) => current.map((log) => (log.date === todayDate ? nextLog : log)));
      setEditingTodayLog(false);
      setSymptomNotes("");
      return;
    }

    if (loggedToday) return;

    setLogs((current) => [
      nextLog,
      ...current
    ]);
    setSymptomNotes("");
  }

  function editTodayLog() {
    if (!todayLog) return;

    setProfile((current) => ({
      ...current,
      currentSymptoms: todayLog.score
    }));
    setSymptomNotes(todayLog.notes ?? "");
    setEditingTodayLog(true);
  }

  function cancelTodayLogEdit() {
    setEditingTodayLog(false);
    setSymptomNotes("");
  }

  function removeTodayLog() {
    setLogs((current) => current.filter((log) => log.date !== todayDate));
    setEditingTodayLog(false);
    setSymptomNotes("");
  }

  function saveCurrentProfile() {
    const trimmedName = profileName.trim() || "My profile";
    const id = activeProfileId || crypto.randomUUID();
    const nextSavedProfile: SavedProfile = {
      id,
      name: trimmedName,
      profile,
      logs,
      updatedAt: new Date().toISOString()
    };

    setActiveProfileId(id);
    setProfileName(trimmedName);
    setSavedProfiles((current) => {
      const existingIndex = current.findIndex((item) => item.id === id);
      if (existingIndex === -1) return [nextSavedProfile, ...current];

      return current.map((item) => (item.id === id ? nextSavedProfile : item));
    });
  }

  function switchSavedProfile(savedProfile: SavedProfile) {
    const nextProfile = normalizeProfile(savedProfile.profile);

    setActiveProfileId(savedProfile.id);
    setProfileName(savedProfile.name);
    setProfile(nextProfile);
    setLogs(savedProfile.logs);
    setSymptomNotes("");
    setQuery(nextProfile.locationLabel);
    void loadForecast(nextProfile);
  }

  function selectSavedProfile(profileId: string) {
    const savedProfile = savedProfiles.find((item) => item.id === profileId);
    if (!savedProfile) return;

    switchSavedProfile(savedProfile);
  }

  function removeActiveProfile() {
    if (!activeProfileId) return;

    const remainingProfiles = savedProfiles.filter((item) => item.id !== activeProfileId);
    setSavedProfiles(remainingProfiles);

    const nextProfile = remainingProfiles[0];
    if (nextProfile) {
      switchSavedProfile(nextProfile);
      return;
    }

    const freshProfile = defaultProfile();
    setActiveProfileId("");
    setProfileName("My profile");
    setProfile(freshProfile);
    setLogs([]);
    setSymptomNotes("");
    setQuery(freshProfile.locationLabel);
    window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
    void loadForecast(freshProfile);
  }

  function startNewProfile() {
    const nextName = profileName.trim() || "New profile";
    const nextProfile = defaultProfile();
    const id = crypto.randomUUID();

    const nextSavedProfile: SavedProfile = {
      id,
      name: nextName,
      profile: nextProfile,
      logs: [],
      updatedAt: new Date().toISOString()
    };

    setLogs([]);
    setSymptomNotes("");
    setProfile(nextProfile);
    setProfileName(nextName);
    setActiveProfileId(id);
    setQuery(nextProfile.locationLabel);
    setSavedProfiles((current) => [nextSavedProfile, ...current]);
    void loadForecast(nextProfile);
  }

  function generateDoctorReport() {
    const recentLogs = logs.slice(0, 30);
    const rows = recentLogs
      .map(
        (log) => `
          <tr>
            <td>${formatDate(log.date)}</td>
            <td>${log.score}/10</td>
            <td>${log.allergyScore ?? "--"}</td>
            <td>${log.topTrigger ? allergyLabels[log.topTrigger] : "--"}</td>
            <td>${log.notes ?? ""}</td>
          </tr>
        `
      )
      .join("");
    const report = window.open("", "_blank");
    if (!report) return;

    report.document.write(`
      <html>
        <head>
          <title>AllergyScore Doctor Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #1c2621; padding: 32px; }
            .toolbar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
            button { background: #355e3b; border: 0; border-radius: 6px; color: white; cursor: pointer; font-weight: 700; padding: 10px 16px; }
            h1 { margin-bottom: 4px; }
            .meta { color: #53645a; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
            .card { border: 1px solid #dce7de; border-radius: 8px; padding: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #dce7de; text-align: left; padding: 8px; font-size: 13px; }
            th { background: #eef7ef; }
            @media print { .toolbar { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button onclick="window.print()">Print report</button>
          </div>
          <h1>AllergyScore Doctor Report</h1>
          <div class="meta">${profile.locationLabel} · Generated ${new Date().toLocaleDateString()}</div>
          <div class="grid">
            <div class="card"><strong>Top trigger</strong><br />${patternTrigger}</div>
            <div class="card"><strong>Average symptoms</strong><br />${logs.length > 0 ? averageSymptomScore.toFixed(1) : "--"}/10</div>
            <div class="card"><strong>Asthma flag</strong><br />${profile.asthmaRisk ? "Yes" : "No"}</div>
          </div>
          <h2>Last 30 days</h2>
          <table>
            <thead><tr><th>Date</th><th>Symptoms</th><th>AllergyScore</th><th>Top trigger</th><th>Notes</th></tr></thead>
            <tbody>${rows || "<tr><td colspan='5'>No symptom logs yet.</td></tr>"}</tbody>
          </table>
        </body>
      </html>
    `);
    report.document.close();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col gap-4 overflow-x-hidden px-6 py-4 sm:px-8 lg:px-12 xl:px-16">
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
        <button
          className="focus-ring inline-flex items-center justify-center rounded-md border border-moss/20 px-2.5 py-1.5 text-sm font-semibold text-moss transition hover:bg-mint"
          onClick={loadDemoForecast}
          type="button"
        >
          Demo mode
        </button>
      </header>

      <section className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(260px,0.82fr)_minmax(0,1.35fr)_minmax(300px,0.95fr)] xl:grid-rows-[auto_auto_auto_auto_auto_auto] xl:items-stretch">
        <aside className="order-1 flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <section className="rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft">
            <h2 className="text-base font-bold text-ink">Profile</h2>
            <div className="mt-3 grid grid-cols-2 rounded-md bg-moss/10 p-1">
              {(["known", "general"] as const).map((mode) => (
                <button
                  className={`focus-ring rounded px-2.5 py-1.5 text-sm font-semibold ${
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
                      className="focus-ring w-full rounded-md border border-moss/20 px-2.5 py-2"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="City or ZIP"
                      value={query}
                    />
                    {query.trim().length >= 2 && (locationOptions.length > 0 || suggesting) ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-moss/15 bg-white shadow-soft">
                        {suggesting ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-sm text-ink/60">
                            <Loader2 className="animate-spin" size={15} />
                            Searching locations
                          </div>
                        ) : null}
                        {locationOptions.map((option) => (
                          <button
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-mint/60 focus:bg-mint/60 focus:outline-none"
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
                    className="focus-ring grid h-10 w-10 place-items-center rounded-md bg-fern text-white transition hover:bg-moss"
                    type="submit"
                  >
                    {loading ? <Loader2 className="animate-spin" size={19} /> : <Search size={19} />}
                  </button>
                </div>
              </label>

              <button
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-2.5 py-1.5 font-semibold text-moss transition hover:bg-mint"
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

            <label className="mt-3 flex items-start gap-3 rounded-md border border-moss/10 bg-skywash p-3 text-sm font-semibold text-ink">
              <input
                checked={profile.asthmaRisk}
                className="mt-1"
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    asthmaRisk: event.target.checked
                  }))
                }
                type="checkbox"
              />
              <span>I have asthma or breathing sensitivity</span>
            </label>

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
              <div className="mt-3 rounded-md border border-moss/10 bg-mint/30 p-3">
                <p className="font-bold text-ink">Estimate your sensitivities</p>
                <div className="mt-3 space-y-3">
                  <label className="block text-sm font-semibold text-ink/70">
                    Which seasons are worst for you?
                    <select
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-2.5 py-1.5"
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
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-2.5 py-1.5"
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
                      className="focus-ring mt-2 w-full rounded-md border border-moss/20 bg-white px-2.5 py-1.5"
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
                  className="focus-ring mt-3 w-full rounded-md bg-moss px-4 py-2 font-semibold text-white hover:bg-ink"
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
            <section className="flex min-h-[360px] flex-col rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft xl:col-start-2 xl:row-span-2 xl:row-start-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase text-fern">Today</p>
                  <h2 className="mt-1 text-xl font-bold text-ink">
                    {todayLevel ?? "No forecast yet"}
                  </h2>
                  <p className="mt-1 text-sm text-ink/60">Environmental Risk</p>
                </div>
                <div
                  className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-[7px] sm:h-24 sm:w-24 ${
                    todayLevel ? levelStyles[todayLevel] : "border-moss/10 bg-mint/50 text-moss"
                  }`}
                >
                  <span className="text-xl font-black">{today ? Math.round(today.score) : "--"}</span>
                </div>
              </div>

              <div className="mt-3 h-3 overflow-hidden rounded-full bg-moss/10">
                <div
                  className={`h-full rounded-full transition-all ${today ? scoreColor(today.score) : "bg-moss/20"}`}
                  style={{ width: `${today ? today.score : 0}%` }}
                />
              </div>

              <div className="my-4 border-t border-moss/10" />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase text-fern">Your AllergyScore</p>
                  <p className="mt-1 text-sm text-ink/60">Based on your sensitivities</p>
                  <h3 className="mt-3 text-xl font-black text-ink">
                    {allergyScore ? Math.round(allergyScore.score) : "--"}
                  </h3>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${
                      allergyScoreLevel ? levelStyles[allergyScoreLevel] : "border-moss/10 bg-mint/50 text-moss"
                    }`}
                  >
                    {allergyScoreLevel ?? "Waiting"}
                  </span>
                </div>
                <div className="h-20 w-20 rounded-full bg-moss/10 p-2">
                  <div className="grid h-full w-full place-items-center rounded-full bg-white">
                    <div
                      className="h-12 w-12 rounded-full"
                      style={{
                        background: `conic-gradient(#52b788 ${allergyScore?.score ?? 0}%, #e6ece7 0)`
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-md bg-skywash">
                <div className="p-3">
                  <div>
                    <h3 className="font-bold text-ink">What should I do?</h3>
                    <p className="mt-0.5 text-xs font-semibold uppercase text-ink/45">
                      Based on your AllergyScore
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink/75">
                      {allergyScoreLevel ? recommendationFor(allergyScoreLevel, profile.asthmaRisk) : "Add a location to get guidance."}
                    </p>
                    {profile.asthmaRisk ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-moss">
                        <a href="https://www.nhlbi.nih.gov/health/asthma/treatment-action-plan" rel="noreferrer" target="_blank">
                          Asthma action plan
                        </a>
                        <a href="https://www.nhlbi.nih.gov/health/asthma/children" rel="noreferrer" target="_blank">
                          Children with asthma
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>

                {allergyScore ? (
                  <div className="border-t border-moss/10 bg-white/45 p-3">
                    <p className="text-sm font-bold text-ink">Personal Risk Factors</p>
                    <p className="mt-2 text-sm leading-6 text-ink/70">
                      Your AllergyScore is mainly based on {allergyLabels[allergyScore.topAllergen].toLowerCase()} pollen today.
                      AllergyScore compares the local pollen index with your saved sensitivity settings, then adjusts the guidance for your profile.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink/70">
                      {profile.asthmaRisk
                        ? "Because asthma risk is turned on, the app uses more cautious severity guidance."
                        : "Asthma risk is not turned on, so the app is using standard severity guidance."}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

          <section className="rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft xl:col-span-3 xl:col-start-1 xl:row-start-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <h2 className="text-base font-bold text-ink">Your 5-day AllergyScore forecast</h2>
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
                          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${levelStyles[displayedLevel(day.allergyScore.score, profile.asthmaRisk)]}`}>
                            {displayedLevel(day.allergyScore.score, profile.asthmaRisk)}
                          </span>
                          <span className="flex items-center gap-2 text-xl font-black text-ink">
                            <span className="text-lg text-ink/50">{trendArrow(day, today)}</span>
                            {Math.round(day.allergyScore.score)}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-moss/10">
                          <div
                            className={`h-full ${scoreColor(day.allergyScore.score)}`}
                            style={{ width: `${day.allergyScore.score}%` }}
                          />
                        </div>
                      </article>
                    );
                  })
                : Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-28 rounded-md border border-dashed border-moss/20 bg-mint/20" />
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:col-span-3 xl:col-start-1 xl:row-start-6 xl:grid-cols-2">
            <div className="rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-base font-bold text-ink">Profile manager</h2>
                  <p className="mt-1 text-sm text-ink/60">
                    Save profiles for different people and switch without losing symptom history.
                  </p>
                </div>
                <span className="rounded-full border border-moss/10 bg-mint/35 px-3 py-1 text-xs font-bold text-moss">
                  {savedProfiles.length} saved
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-mint/35 p-3">
                  <p className="text-xs font-semibold uppercase text-ink/50">Current</p>
                  <p className="mt-1 truncate text-base font-black text-ink">{profileName || "My profile"}</p>
                </div>
                <div className="rounded-md bg-skywash p-3">
                  <p className="text-xs font-semibold uppercase text-ink/50">Logs</p>
                  <p className="mt-1 text-base font-black text-ink">{logs.length}</p>
                </div>
                <div className="rounded-md bg-mint/35 p-3">
                  <p className="text-xs font-semibold uppercase text-ink/50">Location</p>
                  <p className="mt-1 truncate text-sm font-bold text-ink">{profile.locationLabel}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="block">
                  <span className="text-sm font-semibold text-ink/70">Profile name</span>
                  <input
                    className="focus-ring mt-2 w-full rounded-md border border-moss/20 px-2.5 py-2 text-sm"
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Example: Joey, Mom, Child"
                    value={profileName}
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[280px]">
                  <button
                    className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-moss px-2.5 py-1.5 text-sm font-semibold text-white transition hover:bg-ink"
                    onClick={saveCurrentProfile}
                    type="button"
                  >
                    <Save size={16} />
                    Save profile
                  </button>
                  <button
                    className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-2.5 py-1.5 text-sm font-semibold text-moss transition hover:bg-mint"
                    onClick={startNewProfile}
                    type="button"
                  >
                    <UserPlus size={16} />
                    New profile
                  </button>
                </div>
              </div>

              {savedProfiles.length > 0 ? (
                <label className="mt-3 block">
                  <span className="text-xs font-semibold uppercase text-ink/50">Switch profiles</span>
                  <div className="mt-2 flex gap-2">
                    <select
                      className="focus-ring min-w-0 flex-1 rounded-md border border-moss/20 bg-white px-2.5 py-2 text-sm font-semibold text-ink"
                      onChange={(event) => selectSavedProfile(event.target.value)}
                      value={activeProfileId}
                    >
                      {savedProfiles.map((savedProfile) => (
                        <option key={savedProfile.id} value={savedProfile.id}>
                          {savedProfile.name} ({savedProfile.logs.length} logs)
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label="Remove selected profile"
                      className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-md border border-red-200 text-red-700 transition hover:bg-red-50"
                      onClick={removeActiveProfile}
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </label>
              ) : (
                <p className="mt-3 rounded-md bg-mint/35 p-3 text-sm text-ink/65">
                  Name this setup, then save it so you can switch back later.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft">
              <h2 className="text-base font-bold text-ink">Symptom journal</h2>
            <label className="mt-3 block">
                <div className="flex justify-between text-sm font-semibold text-ink/70">
                  <span>Today&apos;s symptoms</span>
                  <span>{profile.currentSymptoms}/10</span>
                </div>
                <input
                  className="mt-2 w-full"
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
            <label className="mt-3 block">
              <span className="text-sm font-semibold text-ink/70">Notes</span>
              <textarea
                className="focus-ring mt-2 min-h-16 w-full rounded-md border border-moss/20 px-2.5 py-1.5 text-sm"
                onChange={(event) => setSymptomNotes(event.target.value)}
                placeholder="Symptoms, medication, outdoor exposure, sleep, or breathing notes"
                value={symptomNotes}
              />
            </label>
            {loggedToday && !editingTodayLog ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  className="focus-ring flex w-full items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-sm font-semibold text-white"
                  disabled
                  type="button"
                >
                  Logged today
                </button>
                <button
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-2.5 py-1.5 text-sm font-semibold text-moss transition hover:bg-mint"
                  onClick={editTodayLog}
                  type="button"
                >
                  <Pencil size={15} />
                  Edit today&apos;s log
                </button>
                <button
                  className="focus-ring flex w-full items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  onClick={removeTodayLog}
                  type="button"
                >
                  Remove today&apos;s log
                </button>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="focus-ring flex w-full items-center justify-center rounded-md bg-moss px-2.5 py-1.5 text-sm font-semibold text-white transition hover:bg-ink"
                  onClick={logSymptoms}
                  type="button"
                >
                  {editingTodayLog ? "Save changes" : "Log symptoms"}
                </button>
                {editingTodayLog ? (
                  <button
                    className="focus-ring flex w-full items-center justify-center rounded-md border border-moss/20 px-2.5 py-1.5 text-sm font-semibold text-moss transition hover:bg-mint"
                    onClick={cancelTodayLogEdit}
                    type="button"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            )}
            <button
              className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-moss/20 px-2.5 py-1.5 text-sm font-semibold text-moss transition hover:bg-mint"
              onClick={generateDoctorReport}
              type="button"
            >
              <FileText size={16} />
              Generate report for my doctor
            </button>
              {logs.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {logs.slice(0, 6).map((log) => (
                    <div key={log.date} className="rounded-md bg-mint/35 px-2.5 py-1.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink/70">{formatDate(log.date)}</span>
                        <span className="font-bold text-ink">{log.score}/10</span>
                      </div>
                      {log.notes ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/65">{log.notes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="order-3 contents">
          <section className="rounded-lg border border-moss/10 bg-white p-2.5 shadow-soft xl:col-start-3 xl:row-start-1">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Trigger breakdown</h2>
              <Activity className="text-fern" size={21} />
            </div>
            <div className="mt-3 rounded-md bg-mint/35 p-3">
              <p className="text-sm font-semibold text-ink/60">Total pollen today</p>
              <p className="mt-1 text-xl font-black text-ink">
                {formatPollenValue(totalPollen, forecast?.pollenUnit)}
              </p>
              {forecast?.pollenUnit === "upi" ? (
                <p className="mt-1 text-xs text-ink/55">
                  UPI means Universal Pollen Index, a 0-5 scale for pollen intensity.
                </p>
              ) : null}
            </div>
            <div className="mt-3 space-y-4">
              {(Object.keys(allergyLabels) as AllergyKey[]).map((key) => {
                const count = today?.pollenCounts[key] ?? 0;
                const isUpi = forecast?.pollenUnit === "upi";
                const level = isUpi ? upiLevel(count) : pollenLevel(count);
                const width = Math.min(100, (count / (isUpi ? 5 : 500)) * 100);

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
                        {formatPollenValue(count, forecast?.pollenUnit)}
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
              <div className="mt-3 flex gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <span>{forecast.message}</span>
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
