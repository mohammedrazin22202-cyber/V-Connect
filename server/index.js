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
  console.log("✓ Connected to SQLite database (read-write)");
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
    const colsToFetch = ["village_id", "avg_household_income", "poverty_rate", "dropout_rate", "digital_literacy_rate", "malnutrition_rate", "avg_healthcare_access_time_min", "drinking_water_coverage_pct", "sanitation_coverage_pct", "electricity_hours_per_day", "[internet_penetration%]"];
    const rawData = db.prepare(`SELECT ${colsToFetch.map(c => `v.${c}`).join(", ")} FROM villages v WHERE v.state = ? AND v.district = ?`).all(state, district);
    
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
      const isNegative = ["poverty_rate", "dropout_rate", "malnutrition_rate", "avg_healthcare_access_time_min"].includes(col);
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
        const dbCol = cfg.col === "internet_penetration%" ? "internet_penetration%" : cfg.col;
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

      // Recompute domain scores and overall score
      const simScores = {
        economy: v.economy_score,
        education: v.education_score,
        health: v.health_score,
        infrastructure: v.infrastructure_score,
        environment: v.environment_score,
        governance: v.governance_score,
        social: v.social_score
      };

      // Recalculate only the optimized domains
      Object.entries(METRIC_MAP_SIM).forEach(([domain, cols]) => {
        if (cols.length > 0) {
          let sum = 0;
          cols.forEach(col => {
            sum += getNormalizedValue(col, simMetrics[col]);
          });
          simScores[domain] = sum / cols.length;
        }
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

    res.json({ success: true, message: `Village ${village_id} updated successfully.` });
  } catch (err) {
    console.error("Admin update budget error:", err.message);
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

