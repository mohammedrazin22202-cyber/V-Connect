/**
 * VCONNECT Village Ranking System — Express API Server
 *
 * Serves village ranking data from SQLite over a RESTful API.
 * Endpoints: /api/rankings, /api/villages/:id, /api/stats, /api/filters
 */

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

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
  db.pragma("cache_size = -64000"); // 64MB cache
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
    const scoreCols = [
      "overall_score", "economy_score", "education_score", "health_score",
      "infrastructure_score", "environment_score", "governance_score",
      "social_score", "overall_rank",
    ];
    const sortCol = scoreCols.includes(sortBy) ? `d.${sortBy}` : `v.${sortBy}`;

    // Count
    const countSQL = `SELECT COUNT(*) as total FROM villages v JOIN domain_scores d ON v.village_id = d.village_id ${whereClause}`;
    const { total } = db.prepare(countSQL).get(...params);

    // Data
    const dataSQL = `
      SELECT
        v.village_id, v.village_name, v.district, v.state,
        v.total_population, v.priority_level, v.emergency_flag,
        v.intervention_category, v.village_urgency_score,
        d.economy_score, d.education_score, d.health_score,
        d.infrastructure_score, d.environment_score,
        d.governance_score, d.social_score,
        d.overall_score, d.overall_rank
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      ${whereClause}
      ORDER BY ${sortCol} ${order}
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSQL).all(...params, limit, offset);

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
// Full village detail with all metrics
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

    // Get raw metrics
    const metrics = db.prepare(`
      SELECT category, metric_name, metric_value
      FROM village_metrics
      WHERE village_id = ?
      ORDER BY category, metric_name
    `).all(id);

    // Group metrics by category
    const metricsByCategory = {};
    for (const m of metrics) {
      if (!metricsByCategory[m.category]) {
        metricsByCategory[m.category] = [];
      }
      metricsByCategory[m.category].push({
        name: m.metric_name,
        value: m.metric_value,
      });
    }

    res.json({ village, metrics: metricsByCategory });
  } catch (err) {
    console.error("Village detail error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats ─────────────────────────────────────────────────────
// Aggregate statistics for dashboard
app.get("/api/stats", (req, res) => {
  try {
    const totalVillages = db.prepare("SELECT COUNT(*) as count FROM villages").get().count;

    const totalStates = db.prepare("SELECT COUNT(DISTINCT state) as count FROM villages").get().count;

    const totalDistricts = db.prepare("SELECT COUNT(DISTINCT district) as count FROM villages").get().count;

    const priorityBreakdown = db.prepare(`
      SELECT priority_level, COUNT(*) as count
      FROM villages
      GROUP BY priority_level
      ORDER BY count DESC
    `).all();

    const avgScores = db.prepare(`
      SELECT
        ROUND(AVG(economy_score), 2) as economy,
        ROUND(AVG(education_score), 2) as education,
        ROUND(AVG(health_score), 2) as health,
        ROUND(AVG(infrastructure_score), 2) as infrastructure,
        ROUND(AVG(environment_score), 2) as environment,
        ROUND(AVG(governance_score), 2) as governance,
        ROUND(AVG(social_score), 2) as social,
        ROUND(AVG(overall_score), 2) as overall
      FROM domain_scores
    `).get();

    // Top 10 states by avg overall score
    const topStates = db.prepare(`
      SELECT v.state, ROUND(AVG(d.overall_score), 2) as avg_score,
             COUNT(*) as village_count
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      GROUP BY v.state
      ORDER BY avg_score DESC
      LIMIT 10
    `).all();

    // Bottom 10 states
    const bottomStates = db.prepare(`
      SELECT v.state, ROUND(AVG(d.overall_score), 2) as avg_score,
             COUNT(*) as village_count
      FROM villages v
      JOIN domain_scores d ON v.village_id = d.village_id
      GROUP BY v.state
      ORDER BY avg_score ASC
      LIMIT 10
    `).all();

    res.json({
      totalVillages,
      totalStates,
      totalDistricts,
      priorityBreakdown,
      avgScores,
      topStates,
      bottomStates,
    });
  } catch (err) {
    console.error("Stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/filters ───────────────────────────────────────────────────
// Available filter options
app.get("/api/filters", (req, res) => {
  try {
    const states = db.prepare(
      "SELECT DISTINCT state FROM villages WHERE state IS NOT NULL ORDER BY state"
    ).all().map(r => r.state);

    // If state is provided, return districts for that state
    let districts = [];
    if (req.query.state) {
      districts = db.prepare(
        "SELECT DISTINCT district FROM villages WHERE state = ? AND district IS NOT NULL ORDER BY district"
      ).all(req.query.state).map(r => r.district);
    }

    const priorities = db.prepare(
      "SELECT DISTINCT priority_level FROM villages WHERE priority_level IS NOT NULL ORDER BY priority_level"
    ).all().map(r => r.priority_level);

    res.json({ states, districts, priorities });
  } catch (err) {
    console.error("Filters error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/compare/states ────────────────────────────────────────────
// Compare states by domain scores
app.get("/api/compare/states", (req, res) => {
  try {
    const stateList = req.query.states ? req.query.states.split(",") : [];

    let query;
    let params = [];

    if (stateList.length > 0) {
      const placeholders = stateList.map(() => "?").join(",");
      query = `
        SELECT v.state,
          ROUND(AVG(d.economy_score), 2) as economy_score,
          ROUND(AVG(d.education_score), 2) as education_score,
          ROUND(AVG(d.health_score), 2) as health_score,
          ROUND(AVG(d.infrastructure_score), 2) as infrastructure_score,
          ROUND(AVG(d.environment_score), 2) as environment_score,
          ROUND(AVG(d.governance_score), 2) as governance_score,
          ROUND(AVG(d.social_score), 2) as social_score,
          ROUND(AVG(d.overall_score), 2) as overall_score,
          COUNT(*) as village_count
        FROM villages v
        JOIN domain_scores d ON v.village_id = d.village_id
        WHERE v.state IN (${placeholders})
        GROUP BY v.state
        ORDER BY overall_score DESC
      `;
      params = stateList;
    } else {
      query = `
        SELECT v.state,
          ROUND(AVG(d.economy_score), 2) as economy_score,
          ROUND(AVG(d.education_score), 2) as education_score,
          ROUND(AVG(d.health_score), 2) as health_score,
          ROUND(AVG(d.infrastructure_score), 2) as infrastructure_score,
          ROUND(AVG(d.environment_score), 2) as environment_score,
          ROUND(AVG(d.governance_score), 2) as governance_score,
          ROUND(AVG(d.social_score), 2) as social_score,
          ROUND(AVG(d.overall_score), 2) as overall_score,
          COUNT(*) as village_count
        FROM villages v
        JOIN domain_scores d ON v.village_id = d.village_id
        GROUP BY v.state
        ORDER BY overall_score DESC
      `;
    }

    const data = db.prepare(query).all(...params);
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
