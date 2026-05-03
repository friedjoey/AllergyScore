# AllergyScore

AllergyScore estimates location-specific seasonal allergy severity from a user's allergy profile, symptoms, and pollen forecast data. 
This program was created for the 2026 Beaverhacks Hackathon.

## Features

- User profile form with allergy sensitivity, symptoms, medication, and planned outdoor exposure
- GPS location support with city or ZIP fallback geocoding
- Next.js API routes for Open-Meteo Air Quality and weather forecast calls
- Severity scoring from 0 to 100 with Low, Moderate, High, and Severe bands
- 5-day forecast cards, trigger breakdown bars, and recommendation guidance
- Daily symptom logging saved in `localStorage`
## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Enter a city or ZIP code, or use GPS when the browser asks for location permission.

## API Notes

The forecast route prefers:

- Google Pollen API for U.S. daily tree, grass, and weed pollen indexes
- Open-Meteo Weather Forecast API for wind speed and precipitation context
- Open-Meteo Air Quality API as a fallback for pollen variables:
  `alder_pollen`, `birch_pollen`, `grass_pollen`, `mugwort_pollen`, `olive_pollen`, `ragweed_pollen`

Create `.env.local` for Google Pollen:

```env
GOOGLE_POLLEN_API_KEY=your_key_here
```

If `GOOGLE_POLLEN_API_KEY` is not set, the app automatically uses demo data for Corvallis, Oregon so the dashboard still works for reviewers and teammates.

Open-Meteo pollen coverage varies by region. If pollen data is missing, the app shows a clear fallback message and uses weather context.
