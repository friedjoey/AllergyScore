import { NextResponse } from "next/server";
import { getMockForecast } from "@/lib/mockData";
import { fetchOpenMeteoForecast } from "@/lib/openMeteo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const demo = searchParams.get("demo") === "true";
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));
  const label = searchParams.get("label") ?? "Selected location";

  if (demo) {
    return NextResponse.json(getMockForecast(label));
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  try {
    const forecast = await fetchOpenMeteoForecast(latitude, longitude, label);
    return NextResponse.json(forecast);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forecast request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
