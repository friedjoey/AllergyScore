import { NextResponse } from "next/server";

type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
  postcodes?: string[];
};

const fallbackLocations = [
  { label: "Wilsonville, Oregon, US", latitude: 45.2998, longitude: -122.7737 },
  { label: "Corvallis, Oregon, US", latitude: 44.5646, longitude: -123.262 },
  { label: "Portland, Oregon, US", latitude: 45.5152, longitude: -122.6784 },
  { label: "Eugene, Oregon, US", latitude: 44.0521, longitude: -123.0868 },
  { label: "Salem, Oregon, US", latitude: 44.9429, longitude: -123.0351 },
  { label: "Seattle, Washington, US", latitude: 47.6062, longitude: -122.3321 },
  { label: "San Francisco, California, US", latitude: 37.7749, longitude: -122.4194 },
  { label: "Los Angeles, California, US", latitude: 34.0522, longitude: -118.2437 },
  { label: "New York, New York, US", latitude: 40.7128, longitude: -74.006 },
  { label: "Austin, Texas, US", latitude: 30.2672, longitude: -97.7431 },
  { label: "Chicago, Illinois, US", latitude: 41.8781, longitude: -87.6298 }
];

function fallbackSearch(query: string) {
  const normalizedQuery = query.toLowerCase();
  return fallbackLocations.filter((location) =>
    location.label.toLowerCase().includes(normalizedQuery)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const latitudeParam = searchParams.get("lat");
  const longitudeParam = searchParams.get("lon");
  const latitude = latitudeParam === null ? NaN : Number(latitudeParam);
  const longitude = longitudeParam === null ? NaN : Number(longitudeParam);

  if (latitudeParam !== null && longitudeParam !== null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      language: "en",
      format: "json"
    });

    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?${params}`, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Could not identify current city." }, { status: 502 });
    }

    const data = (await response.json()) as { results?: GeocodeResult[] };
    const result = data.results?.[0];

    if (!result) {
      return NextResponse.json({ error: "No nearby city found." }, { status: 404 });
    }

    const label = [result.name, result.admin1, result.country_code].filter(Boolean).join(", ");

    return NextResponse.json({
      latitude,
      longitude,
      label
    });
  }

  if (!query) {
    return NextResponse.json({ error: "Missing city or ZIP query." }, { status: 400 });
  }

  const params = new URLSearchParams({
    name: query,
    count: "5",
    language: "en",
    format: "json"
  });

  let results: GeocodeResult[] = [];

  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
      next: { revalidate: 86400 }
    });

    if (response.ok) {
      const data = (await response.json()) as { results?: GeocodeResult[] };
      results = data.results ?? [];
    }
  } catch {
    results = [];
  }

  if (results.length === 0) {
    const fallbackResults = fallbackSearch(query);
    if (fallbackResults.length > 0) {
      const result = fallbackResults[0];

      return NextResponse.json({
        latitude: result.latitude,
        longitude: result.longitude,
        label: result.label,
        results: fallbackResults
      });
    }
  }

  const result = results[0];

  if (!result) {
    return NextResponse.json({ error: "No matching location found." }, { status: 404 });
  }

  const label = [result.name, result.admin1, result.country_code].filter(Boolean).join(", ");

  return NextResponse.json({
    latitude: result.latitude,
    longitude: result.longitude,
    label,
    results: results.map((item) => ({
      latitude: item.latitude,
      longitude: item.longitude,
      label: [item.name, item.admin1, item.country_code].filter(Boolean).join(", ")
    }))
  });
}
