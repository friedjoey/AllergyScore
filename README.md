# AllergyScore

AllergyScore is a personalized pollen and weather risk dashboard that helps users understand their daily allergy risk based on location, pollen indexes, asthma risk, and personal sensitivity levels.

## Features

- Location-based pollen and weather dashboard
- Google Pollen API support for U.S. pollen index data
- Demo mode for Corvallis, Oregon using realistic mock UPI values
- Personalized reaction score based on user sensitivities
- Environmental risk score based on tree, grass, and weed pollen levels
- Profile manager with saved profiles, profile switching, and profile removal
- Asthma/comorbidity flag that adjusts risk guidance
- 5-day personalized reaction forecast
- Trigger breakdown for tree, grass, and weed/ragweed pollen
- Peak hour warning and tomorrow prep guidance
- Symptom journal with notes and saved daily logs
- Printable doctor report with symptom history and trigger patterns

## How It Works

AllergyScore uses a user profile to compare local pollen conditions against each person's sensitivity levels. The app pulls pollen index data when an API key is available, then calculates two separate scores:

- Environmental risk: how intense pollen conditions are in the area
- Reaction score: how risky those conditions are for the specific user

Users can log symptoms each day, add written notes, and generate a clean doctor report from recent logs. If an API key is not available, AllergyScore can run in demo mode with Corvallis, Oregon mock data so the dashboard still works during demos and judging.

## Tech Stack

Frontend: React, Next.js, TypeScript, TailwindCSS

Backend: Next.js API routes

Data: Google Pollen API, Open-Meteo Weather API, localStorage

Deployment: Vercel-ready Next.js app

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

To use live Google pollen data, create a `.env.local` file:

```env
GOOGLE_POLLEN_API_KEY=your_key_here
```

Without an API key, use the **Demo mode** button in the app.
