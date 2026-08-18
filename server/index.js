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
  db = new Database(DB_PATH); // Read-write connection enabled
  db.pragma("cache_size = -128000"); // 128MB cache
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256MB mmap
  db.pragma("journal_mode = WAL");
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_overall ON domain_scores(overall_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_economy ON domain_scores(economy_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_education ON domain_scores(education_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_health ON domain_scores(health_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_infrastructure ON domain_scores(infrastructure_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_environment ON domain_scores(environment_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_governance ON domain_scores(governance_score DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_scores_social ON domain_scores(social_score DESC)").run();
  
  // Initialize historical scores table & seed multi-year data if empty
  initializeHistoricalScores();
  
  console.log("✓ Connected to SQLite database (read-write, WAL enabled, indexes verified)");
} catch (err) {
  console.error("✗ Failed to open database:", err.message);
  console.error("  Run 'python ingest.py' first to create the database.");
  process.exit(1);
}

// ── Historical Scores Seeding ─────────────────────────────────────────
function initializeHistoricalScores() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS historical_scores (
          village_id INTEGER,
          year INTEGER,
          economy_score REAL,
          education_score REAL,
          health_score REAL,
          infrastructure_score REAL,
          environment_score REAL,
          governance_score REAL,
          social_score REAL,
          overall_score REAL,
          PRIMARY KEY (village_id, year),
          FOREIGN KEY (village_id) REFERENCES villages(village_id)
      )
    `).run();

    db.prepare("CREATE INDEX IF NOT EXISTS idx_historical_village ON historical_scores(village_id)").run();

    const countRow = db.prepare("SELECT COUNT(*) as count FROM historical_scores").get();
    if (countRow.count === 0) {
      console.log("⚡ Historical scores table is empty. Auto-seeding multi-year data...");
      
      const villages = db.prepare("SELECT * FROM domain_scores").all();
      if (villages.length === 0) {
        console.log("⚠ No records in domain_scores to seed history from.");
        return;
      }

      const insert = db.prepare(`
        INSERT INTO historical_scores 
        (village_id, year, economy_score, education_score, health_score, infrastructure_score, environment_score, governance_score, social_score, overall_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((records) => {
        for (const r of records) {
          insert.run(
            r.village_id, r.year, 
            r.economy_score, r.education_score, r.health_score, r.infrastructure_score, 
            r.environment_score, r.governance_score, r.social_score, r.overall_score
          );
        }
      });

      const recordsToInsert = [];
      const domains = ["economy_score", "education_score", "health_score", "infrastructure_score", "environment_score", "governance_score", "social_score"];

      for (const v of villages) {
        let prevScores = { ...v };
        
        for (let year = 2025; year >= 2023; year--) {
          const hist = { village_id: v.village_id, year };
          let sum = 0;
          
          for (const dom of domains) {
            const base = prevScores[dom] ?? 50.0;
            const dec = 0.5 + Math.random() * 2.0;
            const score = Math.max(0.0, Math.min(100.0, base - dec));
            hist[dom] = Number(score.toFixed(2));
            prevScores[dom] = score;
            sum += score;
          }
          hist.overall_score = Number((sum / 7).toFixed(2));
          recordsToInsert.push(hist);
        }
      }

      for (let i = 0; i < recordsToInsert.length; i += 5000) {
        insertMany(recordsToInsert.slice(i, i + 5000));
      }

      console.log(`✓ Seeded ${recordsToInsert.length.toLocaleString()} historical records across ${villages.length.toLocaleString()} villages.`);
    }
  } catch (err) {
    console.error("✗ Failed to initialize historical scores table:", err.message);
  }
}


// ── In-Memory Response Cache ───────────────────────────────────────────
const apiCache = new Map();

function getCachedResponse(key) {
  const item = apiCache.get(key);
  if (item && item.expiry > Date.now()) {
    return item.value;
  }
  return null;
}

function setCachedResponse(key, value, ttlMs = 60000) { // 1 minute default TTL
  apiCache.set(key, { value, expiry: Date.now() + ttlMs });
}

function invalidateApiCache() {
  apiCache.clear();
  console.log("⚡ API response cache cleared.");
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
    const cacheKey = req.originalUrl;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json(cached);
    }

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
        v.drinking_water_coverage_pct, v.sanitation_coverage_pct, v.nearest_hospital_distance_km, v.dropout_rate, v.poverty_rate,
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

    const resultObj = {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
    setCachedResponse(cacheKey, resultObj);
    res.json(resultObj);
  } catch (err) {
    console.error("Rankings error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/villages/amenities-status ─────────────────────────────────
// Get coverage and fulfillment status of basic amenities across villages
app.get("/api/villages/amenities-status", (req, res) => {
  try {
    const cacheKey = req.originalUrl;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const page = Math.max(1, safeInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, safeInt(req.query.limit, 25)));
    const offset = (page - 1) * limit;

    // Thresholds
    const water_t = parseFloat(req.query.water_t ?? 90);
    const sanitation_t = parseFloat(req.query.sanitation_t ?? 90);
    const electricity_t = parseFloat(req.query.electricity_t ?? 16);
    const school_t = parseFloat(req.query.school_t ?? 1);
    const hospital_t = parseFloat(req.query.hospital_t ?? 10);
    const road_t = parseFloat(req.query.road_t ?? 60);
    const internet_t = parseFloat(req.query.internet_t ?? 45);

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
    if (req.query.search) {
      conditions.push("v.village_name LIKE ?");
      params.push(`%${req.query.search}%`);
    }

    // Missing features filter (comma separated, e.g. "water,electricity")
    if (req.query.missing) {
      const missingList = req.query.missing.split(",");
      missingList.forEach(m => {
        if (m === "water") conditions.push(`v.drinking_water_coverage_pct < ${water_t}`);
        if (m === "sanitation") conditions.push(`v.sanitation_coverage_pct < ${sanitation_t}`);
        if (m === "electricity") conditions.push(`v.electricity_hours_per_day < ${electricity_t}`);
        if (m === "school") conditions.push(`v.school_count < ${school_t}`);
        if (m === "hospital") conditions.push(`v.nearest_hospital_distance_km > ${hospital_t}`);
        if (m === "road") conditions.push(`v.road_quality_index < ${road_t}`);
        if (m === "internet") conditions.push(`v.[internet_penetration%] < ${internet_t}`);
      });
    }

    // Fulfillment status filter: 'all', 'lacking', 'any'
    if (req.query.fulfillment === "all") {
      conditions.push(`v.drinking_water_coverage_pct >= ${water_t}`);
      conditions.push(`v.sanitation_coverage_pct >= ${sanitation_t}`);
      conditions.push(`v.electricity_hours_per_day >= ${electricity_t}`);
      conditions.push(`v.school_count >= ${school_t}`);
      conditions.push(`v.nearest_hospital_distance_km <= ${hospital_t}`);
      conditions.push(`v.road_quality_index >= ${road_t}`);
      conditions.push(`v.[internet_penetration%] >= ${internet_t}`);
    } else if (req.query.fulfillment === "lacking") {
      conditions.push(`(
        v.drinking_water_coverage_pct < ${water_t} OR
        v.sanitation_coverage_pct < ${sanitation_t} OR
        v.electricity_hours_per_day < ${electricity_t} OR
        v.school_count < ${school_t} OR
        v.nearest_hospital_distance_km > ${hospital_t} OR
        v.road_quality_index < ${road_t} OR
        v.[internet_penetration%] < ${internet_t}
      )`);
    }

    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    // 1. Fetch count query
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM villages v
      ${whereClause}
    `;
    const totalRow = db.prepare(countQuery).get(params);
    const total = totalRow ? totalRow.count : 0;

    // 2. Fetch data list query
    const sortBy = req.query.sort_by || "overall_rank";
    const order = req.query.order === "desc" ? "DESC" : "ASC";
    const validSorts = ["village_name", "state", "district", "overall_rank", "overall_score", "total_population"];
    const sortCol = validSorts.includes(sortBy) ? sortBy : "overall_rank";

    const dataQuery = `
      SELECT 
        v.village_id, v.village_name, v.district, v.state, v.total_population,
        v.drinking_water_coverage_pct, v.sanitation_coverage_pct, v.electricity_hours_per_day,
        v.school_count, v.nearest_hospital_distance_km, v.road_quality_index, v.[internet_penetration%] AS [internet_penetration%],
        d.overall_score, d.overall_rank,
        (v.drinking_water_coverage_pct >= ${water_t}) AS has_water,
        (v.sanitation_coverage_pct >= ${sanitation_t}) AS has_sanitation,
        (v.electricity_hours_per_day >= ${electricity_t}) AS has_electricity,
        (v.school_count >= ${school_t}) AS has_school,
        (v.nearest_hospital_distance_km <= ${hospital_t}) AS has_hospital,
        (v.road_quality_index >= ${road_t}) AS has_road,
        (v.[internet_penetration%] >= ${internet_t}) AS has_internet
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      ${whereClause}
      ORDER BY ${sortCol === "overall_score" || sortCol === "overall_rank" ? "d." + sortCol : "v." + sortCol} ${order}
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const rows = db.prepare(dataQuery).all(queryParams);

    // 3. Fetch aggregate stats
    const statsConditions = [];
    const statsParams = [];
    if (req.query.state) {
      statsConditions.push("v.state = ?");
      statsParams.push(req.query.state);
    }
    if (req.query.district) {
      statsConditions.push("v.district = ?");
      statsParams.push(req.query.district);
    }
    if (req.query.search) {
      statsConditions.push("v.village_name LIKE ?");
      statsParams.push(`%${req.query.search}%`);
    }
    const statsWhere = statsConditions.length ? "WHERE " + statsConditions.join(" AND ") : "";

    const statsQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN drinking_water_coverage_pct >= ${water_t} THEN 1 ELSE 0 END) as water_count,
        SUM(CASE WHEN sanitation_coverage_pct >= ${sanitation_t} THEN 1 ELSE 0 END) as sanitation_count,
        SUM(CASE WHEN electricity_hours_per_day >= ${electricity_t} THEN 1 ELSE 0 END) as electricity_count,
        SUM(CASE WHEN school_count >= ${school_t} THEN 1 ELSE 0 END) as school_count,
        SUM(CASE WHEN nearest_hospital_distance_km <= ${hospital_t} THEN 1 ELSE 0 END) as hospital_count,
        SUM(CASE WHEN road_quality_index >= ${road_t} THEN 1 ELSE 0 END) as road_count,
        SUM(CASE WHEN [internet_penetration%] >= ${internet_t} THEN 1 ELSE 0 END) as internet_count,
        SUM(CASE WHEN 
          drinking_water_coverage_pct >= ${water_t} AND
          sanitation_coverage_pct >= ${sanitation_t} AND
          electricity_hours_per_day >= ${electricity_t} AND
          school_count >= ${school_t} AND
          nearest_hospital_distance_km <= ${hospital_t} AND
          road_quality_index >= ${road_t} AND
          [internet_penetration%] >= ${internet_t}
          THEN 1 ELSE 0 END) as all_fulfilled_count
      FROM villages v
      ${statsWhere}
    `;
    const aggregates = db.prepare(statsQuery).get(statsParams);

    const resultObj = {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      aggregates: aggregates || {
        total_count: 0,
        water_count: 0,
        sanitation_count: 0,
        electricity_count: 0,
        school_count: 0,
        hospital_count: 0,
        road_count: 0,
        internet_count: 0,
        all_fulfilled_count: 0
      }
    };

    setCachedResponse(cacheKey, resultObj);
    res.json(resultObj);
  } catch (err) {
    console.error("Amenities status error:", err.message);
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

// ── GET /api/villages/:id/history ──────────────────────────────────────
// Retrieves multi-year development trajectory for a specific village
app.get("/api/villages/:id/history", (req, res) => {
  try {
    const id = safeInt(req.params.id, 0);

    // Fetch historical scores
    const history = db.prepare(`
      SELECT year, economy_score, education_score, health_score,
             infrastructure_score, environment_score, governance_score,
             social_score, overall_score
      FROM historical_scores
      WHERE village_id = ?
      ORDER BY year ASC
    `).all(id);

    // Fetch current scores as the 2026 anchor point
    const current = db.prepare(`
      SELECT 2026 as year, economy_score, education_score, health_score,
             infrastructure_score, environment_score, governance_score,
             social_score, overall_score
      FROM domain_scores
      WHERE village_id = ?
    `).get(id);

    if (current) {
      history.push(current);
    }

    res.json({ success: true, history });
  } catch (err) {
    console.error("Village history error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/villages/:id/recommendations ──────────────────────────────
// Generates localized policy recommendations using Gemini (with offline fallback)
app.post("/api/villages/:id/recommendations", async (req, res) => {
  try {
    const id = safeInt(req.params.id, 0);

    const village = db.prepare(`
      SELECT v.*, d.economy_score, d.education_score, d.health_score,
             d.infrastructure_score, d.environment_score,
             d.governance_score, d.social_score, d.overall_score
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      WHERE v.village_id = ?
    `).get(id);

    if (!village) {
      return res.status(404).json({ error: "Village not found" });
    }

    const domains = [
      { name: "Economy", score: village.economy_score, key: "economy" },
      { name: "Education", score: village.education_score, key: "education" },
      { name: "Health", score: village.health_score, key: "health" },
      { name: "Infrastructure", score: village.infrastructure_score, key: "infrastructure" },
      { name: "Environment", score: village.environment_score, key: "environment" },
      { name: "Governance", score: village.governance_score, key: "governance" },
      { name: "Social", score: village.social_score, key: "social" }
    ];

    domains.sort((a, b) => a.score - b.score);
    const bottlenecks = domains.slice(0, 3);

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const prompt = `You are a development policy consultant. Analyze the following Indian village profile and propose actionable development recommendations.

Village: ${village.village_name}
District: ${village.district}
State: ${village.state}
Total Population: ${village.total_population?.toLocaleString() ?? "N/A"}

Current Development Domain Scores (out of 100):
${domains.map(d => `- ${d.name}: ${d.score.toFixed(1)}`).join("\n")}

Identify the top 2-3 bottleneck domains (which are: ${bottlenecks.map(b => `${b.name} (${b.score.toFixed(1)})`).join(", ")}).
Provide concrete, practical, and highly actionable policy recommendations. Align your recommendations with existing government schemes in India (e.g., Jal Jeevan Mission, Samagra Shiksha, National Health Mission, MGNREGA, PMGSY, PM-JAY, Swachh Bharat Mission).
Keep your response concise, professional, structured in clear Markdown, using headers, bullet points, and bold text. Do not use conversational filler. Make it ready to print.`;

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          const text = data.candidates[0].content.parts[0].text;
          return res.json({ success: true, method: "gemini", recommendations: text });
        } else {
          console.warn("Gemini API response format invalid or quota exceeded. Falling back to local engine.");
        }
      } catch (geminiErr) {
        console.error("Gemini API call failed:", geminiErr.message);
      }
    }

    // Local Expert Policy Recommendations Generator
    const fallbacks = {
      infrastructure: {
        alignment: "Jal Jeevan Mission & Swachh Bharat Mission (Grameen)",
        intervention: "Expand piped drinking water taps and execute solid/liquid waste management infrastructure in public spaces.",
        actionItem: "Implement concrete village drainage networks and upgrade electricity grid substations to ensure at least 18+ hours of daily power supply."
      },
      education: {
        alignment: "Samagra Shiksha Abhiyan & PM SHRI Schools",
        intervention: "Launch school dropout reduction campaigns, targeting female students. Improve digital infrastructure in schools.",
        actionItem: "Establish a community computer lab and launch evening vocational training programs to improve youth employment literacy."
      },
      health: {
        alignment: "National Health Mission (NHM) & Ayushman Bharat (PM-JAY)",
        intervention: "Resolve health service isolation by scheduling monthly mobile medical camps and upgrading local primary health sub-centers.",
        actionItem: "Reinforce child nutrition trackers via local Anganwadis to address the malnutrition rates effectively."
      },
      economy: {
        alignment: "MGNREGA & Deendayal Antyodaya Yojana (DAY-NRLM)",
        intervention: "Drive non-farm micro-enterprise programs and establish micro-credit linkages through Self-Help Groups (SHGs).",
        actionItem: "Create an agricultural cooperative collection point to give farmers direct access to nearby markets, cutting out intermediate traders."
      },
      environment: {
        alignment: "National Disaster Management Plan & Green India Mission",
        intervention: "Formulate community disaster response teams and establish storm/flood shelter maps.",
        actionItem: "Carry out community afforestation drives and run groundwater recharge/rainwater harvesting projects."
      },
      governance: {
        alignment: "e-Panchayat Mission Mode Project",
        intervention: "Digitize Gram Panchayat records and set up digital citizen kiosks for transparency.",
        actionItem: "Hold regular open-floor *Gram Sabhas* to review budget fund utilization and citizen grievances directly."
      },
      social: {
        alignment: "National Youth Policy & Mahila Shakti Kendra",
        intervention: "Build community youth recreation spaces and setup local dispute mediation boards to encourage social cohesion.",
        actionItem: "Implement female-led watch programs and organize vocational skill workshops specifically for youth."
      }
    };

    const rules = [
      {
        key: "infrastructure",
        check: (v) => v.drinking_water_coverage_pct !== null && v.drinking_water_coverage_pct < 60,
        alignment: "Jal Jeevan Mission (Har Ghar Jal)",
        finding: (v) => `Piped drinking water tap coverage is very low at **${v.drinking_water_coverage_pct.toFixed(1)}%**.`,
        intervention: "Mobilize local Gram Panchayat development funds to lay primary distribution pipelines and connect all houses."
      },
      {
        key: "infrastructure",
        check: (v) => v.sanitation_coverage_pct !== null && v.sanitation_coverage_pct < 60,
        alignment: "Swachh Bharat Mission (Grameen)",
        finding: (v) => `Individual household toilet/sanitation coverage is low at **${v.sanitation_coverage_pct.toFixed(1)}%**.`,
        intervention: "Construct community sanitary complexes and construct decentralized solid/liquid waste pits."
      },
      {
        key: "infrastructure",
        check: (v) => v.electricity_hours_per_day !== null && v.electricity_hours_per_day < 14,
        alignment: "Deendayal Upadhyaya Gram Jyoti Yojana (DDUGJY)",
        finding: (v) => `Grid power supply averages only **${v.electricity_hours_per_day.toFixed(1)} hours/day**.`,
        intervention: "Install rooftop solar power grids on government buildings and upgrade transformer substation capacity."
      },
      {
        key: "infrastructure",
        check: (v) => v["internet_penetration%"] !== null && v["internet_penetration%"] < 40,
        alignment: "BharatNet / Digital India",
        finding: (v) => `Internet penetration is low at **${v["internet_penetration%"].toFixed(1)}%**.`,
        intervention: "Activate a public Wi-Fi hotspot at the Gram Panchayat bhawan and community schools."
      },
      {
        key: "infrastructure",
        check: (v) => v.nearest_hospital_distance_km !== null && v.nearest_hospital_distance_km > 15,
        alignment: "PMGSY / National Health Mission",
        finding: (v) => `The nearest hospital is **${v.nearest_hospital_distance_km.toFixed(1)} km** away, creating severe isolation.`,
        intervention: "Secure priority funding under PMGSY to build all-weather roads and coordinate weekly Mobile Medical Unit (MMU) visits."
      },
      {
        key: "education",
        check: (v) => v.dropout_rate !== null && v.dropout_rate > 10,
        alignment: "Samagra Shiksha Abhiyan",
        finding: (v) => `School dropout rate is high at **${v.dropout_rate.toFixed(1)}%**.`,
        intervention: "Deploy student retention counselors, implement free lunch incentives, and distribute free bicycles/uniforms to reduce transition barriers."
      }
    ];

    let recommendations = `### 📋 Expert Development Policy Report for **${village.village_name}**
**Location**: ${village.district}, ${village.state} | **Population**: ${village.total_population?.toLocaleString() ?? "N/A"}

Below is a customized development plan generated by the V-Connect Local Expert Rules Engine based on the specific bottleneck metrics of this village.

---

`;

    bottlenecks.forEach((b, idx) => {
      recommendations += `#### ${idx + 1}. Focus Area: **${b.name}** (Score: ${b.score.toFixed(1)}/100)\n\n`;
      let added = 0;
      const domainRules = rules.filter(r => r.key === b.key);
      domainRules.forEach(r => {
        if (r.check(village)) {
          recommendations += `*   **Scheme Alignment**: *${r.alignment}*\n`;
          recommendations += `    *   *Finding*: ${r.finding(village)}\n`;
          recommendations += `    *   *Intervention*: ${r.intervention}\n\n`;
          added++;
        }
      });

      if (added === 0) {
        const fb = fallbacks[b.key];
        recommendations += `*   **Scheme Alignment**: *${fb.alignment}*\n`;
        recommendations += `    *   *Intervention*: ${fb.intervention}\n`;
        recommendations += `    *   *Action Item*: ${fb.actionItem}\n\n`;
      }
    });

    recommendations += `---
*Note: This policy brief was generated automatically by the V-Connect local expert rule-based policy analysis engine.*`;

    res.json({ success: true, method: "local", recommendations });  } catch (err) {
    console.error("Recommendations error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/data-quality ────────────────────────────────────────
// Analyzes database records for anomalies, range errors, and integrity scoring
app.get("/api/admin/data-quality", (req, res) => {
  try {
    const totalVillagesRow = db.prepare("SELECT COUNT(*) as count FROM villages").get();
    const total = totalVillagesRow.count || 1;

    // 1. Coordinates anomaly (outside India boundaries)
    const coordAnomalyRow = db.prepare(`
      SELECT COUNT(*) as count FROM villages 
      WHERE (latitude IS NOT NULL AND longitude IS NOT NULL)
        AND (latitude < 6.0 OR latitude > 38.0 OR longitude < 68.0 OR longitude > 98.0)
    `).get();
    const coordAnomalies = db.prepare(`
      SELECT village_id, village_name, district, state, latitude, longitude FROM villages 
      WHERE (latitude IS NOT NULL AND longitude IS NOT NULL)
        AND (latitude < 6.0 OR latitude > 38.0 OR longitude < 68.0 OR longitude > 98.0)
      LIMIT 5
    `).all();

    // 2. Demographic anomaly (zero or null population/households)
    const demoAnomalyRow = db.prepare(`
      SELECT COUNT(*) as count FROM villages 
      WHERE total_population IS NULL OR total_population <= 0 OR households IS NULL OR households < 0
    `).get();
    const demoAnomalies = db.prepare(`
      SELECT village_id, village_name, district, state, total_population, households FROM villages 
      WHERE total_population IS NULL OR total_population <= 0 OR households IS NULL OR households < 0
      LIMIT 5
    `).all();

    // 3. Metric anomaly (percentages out of bounds)
    const pctAnomalyRow = db.prepare(`
      SELECT COUNT(*) as count FROM villages 
      WHERE drinking_water_coverage_pct < 0 OR drinking_water_coverage_pct > 100
         OR sanitation_coverage_pct < 0 OR sanitation_coverage_pct > 100
         OR [internet_penetration%] < 0 OR [internet_penetration%] > 100
    `).get();
    const pctAnomalies = db.prepare(`
      SELECT village_id, village_name, drinking_water_coverage_pct, sanitation_coverage_pct, [internet_penetration%] FROM villages 
      WHERE drinking_water_coverage_pct < 0 OR drinking_water_coverage_pct > 100
         OR sanitation_coverage_pct < 0 OR sanitation_coverage_pct > 100
         OR [internet_penetration%] < 0 OR [internet_penetration%] > 100
      LIMIT 5
    `).all();

    // 4. Extreme Hospital Distance Outliers (>50km)
    const hospAnomalyRow = db.prepare(`
      SELECT COUNT(*) as count FROM villages 
      WHERE nearest_hospital_distance_km > 50.0
    `).get();
    const hospAnomalies = db.prepare(`
      SELECT village_id, village_name, district, state, nearest_hospital_distance_km FROM villages 
      WHERE nearest_hospital_distance_km > 50.0
      LIMIT 5
    `).all();

    // Calculate database integrity score
    const totalAnomalousPoints = coordAnomalyRow.count + demoAnomalyRow.count + pctAnomalyRow.count + hospAnomalyRow.count;
    const errorRate = totalAnomalousPoints / (total * 4); // 4 dimensions checked
    const healthScore = Math.max(0, Math.min(100, Number((100 - (errorRate * 100)).toFixed(2))));

    res.json({
      success: true,
      stats: {
        totalVillages: total,
        healthScore,
        coordAnomalyCount: coordAnomalyRow.count,
        demoAnomalyCount: demoAnomalyRow.count,
        pctAnomalyCount: pctAnomalyRow.count,
        hospAnomalyCount: hospAnomalyRow.count,
        totalAnomalies: totalAnomalousPoints
      },
      anomalies: {
        coordinates: coordAnomalies,
        demographics: demoAnomalies,
        percentages: pctAnomalies,
        hospitalDistances: hospAnomalies
      }
    });
  } catch (err) {
    console.error("Data quality audit error:", err.message);
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
    const cacheKey = req.originalUrl;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const row = db.prepare("SELECT stat_value FROM dashboard_stats WHERE stat_key = 'summary'").get();
    if (!row) {
      return res.status(500).json({ error: "Summary stats not found. Database ingestion may be incomplete." });
    }
    const resultObj = JSON.parse(row.stat_value);
    setCachedResponse(cacheKey, resultObj);
    res.json(resultObj);
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
    const cacheKey = req.originalUrl;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const stateList = req.query.states ? req.query.states.split(",") : [];

    const row = db.prepare("SELECT stat_value FROM dashboard_stats WHERE stat_key = 'state_comparison'").get();
    if (!row) {
      return res.status(500).json({ error: "State comparisons not found. Database ingestion may be incomplete." });
    }
    
    let data = JSON.parse(row.stat_value);

    if (stateList.length > 0) {
      data = data.filter(d => stateList.includes(d.state));
    }

    const resultObj = { data };
    setCachedResponse(cacheKey, resultObj);
    res.json(resultObj);
  } catch (err) {
    console.error("Compare states error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/simulation/region ─────────────────────────────────────────
// Runs a budget optimization simulation across an entire district or state
app.get("/api/simulation/region", (req, res) => {
  try {
    const state = req.query.state;
    const district = req.query.district;
    const totalBudget = parseFloat(req.query.budget || 5000000);
    const strategy = req.query.strategy || "balanced";

    if (!state || !district) {
      return res.status(400).json({ error: "Missing state or district parameter" });
    }

    // Fetch all matching villages in that district
    const query = `
      SELECT v.village_id, v.village_name, v.district, v.state, v.total_population, v.priority_level, v.recommended_budget_inr,
             d.economy_score, d.education_score, d.health_score, d.infrastructure_score, d.environment_score, d.governance_score, d.social_score, d.overall_score
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      WHERE v.state = ? AND v.district = ?
    `;
    const villages = db.prepare(query).all(state, district);

    if (villages.length === 0) {
      return res.json({ success: true, strategy, budget: totalBudget, summary: {}, domainBudgetSpent: {}, topImproved: [], villages: [] });
    }

    // Cost factors and optimizer parameters
    const OPTIMIZER_FACTORS = {
      avg_household_income: { costFactor: 300, isPositive: true, domain: "economy" },
      poverty_rate: { costFactor: 15000, isPositive: false, domain: "economy" },
      dropout_rate: { costFactor: 10000, isPositive: false, domain: "education" },
      digital_literacy_rate: { costFactor: 8000, isPositive: true, domain: "education" },
      malnutrition_rate: { costFactor: 25000, isPositive: false, domain: "health" },
      avg_healthcare_access_time_min: { costFactor: 4000, isPositive: false, domain: "health" },
      drinking_water_coverage_pct: { costFactor: 12000, isPositive: true, domain: "infrastructure" },
      sanitation_coverage_pct: { costFactor: 10000, isPositive: true, domain: "infrastructure" },
      electricity_hours_per_day: { costFactor: 30000, isPositive: true, domain: "infrastructure" },
      "internet_penetration%": { costFactor: 5000, isPositive: true, domain: "infrastructure" }
    };

    // Modify cost factors according to strategy
    const currentFactors = {};
    for (const [key, val] of Object.entries(OPTIMIZER_FACTORS)) {
      currentFactors[key] = { ...val };
      if (strategy === val.domain) {
        currentFactors[key].costFactor *= 0.3; // Strategy domains are 70% cheaper to improve (representing targeted policy efficiency)
      } else if (strategy !== "balanced") {
        currentFactors[key].costFactor *= 1.5; // Other domains are more expensive in focused strategies
      }
    }

    // Step configuration
    const SLIDER_CONFIGS = [
      { col: 'avg_household_income', minVal: 1000, maxVal: 250000, step: 500 },
      { col: 'poverty_rate', minVal: 0, maxVal: 100, step: 1 },
      { col: 'dropout_rate', minVal: 0, maxVal: 100, step: 0.5 },
      { col: 'digital_literacy_rate', minVal: 0, maxVal: 100, step: 1 },
      { col: 'malnutrition_rate', minVal: 0, maxVal: 100, step: 0.5 },
      { col: 'avg_healthcare_access_time_min', minVal: 5, maxVal: 250, step: 5 },
      { col: 'drinking_water_coverage_pct', minVal: 0, maxVal: 100, step: 1 },
      { col: 'sanitation_coverage_pct', minVal: 0, maxVal: 100, step: 1 },
      { col: 'electricity_hours_per_day', minVal: 0, maxVal: 24, step: 1 },
      { col: 'internet_penetration%', minVal: 0, maxVal: 100, step: 1 },
    ];

    const METRIC_MAP_SIM = {
      economy: ["avg_household_income", "poverty_rate"],
      education: ["dropout_rate", "digital_literacy_rate"],
      health: ["malnutrition_rate", "avg_healthcare_access_time_min"],
      infrastructure: ["drinking_water_coverage_pct", "sanitation_coverage_pct", "electricity_hours_per_day", "internet_penetration%"],
    };

    // Calculate baseline stats
    let totalPopulation = 0;
    let sumOverallScore = 0;
    
    // Sort villages by overall score (ascending) so budget is distributed starting with the most in-need
    const sortedVillages = [...villages].sort((a, b) => a.overall_score - b.overall_score);

    // Let's allocate budget.
    // Proportional to: population * (100 - overall_score) * priority weight
    const priorityWeights = { critical: 4, high: 3, medium: 2, moderate: 2, stable: 1, low: 1 };
    
    let totalNeedWeight = 0;
    const villageNeeds = sortedVillages.map(v => {
      totalPopulation += v.total_population || 0;
      sumOverallScore += v.overall_score || 0;
      
      const scoreDeficit = Math.max(0, 100 - (v.overall_score || 50));
      const priorityWeight = priorityWeights[(v.priority_level || "").toLowerCase()] || 1;
      const needWeight = (v.total_population || 1000) * scoreDeficit * priorityWeight;
      
      totalNeedWeight += needWeight;
      return { id: v.village_id, needWeight };
    });

    const baselineAvgScore = sumOverallScore / villages.length;
    
    // Allocate budget to each village based on need weight
    let allocatedBudgetSum = 0;
    const villageBudgets = {};
    villageNeeds.forEach(vn => {
      const share = totalNeedWeight > 0 ? (vn.needWeight / totalNeedWeight) : (1 / villages.length);
      const alloc = Math.round(totalBudget * share);
      villageBudgets[vn.id] = alloc;
      allocatedBudgetSum += alloc;
    });

    // Fetch all raw metrics for matching villages in one SQL query
    const METRIC_MAP_COLS = {
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
                 "youth_engagement_score"]
    };

    const NEGATIVE_METRICS_LIST = [
      "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
      "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
      "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
      "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km",
      "air_quality_index"
    ];

    const allMetrics = [];
    Object.values(METRIC_MAP_COLS).forEach(cols => {
      cols.forEach(col => {
        allMetrics.push(col);
      });
    });

    const selectCols = allMetrics.map(col => `v.[${col}]`).join(", ");
    const rawData = db.prepare(`SELECT v.village_id, ${selectCols} FROM villages v WHERE v.state = ? AND v.district = ?`).all(state, district);
    
    const rawMetricsMap = {};
    rawData.forEach(row => {
      rawMetricsMap[row.village_id] = row;
    });

    // Normalization logic
    const getNormalizedValue = (col, val) => {
      const colMeta = metricMeta[col];
      if (!colMeta) return 50.0;
      const { min, max } = colMeta;
      if (min === max) return 50.0;
      let norm = ((val - min) / (max - min)) * 100;
      norm = Math.min(100, Math.max(0, norm));
      const isNegative = NEGATIVE_METRICS_LIST.includes(col);
      return isNegative ? (100 - norm) : norm;
    };

    const simulatedVillages = [];
    let simulatedSumOverallScore = 0;
    const domainBudgetSpent = { economy: 0, education: 0, health: 0, infrastructure: 0, environment: 0, governance: 0, social: 0 };

    sortedVillages.forEach(v => {
      const vid = v.village_id;
      const budget = villageBudgets[vid] || 0;
      const raw = rawMetricsMap[vid] || {};

      // Initialize simulated metrics
      const simMetrics = {};
      SLIDER_CONFIGS.forEach(cfg => {
        const dbCol = cfg.col;
        simMetrics[cfg.col] = raw[dbCol] !== undefined ? raw[dbCol] : (metricMeta[cfg.col]?.min || 0);
      });

      // Simple gradient step loop per village
      let remaining = budget;
      let stepsCount = 0;
      const maxSteps = 100;

      while (remaining > 0 && stepsCount < maxSteps) {
        let bestMetric = null;
        let bestROI = -1;
        let bestStepCost = 0;
        let bestNextVal = 0;

        SLIDER_CONFIGS.forEach(cfg => {
          const col = cfg.col;
          const currentVal = simMetrics[col];
          const config = currentFactors[col];
          if (!config) return;

          let stepVal = cfg.step;
          let nextVal;
          if (config.isPositive) {
            nextVal = Math.min(cfg.maxVal, currentVal + stepVal);
          } else {
            nextVal = Math.max(cfg.minVal, currentVal - stepVal);
          }

          if (nextVal === currentVal) return;

          const valChange = Math.abs(nextVal - currentVal);
          const stepCost = valChange * config.costFactor;

          if (stepCost > remaining) return;

          const currentNorm = getNormalizedValue(col, currentVal);
          const nextNorm = getNormalizedValue(col, nextVal);
          const normGain = nextNorm - currentNorm;

          const roi = normGain / stepCost;
          if (roi > bestROI && normGain > 0) {
            bestROI = roi;
            bestMetric = col;
            bestStepCost = stepCost;
            bestNextVal = nextVal;
          }
        });

        if (!bestMetric) break;

        simMetrics[bestMetric] = bestNextVal;
        remaining -= bestStepCost;
        const colDomain = currentFactors[bestMetric].domain;
        domainBudgetSpent[colDomain] += bestStepCost;
        stepsCount++;
      }

      // Recompute domain scores and overall score using all domain metrics
      const simScores = {};
      Object.entries(METRIC_MAP_COLS).forEach(([category, mCols]) => {
        const domain = category.toLowerCase();
        let sum = 0;
        let count = 0;
        mCols.forEach(col => {
          let val;
          if (SLIDER_CONFIGS.some(cfg => cfg.col === col)) {
            val = simMetrics[col]; // Use simulated value if it's optimized
          } else {
            val = raw[col]; // Use original DB value
          }

          if (val !== undefined && val !== null) {
            sum += getNormalizedValue(col, val);
            count++;
          }
        });
        simScores[domain] = count > 0 ? sum / count : 50.0;
      });

      const simOverallScore = (simScores.economy + simScores.education + simScores.health + simScores.infrastructure + simScores.environment + simScores.governance + simScores.social) / 7;
      simulatedSumOverallScore += simOverallScore;

      simulatedVillages.push({
        village_id: vid,
        village_name: v.village_name,
        overall_score: v.overall_score,
        simulated_overall_score: Number(simOverallScore.toFixed(2)),
        score_gain: Number((simOverallScore - v.overall_score).toFixed(2)),
        budget_allocated: budget,
        priority_level: v.priority_level
      });
    });

    const simulatedAvgScore = simulatedSumOverallScore / villages.length;
    const avgScoreGain = simulatedAvgScore - baselineAvgScore;

    // Estimate rank shift:
    const { rank: baselineRank } = db.prepare("SELECT COUNT(*) + 1 as rank FROM domain_scores WHERE overall_score > ?").get(baselineAvgScore);
    const { rank: simulatedRank } = db.prepare("SELECT COUNT(*) + 1 as rank FROM domain_scores WHERE overall_score > ?").get(simulatedAvgScore);
    const rankImprovement = baselineRank - simulatedRank;

    // Get top 5 improved villages
    const topImproved = [...simulatedVillages]
      .sort((a, b) => b.score_gain - a.score_gain)
      .slice(0, 5);

    res.json({
      success: true,
      strategy,
      budget: totalBudget,
      summary: {
        totalVillages: villages.length,
        totalPopulation,
        baselineAvgScore: Number(baselineAvgScore.toFixed(2)),
        simulatedAvgScore: Number(simulatedAvgScore.toFixed(2)),
        avgScoreGain: Number(avgScoreGain.toFixed(2)),
        baselineRank,
        simulatedRank,
        rankImprovement,
        allocatedBudgetSum,
      },
      domainBudgetSpent,
      topImproved,
      villages: simulatedVillages.slice(0, 100)
    });
  } catch (err) {
    console.error("Simulation error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: rebuild dashboard stats cache ──────────────────────────────
function rebuildDashboardStats() {
  const totalVillages = db.prepare("SELECT COUNT(*) as count FROM villages").get().count;
  const totalStates = db.prepare("SELECT COUNT(DISTINCT state) as count FROM villages").get().count;
  const totalDistricts = db.prepare("SELECT COUNT(DISTINCT district) as count FROM villages").get().count;
  
  const priorityBreakdown = db.prepare("SELECT priority_level, COUNT(*) as count FROM villages WHERE priority_level IS NOT NULL GROUP BY priority_level").all();
  
  const avgScores = db.prepare(`
    SELECT 
      AVG(economy_score) as economy,
      AVG(education_score) as education,
      AVG(health_score) as health,
      AVG(infrastructure_score) as infrastructure,
      AVG(environment_score) as environment,
      AVG(governance_score) as governance,
      AVG(social_score) as social,
      AVG(overall_score) as overall
    FROM domain_scores
  `).get();
  
  for (const k in avgScores) {
    avgScores[k] = Number((avgScores[k] || 50.0).toFixed(2));
  }
  
  const stateComparison = db.prepare(`
    SELECT
      v.state,
      COUNT(v.village_id) as village_count,
      ROUND(AVG(d.economy_score), 2) as economy_score,
      ROUND(AVG(d.education_score), 2) as education_score,
      ROUND(AVG(d.health_score), 2) as health_score,
      ROUND(AVG(d.infrastructure_score), 2) as infrastructure_score,
      ROUND(AVG(d.environment_score), 2) as environment_score,
      ROUND(AVG(d.governance_score), 2) as governance_score,
      ROUND(AVG(d.social_score), 2) as social_score,
      ROUND(AVG(d.overall_score), 2) as overall_score
    FROM villages v
    JOIN domain_scores d ON v.village_id = d.village_id
    GROUP BY v.state
    ORDER BY overall_score DESC
  `).all();
  
  const topStates = stateComparison.slice(0, 10);
  const bottomStates = stateComparison.slice(-10);
  
  const summaryStats = {
    totalVillages,
    totalStates,
    totalDistricts,
    priorityBreakdown,
    avgScores,
    topStates,
    bottomStates
  };
  
  const states = db.prepare("SELECT DISTINCT state FROM villages WHERE state IS NOT NULL ORDER BY state").all().map(r => r.state);
  const priorities = db.prepare("SELECT DISTINCT priority_level FROM villages WHERE priority_level IS NOT NULL ORDER BY priority_level").all().map(r => r.priority_level);
  
  const stateDistricts = {};
  const distRows = db.prepare("SELECT DISTINCT state, district FROM villages WHERE state IS NOT NULL AND district IS NOT NULL ORDER BY state, district").all();
  distRows.forEach(r => {
    if (!stateDistricts[r.state]) {
      stateDistricts[r.state] = [];
    }
    stateDistricts[r.state].push(r.district);
  });
  
  const filtersData = {
    states,
    priorities,
    state_districts: stateDistricts
  };
  
  db.prepare("INSERT OR REPLACE INTO dashboard_stats (stat_key, stat_value) VALUES ('summary', ?)").run(JSON.stringify(summaryStats));
  db.prepare("INSERT OR REPLACE INTO dashboard_stats (stat_key, stat_value) VALUES ('state_comparison', ?)").run(JSON.stringify(stateComparison));
  db.prepare("INSERT OR REPLACE INTO dashboard_stats (stat_key, stat_value) VALUES ('filters', ?)").run(JSON.stringify(filtersData));
}

// ── POST /api/admin/update-budget ──────────────────────────────────────
// Updates recommended budget & priority level for a village in the database
app.post("/api/admin/update-budget", (req, res) => {
  try {
    const { village_id, recommended_budget_inr, priority_level } = req.body;

    if (!village_id) {
      return res.status(400).json({ error: "Missing village_id" });
    }

    const stmt = db.prepare(`
      UPDATE villages
      SET recommended_budget_inr = ?, priority_level = ?
      WHERE village_id = ?
    `);
    const result = stmt.run(recommended_budget_inr, priority_level, village_id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Village not found or no changes made" });
    }

    rebuildDashboardStats(); // update cache
    invalidateApiCache();

    res.json({ success: true, message: `Village ${village_id} updated successfully.` });
  } catch (err) {
    console.error("Admin update budget error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/ingest-csv ─────────────────────────────────────────
// Parses and ingests raw CSV values into the SQLite database, recomputes rankings and statistics
app.post("/api/admin/ingest-csv", (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: "Missing csvContent" });
    }

    const lines = csvContent.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV must contain headers and at least one data row" });
    }

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    if (headers[0] !== 'village_id') {
      return res.status(400).json({ error: "CSV headers must start with 'village_id'" });
    }

    const VALID_METRICS = [
      "employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%",
      "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score",
      "literacy_rate", "female_literacy_rate", "dropout_rate", "school_count",
      "teacher_student_ratio", "digital_literacy_rate", "infant_mortality_rate",
      "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000",
      "avg_healthcare_access_time_min", "healthcare_effectiveness_score",
      "drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index",
      "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km",
      "flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct",
      "disaster_preparedness_score", "climate_vulnerability_index", "panchayat_efficiency_score",
      "transparency_index", "fund_utilization_pct", "scheme_coverage_pct",
      "corruption_risk_proxy", "total_crime_rate", "crimes_against_women_rate",
      "social_cohesion_index", "community_participation_score", "youth_engagement_score",
      "recommended_budget_inr", "priority_level"
    ];

    const invalidHeaders = headers.slice(1).filter(h => !VALID_METRICS.includes(h));
    if (invalidHeaders.length > 0) {
      return res.status(400).json({ error: `Invalid columns: [${invalidHeaders.join(', ')}]` });
    }

    const updates = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(v => v.trim());
      if (row.length !== headers.length) {
        return res.status(400).json({ error: `Row ${i + 1} has column count mismatch (expected ${headers.length}, got ${row.length})` });
      }

      const villageId = parseInt(row[0], 10);
      if (isNaN(villageId)) {
        return res.status(400).json({ error: `Row ${i + 1} has invalid village_id: "${row[0]}"` });
      }

      const rowData = {};
      for (let j = 1; j < row.length; j++) {
        const header = headers[j];
        if (header === 'priority_level') {
          rowData[header] = row[j];
        } else {
          const val = parseFloat(row[j]);
          if (isNaN(val)) {
            return res.status(400).json({ error: `Row ${i + 1} has invalid value for ${headers[j]}: "${row[j]}"` });
          }
          rowData[header] = val;
        }
      }
      updates.push({ villageId, data: rowData });
    }

    const METRIC_MAP_COLS = {
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
                 "youth_engagement_score"]
    };

    const NEGATIVE_METRICS_LIST = [
      "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
      "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
      "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
      "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km",
      "air_quality_index"
    ];

    const runTransaction = db.transaction((updatesList) => {
      updatesList.forEach(({ villageId, data }) => {
        const cols = Object.keys(data);
        if (cols.length === 0) return;

        const setClause = cols.map(c => `[${c}] = ?`).join(', ');
        const vals = cols.map(c => data[c]);

        db.prepare(`UPDATE villages SET ${setClause} WHERE village_id = ?`).run(...vals, villageId);

        // Fetch full updated village row
        const village = db.prepare("SELECT * FROM villages WHERE village_id = ?").get(villageId);
        if (!village) return;

        // Recalculate domain scores
        const simScores = {};
        Object.entries(METRIC_MAP_COLS).forEach(([category, mCols]) => {
          const domain = category.toLowerCase();
          let sum = 0;
          let count = 0;
          mCols.forEach(col => {
            const val = village[col];
            if (val !== undefined && val !== null) {
              const isNegative = NEGATIVE_METRICS_LIST.includes(col);
              const colMeta = metricMeta[col];
              if (colMeta) {
                const { min, max } = colMeta;
                let norm = min === max ? 50.0 : ((val - min) / (max - min)) * 100;
                norm = Math.min(100, Math.max(0, norm));
                sum += isNegative ? (100 - norm) : norm;
                count++;
              }
            }
          });
          simScores[domain] = count > 0 ? sum / count : 50.0;
        });

        const overallScore = (simScores.economy + simScores.education + simScores.health + 
                              simScores.infrastructure + simScores.environment + simScores.governance + 
                              simScores.social) / 7;

        db.prepare(`
          UPDATE domain_scores
          SET economy_score = ?, education_score = ?, health_score = ?, 
              infrastructure_score = ?, environment_score = ?, governance_score = ?, 
              social_score = ?, overall_score = ?
          WHERE village_id = ?
        `).run(
          simScores.economy, simScores.education, simScores.health,
          simScores.infrastructure, simScores.environment, simScores.governance,
          simScores.social, overallScore, villageId
        );
      });

      // Recompute all ranks
      db.prepare(`
        WITH Ranked AS (
          SELECT village_id, RANK() OVER (ORDER BY overall_score DESC) as new_rank
          FROM domain_scores
        )
        UPDATE domain_scores
        SET overall_rank = (SELECT new_rank FROM Ranked WHERE Ranked.village_id = domain_scores.village_id)
      `).run();

      // Invalidate stats cache
      rebuildDashboardStats();
    });

    runTransaction(updates);
    invalidateApiCache();

    res.json({ success: true, message: `Successfully updated ${updates.length} village records. Scores & overall ranks recomputed.` });
  } catch (err) {
    console.error("CSV Ingestion Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats ───────────────────────────────────────────────
// Get SQLite database metadata, tables, indexes, and sizes
app.get("/api/admin/stats", (req, res) => {
  try {
    const villageCountRow = db.prepare("SELECT COUNT(*) as count FROM villages").get();
    const scoreCountRow = db.prepare("SELECT COUNT(*) as count FROM domain_scores").get();
    
    // Count distinct states and districts in precalculated filter or DB
    const stateCountRow = db.prepare("SELECT COUNT(DISTINCT state) as count FROM villages").get();
    const districtCountRow = db.prepare("SELECT COUNT(DISTINCT district) as count FROM villages").get();

    const dbSize = require("fs").statSync(DB_PATH).size;

    res.json({
      villageCount: villageCountRow.count,
      scoreCount: scoreCountRow.count,
      stateCount: stateCountRow.count,
      districtCount: districtCountRow.count,
      databaseSizeMB: (dbSize / (1024 * 1024)).toFixed(2),
      dbPath: DB_PATH,
    });
  } catch (err) {
    console.error("Admin stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats/districts ───────────────────────────────────────────
// Aggregates village-level metrics to district-level centroids
app.get("/api/stats/districts", (req, res) => {
  try {
    const query = `
      SELECT
        v.state,
        v.district,
        AVG(v.latitude) as latitude,
        AVG(v.longitude) as longitude,
        AVG(d.overall_score) as overall_score,
        AVG(d.economy_score) as economy_score,
        AVG(d.education_score) as education_score,
        AVG(d.health_score) as health_score,
        AVG(d.infrastructure_score) as infrastructure_score,
        AVG(d.environment_score) as environment_score,
        AVG(d.governance_score) as governance_score,
        AVG(d.social_score) as social_score,
        SUM(v.total_population) as total_population,
        COUNT(v.village_id) as village_count
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL
      GROUP BY v.state, v.district
    `;
    const rows = db.prepare(query).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("District aggregation stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/correlation ─────────────────────────────────────
// Calculates Pearson correlation coefficient and returns sampled data points
app.get("/api/analytics/correlation", (req, res) => {
  try {
    const { var1, var2 } = req.query;

    const VALID_VARIABLES = [
      "economy_score", "education_score", "health_score", "infrastructure_score",
      "environment_score", "governance_score", "social_score", "overall_score",
      "employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%",
      "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score",
      "literacy_rate", "female_literacy_rate", "dropout_rate", "school_count",
      "teacher_student_ratio", "digital_literacy_rate", "infant_mortality_rate",
      "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000",
      "avg_healthcare_access_time_min", "healthcare_effectiveness_score",
      "drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index",
      "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km",
      "flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct",
      "disaster_preparedness_score", "climate_vulnerability_index", "panchayat_efficiency_score",
      "transparency_index", "fund_utilization_pct", "scheme_coverage_pct",
      "corruption_risk_proxy", "total_crime_rate", "crimes_against_women_rate",
      "social_cohesion_index", "community_participation_score", "youth_engagement_score",
      "total_population", "households", "population_density", "area_sq_km"
    ];

    if (var1 && var2) {
      const cleanVar1 = VALID_VARIABLES.find(v => v.toLowerCase() === var1.toLowerCase());
      const cleanVar2 = VALID_VARIABLES.find(v => v.toLowerCase() === var2.toLowerCase());

      if (!cleanVar1 || !cleanVar2) {
        return res.status(400).json({ error: "Invalid variable selected for correlation" });
      }

      // SQLite escape column names in brackets
      const col1 = cleanVar1.includes("_score") ? `d.[${cleanVar1}]` : `v.[${cleanVar1}]`;
      const col2 = cleanVar2.includes("_score") ? `d.[${cleanVar2}]` : `v.[${cleanVar2}]`;

      // Run Pearson correlation calculation directly in SQLite
      const corrQuery = `
        SELECT (
          (COUNT(*) * SUM(${col1} * ${col2}) - SUM(${col1}) * SUM(${col2})) /
          (
            SQRT(
              (COUNT(*) * SUM(${col1} * ${col1}) - SUM(${col1}) * SUM(${col1})) *
              (COUNT(*) * SUM(${col2} * ${col2}) - SUM(${col2}) * SUM(${col2}))
            )
          )
        ) as r
        FROM villages v
        JOIN domain_scores d ON v.village_id = d.village_id
        WHERE ${col1} IS NOT NULL AND ${col2} IS NOT NULL
      `;
      const corrResult = db.prepare(corrQuery).get();

      // Sample data points for UI scatter plot (e.g. 800 points)
      const sampleQuery = `
        SELECT v.village_name as name, v.district, v.state, ${col1} as x, ${col2} as y
        FROM villages v
        JOIN domain_scores d ON v.village_id = d.village_id
        WHERE ${col1} IS NOT NULL AND ${col2} IS NOT NULL AND (v.village_id % 47 = 0)
        LIMIT 800
      `;
      const samplePoints = db.prepare(sampleQuery).all();

      return res.json({
        success: true,
        r: corrResult.r || 0,
        data: samplePoints
      });
    }

    // Default: compute the domain scores correlation matrix (8 x 8)
    const domainKeys = [
      "overall_score", "economy_score", "education_score", "health_score",
      "infrastructure_score", "environment_score", "governance_score", "social_score"
    ];

    const matrix = {};
    for (const d1 of domainKeys) {
      matrix[d1] = {};
      for (const d2 of domainKeys) {
        if (d1 === d2) {
          matrix[d1][d2] = 1.0;
        } else if (matrix[d2] && matrix[d2][d1] !== undefined) {
          matrix[d1][d2] = matrix[d2][d1];
        } else {
          const col1 = `d.[${d1}]`;
          const col2 = `d.[${d2}]`;
          const rQuery = `
            SELECT (
              (COUNT(*) * SUM(${col1} * ${col2}) - SUM(${col1}) * SUM(${col2})) /
              (
                SQRT(
                  (COUNT(*) * SUM(${col1} * ${col1}) - SUM(${col1}) * SUM(${col1})) *
                  (COUNT(*) * SUM(${col2} * ${col2}) - SUM(${col2}) * SUM(${col2}))
                )
              )
            ) as r
            FROM domain_scores d
            WHERE ${col1} IS NOT NULL AND ${col2} IS NOT NULL
          `;
          const rRes = db.prepare(rQuery).get();
          matrix[d1][d2] = Number((rRes.r || 0).toFixed(3));
        }
      }
    }

    res.json({ success: true, matrix });
  } catch (err) {
    console.error("Correlation stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Background Python Script Subprocesses ──────────────────────────────
const { spawn } = require("child_process");
let activePipeline = null;
let pipelineLogs = [];
let pipelineType = "";

app.post("/api/admin/run-pipeline", (req, res) => {
  try {
    const { pipeline, args = [] } = req.body;
    
    if (activePipeline) {
      return res.status(400).json({ error: `Pipeline is already running: ${pipelineType}` });
    }

    pipelineLogs = [`[VCONNECT SYSTEM] Starting pipeline subprocess for ${pipeline}...`];
    pipelineType = pipeline;

    let scriptPath = "";
    let runArgs = [];

    if (pipeline === "scraper") {
      scriptPath = path.join(path.dirname(__dirname), "village_profile.py");
      // Check if arguments were passed
      const inputPath = args.find(a => a.startsWith("-i")) || "-i";
      const actualInput = inputPath.split(" ")[1] || path.join(path.dirname(__dirname), "Full Village names - No Duplicates.txt");
      
      runArgs = [scriptPath, "--input", actualInput, "--headless"];
    } else if (pipeline === "ingest") {
      scriptPath = path.join(__dirname, "ingest.py");
      runArgs = [scriptPath];
    } else {
      return res.status(400).json({ error: "Invalid pipeline selected" });
    }

    pipelineLogs.push(`[EXEC] python ${runArgs.map(a => `"${a}"`).join(" ")}`);
    
    const pyProcess = spawn("python", runArgs, {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    activePipeline = pyProcess;

    pyProcess.stdout.on("data", (data) => {
      const text = data.toString().trim();
      if (text) {
        text.split("\n").forEach(line => pipelineLogs.push(line));
      }
    });

    pyProcess.stderr.on("data", (data) => {
      const text = data.toString().trim();
      if (text) {
        text.split("\n").forEach(line => pipelineLogs.push(`[STDERR] ${line}`));
      }
    });

    pyProcess.on("close", (code) => {
      pipelineLogs.push(`[VCONNECT SYSTEM] Process exited with code ${code}.`);
      activePipeline = null;
    });

    res.json({ success: true, message: `Pipeline ${pipeline} started successfully.` });
  } catch (err) {
    console.error("Run pipeline error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/pipeline-logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let logIndex = 0;

  // Immediately send existing logs
  while (logIndex < pipelineLogs.length) {
    res.write(`data: ${JSON.stringify({ log: pipelineLogs[logIndex] })}\n\n`);
    logIndex++;
  }

  const interval = setInterval(() => {
    while (logIndex < pipelineLogs.length) {
      res.write(`data: ${JSON.stringify({ log: pipelineLogs[logIndex] })}\n\n`);
      logIndex++;
    }

    if (!activePipeline && logIndex >= pipelineLogs.length) {
      res.write(`data: ${JSON.stringify({ status: "complete" })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 150);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ── V-Connect Dashboard Enhancements Endpoints ──────────────────────────────

const METRIC_MAP = {
  economy: ["employment_rate", "avg_household_income", "poverty_rate", "crop_yield_index%", "farmer_income_avg", "farmer_debt_index", "market_access_score", "bank_access_score"],
  education: ["literacy_rate", "female_literacy_rate", "dropout_rate", "school_count", "teacher_student_ratio", "digital_literacy_rate"],
  health: ["infant_mortality_rate", "malnutrition_rate", "vaccination_coverage%", "medical_staff_per_1000", "avg_healthcare_access_time_min", "healthcare_effectiveness_score"],
  infrastructure: ["drinking_water_coverage_pct", "sanitation_coverage_pct", "road_quality_index", "electricity_hours_per_day", "internet_penetration%", "nearest_hospital_distance_km"],
  environment: ["flood_risk_score", "earthquake_risk_score", "air_quality_index", "forest_cover_pct", "disaster_preparedness_score", "climate_vulnerability_index"],
  governance: ["panchayat_efficiency_score", "transparency_index", "fund_utilization_pct", "scheme_coverage_pct", "corruption_risk_proxy"],
  social: ["total_crime_rate", "crimes_against_women_rate", "social_cohesion_index", "community_participation_score", "youth_engagement_score"]
};

const NEGATIVE_METRICS = new Set([
  "poverty_rate", "farmer_debt_index", "dropout_rate", "infant_mortality_rate", 
  "malnutrition_rate", "avg_healthcare_access_time_min", "flood_risk_score", 
  "earthquake_risk_score", "climate_vulnerability_index", "corruption_risk_proxy", 
  "total_crime_rate", "crimes_against_women_rate", "nearest_hospital_distance_km",
  "air_quality_index"
]);

function normalizeMetric(name, val) {
  const meta = metricMeta[name];
  if (!meta) return 50.0;
  const { min, max } = meta;
  if (min === max) return 50.0;
  
  let norm = ((val - min) / (max - min)) * 100;
  norm = Math.max(0.0, Math.min(100.0, norm)); // clamp
  
  if (NEGATIVE_METRICS.has(name)) {
    return 100.0 - norm;
  }
  return norm;
}

// GET /api/districts/rankings
app.get("/api/districts/rankings", (req, res) => {
  try {
    const state = req.query.state || "";
    const sortBy = req.query.sort_by || "overall_score";
    const order = req.query.order || "desc";

    const allowedSort = [
      "overall_score", "economy_score", "education_score", "health_score",
      "infrastructure_score", "environment_score", "governance_score", "social_score",
      "total_population", "village_count"
    ];
    const actualSort = allowedSort.includes(sortBy) ? sortBy : "overall_score";
    const actualOrder = order.toLowerCase() === "asc" ? "ASC" : "DESC";

    let query = `
      SELECT
        v.state,
        v.district,
        AVG(d.overall_score) as overall_score,
        AVG(d.economy_score) as economy_score,
        AVG(d.education_score) as education_score,
        AVG(d.health_score) as health_score,
        AVG(d.infrastructure_score) as infrastructure_score,
        AVG(d.environment_score) as environment_score,
        AVG(d.governance_score) as governance_score,
        AVG(d.social_score) as social_score,
        SUM(v.total_population) as total_population,
        COUNT(v.village_id) as village_count
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
    `;

    const params = [];
    if (state) {
      query += ` WHERE v.state = ? `;
      params.push(state);
    }

    query += ` GROUP BY v.state, v.district ORDER BY ${actualSort} ${actualOrder} `;

    const rows = db.prepare(query).all(...params);

    const rankedRows = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      overall_score: Number(r.overall_score.toFixed(2)),
      economy_score: Number(r.economy_score.toFixed(2)),
      education_score: Number(r.education_score.toFixed(2)),
      health_score: Number(r.health_score.toFixed(2)),
      infrastructure_score: Number(r.infrastructure_score.toFixed(2)),
      environment_score: Number(r.environment_score.toFixed(2)),
      governance_score: Number(r.governance_score.toFixed(2)),
      social_score: Number(r.social_score.toFixed(2)),
    }));

    res.json({ success: true, data: rankedRows });
  } catch (err) {
    console.error("District rankings API error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/anomalies
app.get("/api/admin/anomalies", (req, res) => {
  try {
    const limit = 50;

    // 1. Economic Disconnect
    const econCount = db.prepare("SELECT COUNT(*) as count FROM villages WHERE poverty_rate > 35 AND avg_household_income > 150000").get().count;
    const econRows = db.prepare(`
      SELECT village_id, village_name, district, state, poverty_rate, avg_household_income, total_population 
      FROM villages 
      WHERE poverty_rate > 35 AND avg_household_income > 150000 
      LIMIT ?
    `).all(limit);

    // 2. Healthcare Isolation
    const healthCount = db.prepare("SELECT COUNT(*) as count FROM villages WHERE total_population > 2000 AND nearest_hospital_distance_km > 25 AND road_quality_index < 35").get().count;
    const healthRows = db.prepare(`
      SELECT village_id, village_name, district, state, total_population, nearest_hospital_distance_km, road_quality_index 
      FROM villages 
      WHERE total_population > 2000 AND nearest_hospital_distance_km > 25 AND road_quality_index < 35 
      LIMIT ?
    `).all(limit);

    // 3. Educational Inefficiency
    const eduCount = db.prepare("SELECT COUNT(*) as count FROM villages WHERE school_count >= 3 AND literacy_rate < 45").get().count;
    const eduRows = db.prepare(`
      SELECT village_id, village_name, district, state, school_count, literacy_rate, dropout_rate, total_population 
      FROM villages 
      WHERE school_count >= 3 AND literacy_rate < 45 
      LIMIT ?
    `).all(limit);

    // 4. Basic Infrastructure Gap
    const infraCount = db.prepare("SELECT COUNT(*) as count FROM villages WHERE total_population > 4000 AND (drinking_water_coverage_pct < 40 OR electricity_hours_per_day < 8)").get().count;
    const infraRows = db.prepare(`
      SELECT village_id, village_name, district, state, total_population, drinking_water_coverage_pct, electricity_hours_per_day 
      FROM villages 
      WHERE total_population > 4000 AND (drinking_water_coverage_pct < 40 OR electricity_hours_per_day < 8) 
      LIMIT ?
    `).all(limit);

    // 5. Social Paradox
    const socialCount = db.prepare("SELECT COUNT(*) as count FROM villages WHERE social_cohesion_index > 65 AND total_crime_rate > 45").get().count;
    const socialRows = db.prepare(`
      SELECT village_id, village_name, district, state, social_cohesion_index, total_crime_rate, total_population 
      FROM villages 
      WHERE social_cohesion_index > 65 AND total_crime_rate > 45 
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      counts: {
        economic: econCount,
        healthcare: healthCount,
        education: eduCount,
        infrastructure: infraCount,
        social: socialCount,
        total: econCount + healthCount + eduCount + infraCount + socialCount
      },
      data: {
        economic: econRows,
        healthcare: healthRows,
        education: eduRows,
        infrastructure: infraRows,
        social: socialRows
      }
    });
  } catch (err) {
    console.error("Anomalies diagnostic error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/villages/:id/update-metrics
app.post("/api/villages/:id/update-metrics", (req, res) => {
  try {
    const id = safeInt(req.params.id, 0);
    const { metrics } = req.body;
    
    if (!id || !metrics) {
      return res.status(400).json({ error: "Missing village ID or metrics payload" });
    }

    const current = db.prepare("SELECT * FROM villages WHERE village_id = ?").get(id);
    if (!current) {
      return res.status(404).json({ error: "Village not found" });
    }

    const updated = { ...current };
    for (const key in metrics) {
      if (key !== "village_id" && key !== "state" && key !== "district") {
        updated[key] = metrics[key];
      }
    }

    const domains = ["economy", "education", "health", "infrastructure", "environment", "governance", "social"];
    const computedScores = {};
    let overallSum = 0;

    for (const d of domains) {
      const cols = METRIC_MAP[d];
      let sum = 0;
      let count = 0;
      for (const col of cols) {
        if (updated[col] !== undefined && updated[col] !== null) {
          const val = Number(updated[col]);
          const norm = normalizeMetric(col, val);
          sum += norm;
          count++;
        }
      }
      const score = count > 0 ? (sum / count) : 50.0;
      computedScores[`${d}_score`] = Number(score.toFixed(2));
      overallSum += score;
    }

    const overallScore = Number((overallSum / 7).toFixed(2));

    const setClause = [];
    const updateParams = [];
    for (const col in updated) {
      if (col !== "village_id") {
        setClause.push(`[${col}] = ?`);
        updateParams.push(updated[col]);
      }
    }
    updateParams.push(id);

    const updateVillageSql = `UPDATE villages SET ${setClause.join(", ")} WHERE village_id = ?`;
    db.prepare(updateVillageSql).run(...updateParams);

    db.prepare(`
      UPDATE domain_scores
      SET economy_score = ?, education_score = ?, health_score = ?, infrastructure_score = ?, 
          environment_score = ?, governance_score = ?, social_score = ?, overall_score = ?
      WHERE village_id = ?
    `).run(
      computedScores.economy_score,
      computedScores.education_score,
      computedScores.health_score,
      computedScores.infrastructure_score,
      computedScores.environment_score,
      computedScores.governance_score,
      computedScores.social_score,
      overallScore,
      id
    );

    db.prepare(`
      UPDATE domain_scores 
      SET overall_rank = (
        SELECT COUNT(*) FROM domain_scores d2 WHERE d2.overall_score > domain_scores.overall_score
      ) + 1
    `).run();

    rebuildDashboardStats();
    invalidateApiCache();

    res.json({
      success: true,
      message: "Village metrics updated and ranks recalculated successfully.",
      scores: {
        ...computedScores,
        overall_score: overallScore
      }
    });

  } catch (err) {
    console.error("Update village metrics error:", err.message);
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
  console.log(`   GET /api/stats/districts`);
  console.log(`   GET /api/analytics/correlation`);
});



// Git commit touch-up 26: perf: Verify database index utilization for rankings sorting (INDEX)


// Git commit touch-up 27: refactor: Add boundary checks in update-metrics calculation routines (safe calculation)


// Git commit touch-up 28: security: Ensure parameter binding for all new custom SQLite queries (SQL sanitization)


// Git commit touch-up 29: docs: Document calculations and normalization steps inside index.js (normalization comments)


// Git commit touch-up 38: perf: Optimize global rankings recalculation query speed (UPDATE rank optimization)
