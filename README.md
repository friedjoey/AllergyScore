# AllergyScore

AllergyScore is a personalized pollen and weather risk dashboard that helps users understand their daily allergy risk from location, pollen index data, sensitivity settings, symptoms, and breathing sensitivity.

## Features

- Location-based allergy dashboard with city/ZIP search
- GPS location support with reverse geocoding to show the current city
- Google Pollen API support for U.S. pollen index data
- Demo mode for Corvallis, Oregon using realistic mock UPI values
- Environmental Risk score based on local tree, grass, and weed/ragweed pollen
- Personalized AllergyScore based on pollen levels and user sensitivity settings
- Trigger breakdown with UPI values and severity labels
- 5-day AllergyScore forecast
- Profile manager with saved profiles, profile switching, and profile deletion
- Breathing sensitivity flag that makes guidance more cautious
- Symptom journal with daily notes
- Edit or remove today's symptom log for demos and corrections
- Printable doctor report with recent symptoms, AllergyScore values, top triggers, and notes
- localStorage persistence with no login required

## How It Works

AllergyScore calculates two separate scores:

- Environmental Risk: how intense pollen conditions are in the area
- AllergyScore: how risky those conditions are for the specific user

The app groups pollen into three trigger categories:

- Tree pollen
- Grass pollen
- Weed/ragweed pollen

Google pollen data uses UPI, the Universal Pollen Index, a 0-5 scale for pollen intensity. AllergyScore combines those UPI values with the user's sensitivity sliders to estimate personal risk.

Users can save multiple profiles, switch between them, log symptoms, edit today's log, and generate a printable report for a doctor visit.

If no Google API key is available, the app still works through **Demo mode**, which loads Corvallis, Oregon mock data and a sample symptom history.

## Tech Stack

Frontend: React, Next.js, TypeScript, TailwindCSS

Backend: Next.js API routes, Python

Data: Google Pollen API, Open-Meteo Weather API, Open-Meteo Geocoding API, localStorage

Deployment: Vercel-ready Next.js app

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## API Key

To use live Google pollen data, create a `.env.local` file:

```env
GOOGLE_POLLEN_API_KEY=your_key_here
```

Without an API key, use the **Demo mode** button in the app.

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```
