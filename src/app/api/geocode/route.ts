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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
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

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
    next: { revalidate: 86400 }
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Could not geocode that location." }, { status: 502 });
  }

  const data = (await response.json()) as { results?: GeocodeResult[] };
  const results = data.results ?? [];
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
