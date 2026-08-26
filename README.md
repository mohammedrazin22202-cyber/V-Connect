# V-Connect (Village Ranking and Development Portal)

V-Connect is a full-stack dashboard designed to track, rank, and compare village-level development indicators across various states. It enables administrators and researchers to visualize infrastructure, sanitation, education, health, and economic indicators.

## Project Structure

```
V-Connect/
│
├── client/                 # React (Vite) Frontend Application
│   ├── src/
│   │   ├── components/     # Reusable components (Sidebar, StatsCards, etc.)
│   │   ├── pages/          # Main dashboard views (RankingDashboard, StateComparison, etc.)
│   │   └── App.jsx         # Client routing
│   └── package.json
│
├── server/                 # Express API backend
│   ├── index.js            # Main Express application
│   ├── ingest.py           # Database migration/ingestion scripts
│   └── package.json
│
├── village_profile.py      # Playwright-based scraper and parser
└── README.md               # Main project documentation
```

## Features

- **Dynamic Ranking Dashboard**: Compare and filter villages by state, district, or development score.
- **State-by-State Analytics**: Side-by-side comparison of development scores and metrics.
- **Detailed Village Profiles**: View details for any village including latitude, longitude, and nearby facilities (schools, hospitals, bus stops, railway stations).
- **Data Ingestion Tooling**: Automated scraping using Google Maps coordinates and straight-line distances.
- **Advanced Spatial Analytics Maps**: Added switchable base layer maps (OSM, sleek Dark mode, Esri Satellite) and density heatmaps of regional deficits (dropout, sanitation, health access).
- **Interactive Custom Weight Scenario Planner**: Toggle custom domain weight configurations (0x to 5x sliders) inside the Policy Sandbox simulator to analyze tailored resource allocations.
- **Executive PDF & CSV Export Center**: Direct CSV download of full village metrics and professionally styled, Ministry-branded executive print layouts with custom cover pages and page breaks.
- **Interactive Data Import Dashboard**: Drag-and-drop CSV uploader with fuzzy column mapping suggestions and a client-side parsed data preview grid before SQLite commit.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.9+)

### Installation & Run

#### 1. Start the Server
```bash
cd server
npm install
npm run dev
```

#### 2. Start the Client
```bash
cd client
npm install
npm run dev
```


## Offline & Free-tier Execution
The application includes a rule-based expert system on the backend that provides detailed, village-specific policy briefs entirely offline, removing any dependencies on paid external APIs.