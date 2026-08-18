# V-Connect Client

This directory contains the React frontend application built using Vite, TailwindCSS (for custom dashboard UI layouts), and Lucide React icons.

## Features

- **RankingDashboard**: View list of villages, search and filter by score or state.
- **StateComparison**: Interactive UI to select and compare two states side by side.
- **VillageDetail**: Highlights key details of a village including location on maps and straight-line distances to essential facilities.

## Scripts

- `npm run dev`: Runs the app in development mode on `http://localhost:5173`.
- `npm run build`: Builds the app for production in the `dist` folder.
- `npm run preview`: Previews the production build locally.


### Offline Data Lookups
The village profile scraping engine utilizes a local SQLite database copy and coordinate bounding boxes to resolve environmental warnings and seismic risk zones locally without requesting external geocoding API keys.

### UX Transitions
Transitions are optimized for rendering list items and breakdown cards cleanly under low-latency fallback modes.