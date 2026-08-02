#!/usr/bin/env python3
"""
VCONNECT Village Ranking System — Data Ingestion Script

Reads 9 VCONNECT engine CSV files, computes composite domain scores,
and loads everything into a SQLite database for the Node.js API.
"""

import os
import sys
import sqlite3
import pandas as pd
import numpy as np
import time

# ── Paths ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(os.path.dirname(BASE_DIR), "EngineDataFiles")
DB_PATH = os.path.join(BASE_DIR, "vconnect.db")

CSV_FILES = {
    "ai_decision":    "VCONNECT_AI_Decision_Engine_Output.csv",
    "geography":      "VCONNECT_Geography_Demographics_Engine.csv",
    "economy":        "VCONNECT_Economy_Agriculture_Engine.csv",
    "education":      "VCONNECT_Education_Human_Capital_Engine.csv",
    "health":         "VCONNECT_Health_Nutrition_Engine.csv",
    "infrastructure": "VCONNECT_Infrastructure_Connectivity_Engine.csv",
    "environment":    "VCONNECT_Environment_Disaster_Engine.csv",
    "governance":     "VCONNECT_Governance_Resource_Flow_Engine.csv",
    "social":         "VCONNECT_Social_Stability_Safety_Engine.csv",
}

# ── Domain score definitions ───────────────────────────────────────────
# Each domain maps to columns that are "positive" (higher = better)
# or "negative" (higher = worse, will be inverted).

DOMAIN_POSITIVE = {
    "economy": [
        "employment_rate", "avg_household_income", "self_employment_rate",
        "irrigation_coverage", "crop_yield_index%", "farmer_income_avg",
        "MSME_presence_count", "market_access_score", "price_realization_index",
        "bank_access_score", "credit_availability_score", "SHG_participation%",
    ],
    "education": [
        "literacy_rate", "female_literacy_rate", "higher_education_enrollment_pct",
        "school_count", "school_condition_index", "teacher_student_ratio",
        "classroom_infra_quality", "digital_literacy_rate",
        "skill_training_centers_count", "vocational_training_coverage",
        "internet_in_schools_pct",
    ],
    "health": [
        "nutrition_support_coverage%", "anganwadi_coverage%",
        "vaccination_coverage%", "medical_staff_per_1000",
        "healthcare_effectiveness_score",
    ],
    "infrastructure": [
        "hospital_present", "hospital_count", "hospital_capacity",
        "PHC_present", "ambulance_access_score",
        "drinking_water_coverage_pct", "irrigation_water_coverage_pct",
        "sanitation_coverage_pct", "solid_waste_mgmt_score", "hygiene_index",
        "road_quality_index", "bus_connectivity_score", "bus_frequency_per_day",
        "electricity_hours_per_day", "renewable_energy%",
        "internet_penetration%", "mobile_network_quality", "digital_access_score",
    ],
    "environment": [
        "soil_quality_index", "groundwater_level_index",
        "forest_cover_pct", "biodiversity_index",
        "disaster_preparedness_score", "evacuation_access_score",
        "early_warning_access_score",
    ],
    "governance": [
        "panchayat_efficiency_score", "admin_accessibility_score",
        "digital_governance_score", "transparency_index",
        "fund_utilization_pct", "project_execution_success_rate",
        "scheme_coverage_pct", "govt_scheme_awareness_score",
        "admin_response_speed_score", "citizen_feedback_index",
    ],
    "social": [
        "community_participation_score", "youth_engagement_score",
        "NGO_presence_count", "volunteer_base_strength",
        "social_cohesion_index",
    ],
}

DOMAIN_NEGATIVE = {
    "economy": [
        "seasonal_unemployment_rate", "poverty_rate",
        "agriculture_dependency%", "farmer_debt_index",
        "farmer_suicide_rate", "crop_failure_risk",
        "industrial_access_distance_km",
    ],
    "education": [
        "avg_school_distance_km", "dropout_rate", "child_labour_rate",
        "college_access_distance_km",
    ],
    "health": [
        "disease_prevalence_index", "maternal_mortality_rate",
        "infant_mortality_rate", "under5_mortality_rate",
        "epidemic_risk_score", "malnutrition_rate",
        "anemia_rate_women", "anemia_rate_children",
        "avg_healthcare_access_time_min",
        "mental_health_stress_index", "suicide_rate",
        "alcoholism_prevalence",
    ],
    "infrastructure": [
        "nearest_hospital_distance_km", "rail_access_distance_km",
        "power_outage_freq_per_week",
    ],
    "environment": [
        "flood_risk_score", "drought_probability", "cyclone_risk_score",
        "earthquake_risk_score", "landslide_risk_score", "heat_stress_index",
        "water_table_depletion_rate", "water_scarcity_risk",
        "environmental_degradation_score", "climate_vulnerability_index",
    ],
    "governance": [
        "corruption_risk_proxy", "resource_leakage_risk",
        "complaint_resolution_time_days",
    ],
    "social": [
        "total_crime_rate", "violent_crime_rate", "property_crime_rate",
        "juvenile_crime_rate", "crime_trend_score",
        "crimes_against_women_rate", "domestic_violence_index",
        "sexual_harassment_risk_index", "child_abuse_risk_index",
        "early_marriage_rate", "alcohol_abuse_rate", "drug_abuse_rate",
        "substance_abuse_index", "divorce_rate",
    ],
}


def safe_normalize(series, invert=False):
    """Min-max normalize to 0-100. If invert, flip so lower raw = higher score."""
    s = pd.to_numeric(series, errors="coerce")
    mn, mx = s.min(), s.max()
    if mn == mx:
        return pd.Series(50.0, index=s.index)
    norm = (s - mn) / (mx - mn) * 100
    return (100 - norm) if invert else norm


def compute_domain_score(df, domain):
    """Compute a single domain score as the average of normalized sub-metrics."""
    parts = []
    for col in DOMAIN_POSITIVE.get(domain, []):
        if col in df.columns:
            parts.append(safe_normalize(df[col], invert=False))
    for col in DOMAIN_NEGATIVE.get(domain, []):
        if col in df.columns:
            parts.append(safe_normalize(df[col], invert=True))
    if not parts:
        return pd.Series(50.0, index=df.index)
    stacked = pd.concat(parts, axis=1)
    return stacked.mean(axis=1).round(2)


def main():
    t0 = time.time()
    print("=" * 60)
    print("VCONNECT Village Ranking System -- Data Ingestion")
    print("=" * 60)

    # ── 1. Load CSVs ─────────────────────────────────────────────────
    print("\n[1/4] Loading CSV files...")
    dfs = {}
    for key, fname in CSV_FILES.items():
        path = os.path.join(CSV_DIR, fname)
        if not os.path.exists(path):
            print(f"  [X] Missing: {fname}")
            sys.exit(1)
        print(f"  Loading {fname}...", end=" ", flush=True)
        df = pd.read_csv(path, low_memory=False)
        # Drop fully-empty rows
        df = df.dropna(how="all")
        # Ensure village_id is int
        df["village_id"] = pd.to_numeric(df["village_id"], errors="coerce")
        df = df.dropna(subset=["village_id"])
        df["village_id"] = df["village_id"].astype(int)
        dfs[key] = df
        print(f"({len(df)} rows)")

    # ── 2. Merge into a master frame on village_id ────────────────────
    print("\n[2/4] Merging datasets on village_id...")
    master = dfs["geography"][["village_id", "village_name", "district", "state",
                                "gram_panchayat", "block", "region_zone",
                                "latitude", "longitude", "area_sq_km",
                                "total_population", "households",
                                "population_density"]].copy()

    # Merge AI Decision fields
    ai = dfs["ai_decision"][["village_id", "priority_level", "emergency_flag",
                              "intervention_category", "village_urgency_score",
                              "national_priority_rank",
                              "infrastructure_deficit_index", "health_risk_index",
                              "education_gap_index", "economic_stress_index",
                              "social_instability_index", "climate_risk_index",
                              "governance_failure_index",
                              "recommended_budget_inr"]].copy()
    master = master.merge(ai, on="village_id", how="left")

    # Merge all engine CSVs for metric columns
    for key in ["economy", "education", "health", "infrastructure",
                "environment", "governance", "social"]:
        df = dfs[key].drop(columns=["village_name", "district", "state"], errors="ignore")
        master = master.merge(df, on="village_id", how="left")

    print(f"  Master dataset: {len(master)} villages, {len(master.columns)} columns")

    # ── 3. Compute domain scores ─────────────────────────────────────
    print("\n[3/4] Computing domain scores...")
    # Defragment to avoid PerformanceWarning
    master = master.copy()
    domains = ["economy", "education", "health", "infrastructure",
               "environment", "governance", "social"]
    for d in domains:
        col = f"{d}_score"
        master[col] = compute_domain_score(master, d)
        print(f"  {d:20s} -> mean={master[col].mean():.1f}")

    master["overall_score"] = master[[f"{d}_score" for d in domains]].mean(axis=1).round(2)
    print(f"  {'overall':20s} -> mean={master['overall_score'].mean():.1f}")

    # Compute rank (1 = best)
    master["overall_rank"] = master["overall_score"].rank(ascending=False, method="min").astype(int)

    # ── 4. Write to SQLite ────────────────────────────────────────────
    print(f"\n[4/4] Writing to SQLite: {DB_PATH}")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Villages table
    cur.execute("""
    CREATE TABLE villages (
        village_id        INTEGER PRIMARY KEY,
        village_name      TEXT,
        district          TEXT,
        state             TEXT,
        gram_panchayat    TEXT,
        block             TEXT,
        region_zone       TEXT,
        latitude          REAL,
        longitude         REAL,
        area_sq_km        REAL,
        total_population  INTEGER,
        households        INTEGER,
        population_density REAL,
        priority_level    TEXT,
        emergency_flag    INTEGER,
        intervention_category TEXT,
        village_urgency_score REAL,
        national_priority_rank INTEGER,
        recommended_budget_inr REAL
    )""")

    # Domain scores table
    cur.execute("""
    CREATE TABLE domain_scores (
        village_id           INTEGER PRIMARY KEY,
        economy_score        REAL,
        education_score      REAL,
        health_score         REAL,
        infrastructure_score REAL,
        environment_score    REAL,
        governance_score     REAL,
        social_score         REAL,
        overall_score        REAL,
        overall_rank         INTEGER,
        FOREIGN KEY (village_id) REFERENCES villages(village_id)
    )""")

    # Raw metrics table (key metrics for detail view)
    cur.execute("""
    CREATE TABLE village_metrics (
        village_id     INTEGER,
        category       TEXT,
        metric_name    TEXT,
        metric_value   REAL,
        FOREIGN KEY (village_id) REFERENCES villages(village_id)
    )""")

    conn.commit()

    # Insert villages
    village_cols = ["village_id", "village_name", "district", "state",
                    "gram_panchayat", "block", "region_zone",
                    "latitude", "longitude", "area_sq_km",
                    "total_population", "households", "population_density",
                    "priority_level", "emergency_flag",
                    "intervention_category", "village_urgency_score",
                    "national_priority_rank", "recommended_budget_inr"]
    vdf = master[village_cols].copy()
    vdf.to_sql("villages", conn, if_exists="replace", index=False)
    print(f"  villages: {len(vdf)} rows")

    # Insert domain scores
    score_cols = ["village_id"] + [f"{d}_score" for d in domains] + ["overall_score", "overall_rank"]
    sdf = master[score_cols].copy()
    sdf.to_sql("domain_scores", conn, if_exists="replace", index=False)
    print(f"  domain_scores: {len(sdf)} rows")

    # Insert key raw metrics (flatten selected columns per category)
    METRIC_MAP = {
        "Economy": ["employment_rate", "avg_household_income", "poverty_rate",
                     "crop_yield_index%", "farmer_income_avg", "farmer_debt_index",
                     "market_access_score", "bank_access_score"],
        "Education": ["literacy_rate", "female_literacy_rate", "dropout_rate",
                       "school_count", "teacher_student_ratio", "digital_literacy_rate"],
        "Health": ["infant_mortality_rate", "malnutrition_rate", "vaccination_coverage%",
                   "medical_staff_per_1000", "avg_healthcare_access_time_min",
                   "healthcare_effectiveness_score"],
        "Infrastructure": ["drinking_water_coverage_pct", "sanitation_coverage_pct",
                           "road_quality_index", "electricity_hours_per_day",
                           "internet_penetration%", "nearest_hospital_distance_km"],
        "Environment": ["flood_risk_score", "earthquake_risk_score", "air_quality_index",
                        "forest_cover_pct", "disaster_preparedness_score",
                        "climate_vulnerability_index"],
        "Governance": ["panchayat_efficiency_score", "transparency_index",
                       "fund_utilization_pct", "scheme_coverage_pct",
                       "corruption_risk_proxy"],
        "Social": ["total_crime_rate", "crimes_against_women_rate",
                   "social_cohesion_index", "community_participation_score",
                   "youth_engagement_score"],
    }

    print("  Inserting raw metrics (this may take a minute)...")
    metric_rows = []
    for cat, cols in METRIC_MAP.items():
        for col in cols:
            if col in master.columns:
                sub = master[["village_id"]].copy()
                sub["category"] = cat
                sub["metric_name"] = col
                sub["metric_value"] = pd.to_numeric(master[col], errors="coerce")
                metric_rows.append(sub)

    if metric_rows:
        metrics_df = pd.concat(metric_rows, ignore_index=True)
        metrics_df = metrics_df.dropna(subset=["metric_value"])
        metrics_df.to_sql("village_metrics", conn, if_exists="replace", index=False)
        print(f"  village_metrics: {len(metrics_df)} rows")

    # Create indexes for fast queries
    print("  Creating indexes...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_villages_state ON villages(state)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_villages_name ON villages(village_name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scores_overall ON domain_scores(overall_score DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_scores_rank ON domain_scores(overall_rank)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_metrics_vid ON village_metrics(village_id)")
    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"\n{'=' * 60}")
    print(f"[OK] Done in {elapsed:.1f}s -- DB size: {db_size_mb:.1f} MB")
    print(f"  {DB_PATH}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
