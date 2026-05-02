# AllergyCast

AllergyCast is a hackathon MVP that estimates location-specific seasonal allergy severity from a user's allergy profile, symptoms, and pollen forecast data.

## Features

- User profile form with allergy sensitivity, symptoms, medication, and planned outdoor exposure
- GPS location support with city or ZIP fallback geocoding
- Next.js API routes for Open-Meteo Air Quality and weather forecast calls
- Severity scoring from 0 to 100 with Low, Moderate, High, and Severe bands
- 5-day forecast cards, trigger breakdown bars, and recommendation guidance
- Daily symptom logging saved in `localStorage`
- Demo mode with mock pollen/weather data when API coverage is limited or judges need a guaranteed walkthrough

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

For the easiest demo path:

1. Run the two commands above.
2. Open the app.
3. Click **Demo mode** to load seeded pollen data immediately.
4. Adjust allergies, sensitivities, symptoms, medication, and outdoor exposure to see the score change.

To test live data, enter a city or ZIP code, or use GPS when the browser asks for location permission.

## API Notes

The forecast route calls:

- Open-Meteo Air Quality API for pollen variables:
  `alder_pollen`, `birch_pollen`, `grass_pollen`, `mugwort_pollen`, `olive_pollen`, `ragweed_pollen`
- Open-Meteo Weather Forecast API for wind speed and precipitation context

Open-Meteo pollen coverage varies by region. If pollen data is missing, the app shows a clear fallback message and can use seeded demo data.
