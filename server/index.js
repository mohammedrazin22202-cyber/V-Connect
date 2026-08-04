/**
 * VCONNECT Village Ranking System — Express API Server
 *
 * Serves village ranking data from SQLite over a RESTful API.
 * Endpoints: /api/rankings, /api/villages/:id, /api/stats, /api/filters, /api/compare/states
 */

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const metricMeta = require("./metric_meta.json");

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, "vconnect.db");

// ── Middleware ──────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Database Connection ────────────────────────────────────────────────
let db;
try {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma("cache_size = -128000"); // 128MB cache
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256MB mmap
  console.log("✓ Connected to SQLite database");
} catch (err) {
  console.error("✗ Failed to open database:", err.message);
  console.error("  Run 'python ingest.py' first to create the database.");
  process.exit(1);
}

// ── Helper: safe integer parse ─────────────────────────────────────────
function safeInt(val, fallback) {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

// ── GET /api/rankings ──────────────────────────────────────────────────
// Paginated, sortable, filterable village rankings
app.get("/api/rankings", (req, res) => {
  try {
    const page = Math.max(1, safeInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, safeInt(req.query.limit, 25)));
    const offset = (page - 1) * limit;

    // Weighting parameters
    const wEco = Math.max(0, parseFloat(req.query.w_eco ?? 1));
    const wEdu = Math.max(0, parseFloat(req.query.w_edu ?? 1));
    const wHea = Math.max(0, parseFloat(req.query.w_hea ?? 1));
    const wInf = Math.max(0, parseFloat(req.query.w_inf ?? 1));
    const wEnv = Math.max(0, parseFloat(req.query.w_env ?? 1));
    const wGov = Math.max(0, parseFloat(req.query.w_gov ?? 1));
    const wSoc = Math.max(0, parseFloat(req.query.w_soc ?? 1));
    const totalWeight = wEco + wEdu + wHea + wInf + wEnv + wGov + wSoc;

    const isCustomWeights = (wEco !== 1 || wEdu !== 1 || wHea !== 1 || wInf !== 1 || wEnv !== 1 || wGov !== 1 || wSoc !== 1) && totalWeight > 0;

    const scoreFormula = isCustomWeights
      ? `((d.economy_score * ${wEco}) + (d.education_score * ${wEdu}) + (d.health_score * ${wHea}) + (d.infrastructure_score * ${wInf}) + (d.environment_score * ${wEnv}) + (d.governance_score * ${wGov}) + (d.social_score * ${wSoc})) / ${totalWeight}`
      : `d.overall_score`;

    // Sort
    const validSorts = [
      "overall_score", "economy_score", "education_score", "health_score",
      "infrastructure_score", "environment_score", "governance_score",
      "social_score", "overall_rank", "total_population", "village_urgency_score",
    ];
    const sortBy = validSorts.includes(req.query.sort_by)
      ? req.query.sort_by
      : "overall_rank";
    const order = req.query.order === "desc" ? "DESC" : "ASC";

    // Filters
    const conditions = [];
    const params = [];

    if (req.query.state) {
      conditions.push("v.state = ?");
      params.push(req.query.state);
    }
    if (req.query.district) {
      conditions.push("v.district = ?");
      params.push(req.query.district);
    }
    if (req.query.priority) {
      conditions.push("v.priority_level = ?");
      params.push(req.query.priority);
    }
    if (req.query.search) {
      conditions.push("v.village_name LIKE ?");
      params.push(`%${req.query.search}%`);
    }

    const whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // Determine sort table alias
    let sortCol;
    let orderClause = order;
    
    const scoreCols = [
      "overall_score", "economy_score", "education_score", "health_score",
      "infrastructure_score", "environment_score", "governance_score",
      "social_score", "overall_rank",
    ];
    
    if (isCustomWeights && (sortBy === "overall_score" || sortBy === "overall_rank")) {
      sortCol = scoreFormula;
      if (sortBy === "overall_rank") {
        orderClause = order === "desc" ? "ASC" : "DESC";
      }
    } else {
      sortCol = scoreCols.includes(sortBy) ? `d.${sortBy}` : `v.${sortBy}`;
    }

    // Count (optimized to avoid JOIN unless whereClause references 'd.')
    const countSQL = whereClause.includes("d.")
      ? `SELECT COUNT(*) as total FROM villages v JOIN domain_scores d ON v.village_id = d.village_id ${whereClause}`
      : `SELECT COUNT(*) as total FROM villages v ${whereClause}`;
    const { total } = db.prepare(countSQL).get(...params);

    // Rank select expression
    let rankSelectExpression = "d.overall_rank";
    if (isCustomWeights) {
      if (conditions.length > 0) {
        rankSelectExpression = `RANK() OVER (ORDER BY ${scoreFormula} DESC) as overall_rank`;
      } else {
        rankSelectExpression = "0 as overall_rank";
      }
    }

    // Data
    const dataSQL = `
      SELECT
        v.village_id, v.village_name, v.district, v.state,
        v.total_population, v.priority_level, v.emergency_flag,
        v.intervention_category, v.village_urgency_score, v.latitude, v.longitude,
        d.economy_score, d.education_score, d.health_score,
        d.infrastructure_score, d.environment_score,
        d.governance_score, d.social_score,
        ${scoreFormula} as overall_score,
        ${rankSelectExpression}
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      ${whereClause}
      ORDER BY ${sortCol} ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSQL).all(...params, limit, offset);

    // Dynamic rank mapping for custom weights when unfiltered
    if (isCustomWeights && conditions.length === 0) {
      rows.forEach((row, i) => {
        if (sortBy === "overall_rank" || sortBy === "overall_score") {
          row.overall_rank = offset + i + 1;
        } else {
          row.overall_rank = null;
        }
      });
    }

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Rankings error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/villages/:id ──────────────────────────────────────────────
// Full village detail with all metrics (grouped by category dynamically from flat columns)
app.get("/api/villages/:id", (req, res) => {
  try {
    const id = safeInt(req.params.id, 0);

    const village = db.prepare(`
      SELECT v.*, d.economy_score, d.education_score, d.health_score,
             d.infrastructure_score, d.environment_score,
             d.governance_score, d.social_score,
             d.overall_score, d.overall_rank
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      WHERE v.village_id = ?
    `).get(id);

    if (!village) {
      return res.status(404).json({ error: "Village not found" });
    }

    const METRIC_MAP = {
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
    };

    const metricsByCategory = {};
    for (const [category, cols] of Object.entries(METRIC_MAP)) {
      metricsByCategory[category] = [];
      for (const col of cols) {
        if (village[col] !== undefined && village[col] !== null) {
          metricsByCategory[category].push({
            name: col,
            value: village[col]
          });
          // Remove raw metric from the main village object
          delete village[col];
        }
      }
    }

    res.json({ village, metrics: metricsByCategory, metricMeta });
  } catch (err) {
    console.error("Village detail error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/simulate-rank ─────────────────────────────────────────────
// Estimate national rank for a given overall score
app.get("/api/simulate-rank", (req, res) => {
  try {
    const score = parseFloat(req.query.score);
    if (isNaN(score)) {
      return res.status(400).json({ error: "Invalid or missing score parameter" });
    }
    const result = db.prepare("SELECT COUNT(*) + 1 as rank FROM domain_scores WHERE overall_score > ?").get(score);
    res.json({ rank: result.rank });
  } catch (err) {
    console.error("Simulate rank error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats ─────────────────────────────────────────────────────
// Retrieve precomputed aggregate statistics for dashboard
app.get("/api/stats", (req, res) => {
  try {
    const row = db.prepare("SELECT stat_value FROM dashboard_stats WHERE stat_key = 'summary'").get();
    if (!row) {
      return res.status(500).json({ error: "Summary stats not found. Database ingestion may be incomplete." });
    }
    res.json(JSON.parse(row.stat_value));
  } catch (err) {
    console.error("Stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/filters ───────────────────────────────────────────────────
// Retrieve precomputed available filter options
app.get("/api/filters", (req, res) => {
  try {
    const row = db.prepare("SELECT stat_value FROM dashboard_stats WHERE stat_key = 'filters'").get();
    if (!row) {
      return res.status(500).json({ error: "Filter options not found. Database ingestion may be incomplete." });
    }
    const filters = JSON.parse(row.stat_value);

    // If state is provided, return districts for that state
    let districts = [];
    if (req.query.state) {
      districts = filters.state_districts[req.query.state] || [];
    }

    res.json({
      states: filters.states,
      districts: districts,
      priorities: filters.priorities
    });
  } catch (err) {
    console.error("Filters error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/compare/states ────────────────────────────────────────────
// Compare states by domain scores (leveraging precomputed stats table)
app.get("/api/compare/states", (req, res) => {
  try {
    const stateList = req.query.states ? req.query.states.split(",") : [];

    const row = db.prepare("SELECT stat_value FROM dashboard_stats WHERE stat_key = 'state_comparison'").get();
    if (!row) {
      return res.status(500).json({ error: "State comparisons not found. Database ingestion may be incomplete." });
    }
    
    let data = JSON.parse(row.stat_value);

    if (stateList.length > 0) {
      data = data.filter(d => stateList.includes(d.state));
    }

    res.json({ data });
  } catch (err) {
    console.error("Compare states error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏘  VCONNECT API running at http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   GET /api/rankings?page=1&limit=25&sort_by=overall_rank&order=asc`);
  console.log(`   GET /api/villages/:id`);
  console.log(`   GET /api/stats`);
  console.log(`   GET /api/filters`);
  console.log(`   GET /api/compare/states`);
});
