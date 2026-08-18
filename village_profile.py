#!/usr/bin/env python3
"""
Village profile generator using Playwright + Google Maps

Generates:
 - Latitude & Longitude for each village
 - Nearest hospital, school, college, bus stop, railway station (straight-line distance)
 - Placeholders for seismic zone, drinking water, disaster alerts

Input file format:
Village Name\tState Name\tDistrict Name
"""

import argparse
import os
import time
import math
import datetime
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional, Tuple, Dict

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ----------------- Utility Functions -----------------

def haversine(lat1, lon1, lat2, lon2):
    """Return distance in km between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def extract_coordinates_from_url(url: str) -> Tuple[Optional[float], Optional[float]]:
    """Extract coordinates from Google Maps URL."""
    try:
        after_at = url.split('/@')[-1].split('/')[0]
        parts = after_at.split(',')
        lat, lon = float(parts[0]), float(parts[1])
        return lat, lon
    except Exception:
        return None, None

# ----------------- Data Classes -----------------

@dataclass
class Facility:
    name: str = ""
    type: str = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    distance_km: Optional[float] = None
    raw_text: str = ""

@dataclass
class VillageProfile:
    village: str
    state: str
    district: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    facilities: Dict[str, Optional[Facility]] = field(default_factory=dict)
    seismic_zone: Optional[str] = None
    drinking_water: Optional[str] = None
    disaster_alerts: Optional[str] = None
    notes: Optional[str] = None

    def to_row(self):
        row = dict(
            Village=self.village,
            State=self.state,
            District=self.district,
            Latitude=self.lat,
            Longitude=self.lon,
            SeismicZone=self.seismic_zone,
            DrinkingWater=self.drinking_water,
            DisasterAlerts=self.disaster_alerts,
            Notes=self.notes,
        )
        for ftype in ["hospital", "school", "college", "bus stop", "railway station"]:
            fac = self.facilities.get(ftype)
            row.update({
                f"{ftype}_name": fac.name if fac else None,
                f"{ftype}_lat": fac.lat if fac else None,
                f"{ftype}_lon": fac.lon if fac else None,
                f"{ftype}_distance_km": fac.distance_km if fac else None,
                f"{ftype}_raw": fac.raw_text if fac else None,
            })
        return row

# ----------------- Lookup Placeholders -----------------

def lookup_seismic_zone(lat: float, lon: float, csv_path=None):
def lookup_seismic_zone(lat: float, lon: float, csv_path=None):
    """Determine Indian Seismic Zone based on coordinate bounding boxes/heuristics."""
    if lat is None or lon is None:
        return "Unknown"
    # Zone V: Very High Damage Risk (North-East, Kutch, parts of J&K/Himachal)
    if (lat > 32.0 and lon > 74.0 and lon < 78.0) or (lat > 21.5 and lat < 24.5 and lon > 68.0 and lon < 71.5) or (lat > 21.0 and lon > 89.0):
        return "Zone V (Very High)"
    # Zone IV: High Damage Risk (Remaining parts of J&K, Himachal, Uttarakhand, Delhi, Sikkim, Northern Bihar)
    elif (lat > 29.0 and lon > 76.0 and lon < 81.0) or (lat > 25.5 and lat < 27.5 and lon > 84.0 and lon < 88.0) or (lat > 31.0 and lon > 73.0):
        return "Zone IV (High)"
    # Zone III: Moderate Damage Risk (Indo-Gangetic basin, Maharashtra, Kerala, parts of Gujarat, Rajasthan, MP)
    elif (lat > 20.0 and lat < 29.0 and lon > 70.0 and lon < 85.0) or (lat > 8.0 and lat < 13.0 and lon > 75.0 and lon < 78.0):
        return "Zone III (Moderate)"
    # Zone II: Low Damage Risk (Peninsular India, remaining parts)
    else:
        return "Zone II (Low)"


def lookup_drinking_water_status(village: str, state: str, district: str, csv_path=None):
def lookup_drinking_water_status(village: str, state: str, district: str, csv_path=None):
    """Query the local SQLite database to fetch the drinking water coverage metric."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "server", "vconnect.db")
    if not os.path.exists(db_path):
        db_path = os.path.join(base_dir, "vconnect.db")
    try:
        import sqlite3
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT drinking_water_coverage_pct FROM villages WHERE LOWER(village_name) = ? AND LOWER(district) = ? AND LOWER(state) = ?", 
                    (village.strip().lower(), district.strip().lower(), state.strip().lower()))
        row = cur.fetchone()
        conn.close()
        if row and row[0] is not None:
            coverage = row[0]
            if coverage >= 80:
                return f"Fully Covered ({coverage:.1f}%)"
            elif coverage >= 50:
                return f"Partially Covered ({coverage:.1f}%)"
            else:
                return f"Scarcity/Low Coverage ({coverage:.1f}%)"
    except Exception as e:
        print(f"Error querying drinking water status: {e}")
    return "Insufficient Data (Local Fallback)"


def get_disaster_alerts(lat: float, lon: float, api_key=None):
def get_disaster_alerts(lat: float, lon: float, api_key=None):
    """Locate the nearest village geographically in our database and check environmental risk scores."""
    if lat is None or lon is None:
        return "No Coordinates"
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "server", "vconnect.db")
    if not os.path.exists(db_path):
        db_path = os.path.join(base_dir, "vconnect.db")
    try:
        import sqlite3
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        # Find nearest village in the database that has coordinates
        cur.execute("""
            SELECT village_name, district, state, flood_risk_score, earthquake_risk_score, climate_vulnerability_index
            FROM villages
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) ASC
            LIMIT 1
        """, (lat, lat, lon, lon))
        row = cur.fetchone()
        conn.close()
        if row:
            name, dist, st, flood, earthquake, climate = row
            alerts = []
            if flood and flood > 40:
                alerts.append(f"High Flood Risk ({flood:.1f}%)")
            if earthquake and earthquake > 35:
                alerts.append(f"High Earthquake Risk ({earthquake:.1f}%)")
            if climate and climate > 40:
                alerts.append(f"High Climate Vulnerability ({climate:.1f}%)")
            
            if alerts:
                return f"Alerts: {', '.join(alerts)} (nearest: {name}, {dist})"
            else:
                return "No active environmental warnings (Low risk)"
    except Exception as e:
        print(f"Error querying disaster alerts: {e}")
    return "No active warnings (Local Engine)"


# ----------------- Playwright Helpers -----------------

def safe_get_coordinates_from_search(page, village: str, district: str, state: str, timeout=15000):
    """Try multiple search formats before giving up."""
    patterns = [
        f"{village}, {district}, {state}",
        f"{village} village, {district}, {state}",
        f"{village}, {state}",
        f"{village} village, {state}",
    ]
    for pattern in patterns:
        try:
            url = f"https://www.google.com/maps/search/{pattern.replace(' ', '+')}"
            page.goto(url, timeout=timeout)
            time.sleep(2.0)
            lat, lon = extract_coordinates_from_url(page.url)
            if lat is not None and lon is not None:
                return lat, lon
            # Try clicking first result
            try:
                link = page.locator('//a[contains(@href, "/maps/place") and contains(@href, "/@")]')
                if link.count() > 0:
                    link.first.click()
                    time.sleep(1.2)
                    lat, lon = extract_coordinates_from_url(page.url)
                    if lat is not None and lon is not None:
                        return lat, lon
            except Exception:
                pass
        except Exception as e:
            print(f"Error searching for {pattern}: {e}")
    return None, None

def get_nearest_facility(page, village_query: str, facility_type: str, village_lat, village_lon, timeout=15000):
    """Find nearest facility and compute distance."""
    search_q = f"{facility_type} near {village_query}"
    try:
        url = f"https://www.google.com/maps/search/{search_q.replace(' ', '+')}"
        page.goto(url, timeout=timeout)
        time.sleep(2.2)
        places = page.locator('//a[contains(@href, "/maps/place")]')
        if places.count() == 0:
            return None
        first = places.first
        href = first.get_attribute('href') or ""
        lat, lon = extract_coordinates_from_url(href)
        if lat is None:
            try:
                first.click()
                time.sleep(1.2)
                lat, lon = extract_coordinates_from_url(page.url)
            except Exception:
                lat, lon = None, None
        name_text = ""
        try:
            if first.locator('.fontHeadlineSmall').count() > 0:
                name_text = first.locator('.fontHeadlineSmall').inner_text()
            else:
                name_text = first.inner_text().split("\n")[0]
        except Exception:
            pass
        facility = Facility(name=name_text.strip(), type=facility_type, lat=lat, lon=lon, raw_text=href)
        if village_lat and lat:
            facility.distance_km = round(haversine(village_lat, village_lon, lat, lon), 3)
        return facility
    except Exception as e:
        print(f"Error finding {facility_type}: {e}")
    return None

# ----------------- Main Processing -----------------

def process_villages(input_path: str, output_prefix: str, headless: bool = False, limit: int = 50):
    if not os.path.exists(input_path):
        print("Input file not found:", input_path)
        return

    with open(input_path, 'r', encoding='utf-8') as f:
        header = f.readline()
        lines = [line.strip() for line in f if line.strip()]

    villages = []
    for ln in lines:
        parts = ln.split('\t')
        if len(parts) >= 3:
            villages.append((parts[0].strip(), parts[1].strip(), parts[2].strip()))

    if limit > 0:
        villages = villages[:limit]

    profiles = []
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    save_dir = os.path.join("Village_Profiles", today)
    os.makedirs(save_dir, exist_ok=True)
    csv_out = os.path.join(save_dir, f"{output_prefix}.csv")
    xlsx_out = os.path.join(save_dir, f"{output_prefix}.xlsx")

    facility_types = ["hospital", "school", "college", "bus stop", "railway station"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(locale="en-GB")
        page.goto("https://www.google.com/maps", timeout=20000)
        time.sleep(1.0)

        for idx, (village, state, district) in enumerate(villages):
            print(f"[{idx+1}/{len(villages)}] {village}, {district}, {state}")
            profile = VillageProfile(village=village, state=state, district=district)

            lat, lon = safe_get_coordinates_from_search(page, village, district, state)
            profile.lat, profile.lon = lat, lon
            if lat is None:
                profile.notes = "Coordinates not found"
            else:
                profile.seismic_zone = lookup_seismic_zone(lat, lon)

            for ftype in facility_types:
                fac = get_nearest_facility(page, f"{village} {district} {state}", ftype, profile.lat, profile.lon)
                profile.facilities[ftype] = fac
                time.sleep(1.0)

            profiles.append(profile)

            # Save progress
            if (idx + 1) % 10 == 0 or idx + 1 == len(villages):
                df = pd.DataFrame([p.to_row() for p in profiles])
                df.to_csv(csv_out, index=False)
                df.to_excel(xlsx_out, index=False)

        browser.close()

    df = pd.DataFrame([p.to_row() for p in profiles])
    df.to_csv(csv_out, index=False)
    df.to_excel(xlsx_out, index=False)
    print("Saved:", csv_out, "and", xlsx_out)

# ----------------- CLI -----------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", "-i", required=True, help="Input TSV file")
    parser.add_argument("--output", "-o", default="village_profiles", help="Output file prefix")
    parser.add_argument("--headless", action="store_true", help="Run browser headless")
    parser.add_argument("--limit", "-l", type=int, default=50, help="Limit number of villages to process (0 = all)")
    args = parser.parse_args()

    process_villages(args.input, args.output, args.headless, args.limit)
