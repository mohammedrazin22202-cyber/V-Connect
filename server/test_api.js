const http = require('http');

const API_BASE = 'http://localhost:3001';

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}${path}`;
    const urlObj = new URL(url);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    
    const req = http.request(urlObj, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawData: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== V-Connect API Diagnostic Tests ===\n');
  const results = [];
  let testCount = 0;
  let successCount = 0;

  function assert(condition, message) {
    testCount++;
    if (condition) {
      successCount++;
      console.log(`[PASS] ${message}`);
      results.push({ name: message, status: 'PASS' });
      return true;
    } else {
      console.error(`[FAIL] ${message}`);
      results.push({ name: message, status: 'FAIL' });
      return false;
    }
  }

  try {
    // 1. Test GET /api/stats
    console.log('Testing /api/stats...');
    const statsRes = await request('/api/stats');
    assert(statsRes.status === 200, 'GET /api/stats returns 200');
    assert(statsRes.data && typeof statsRes.data.totalVillages === 'number', 'GET /api/stats returns valid summary stats');
    assert(statsRes.data.avgScores && typeof statsRes.data.avgScores.overall === 'number', 'GET /api/stats has average overall score');

    // 2. Test GET /api/filters
    console.log('\nTesting /api/filters...');
    const filtersRes = await request('/api/filters');
    assert(filtersRes.status === 200, 'GET /api/filters returns 200');
    assert(filtersRes.data && Array.isArray(filtersRes.data.states), 'GET /api/filters returns state array');
    const hasStates = filtersRes.data.states && filtersRes.data.states.length > 0;
    assert(hasStates, 'GET /api/filters has at least one state');
    
    let firstState = '';
    if (hasStates) {
      firstState = filtersRes.data.states[0];
      const stateFiltersRes = await request(`/api/filters?state=${encodeURIComponent(firstState)}`);
      assert(stateFiltersRes.status === 200, `GET /api/filters?state=${firstState} returns 200`);
      assert(stateFiltersRes.data && Array.isArray(stateFiltersRes.data.districts), 'returns districts for the state');
    }

    // 3. Test GET /api/rankings
    console.log('\nTesting /api/rankings...');
    const rankingsRes = await request('/api/rankings?page=1&limit=5');
    assert(rankingsRes.status === 200, 'GET /api/rankings returns 200');
    assert(rankingsRes.data && Array.isArray(rankingsRes.data.data), 'rankings response contains data array');
    assert(rankingsRes.data.data.length > 0, 'rankings response has records');
    assert(rankingsRes.data.pagination && typeof rankingsRes.data.pagination.total === 'number', 'rankings response contains pagination');

    let testVillage = null;
    if (rankingsRes.data && rankingsRes.data.data && rankingsRes.data.data.length > 0) {
      testVillage = rankingsRes.data.data[0];
      console.log(`Using test village: ID=${testVillage.village_id}, Name=${testVillage.village_name}, State=${testVillage.state}`);
    }

    // Check query params in rankings
    if (testVillage) {
      const filteredRankRes = await request(`/api/rankings?state=${encodeURIComponent(testVillage.state)}&page=1&limit=5`);
      assert(filteredRankRes.status === 200, 'GET /api/rankings with state filter returns 200');
      assert(filteredRankRes.data.data.every(v => v.state === testVillage.state), 'all returned records match state filter');
    }

    // 4. Test GET /api/villages/:id
    console.log('\nTesting /api/villages/:id...');
    if (testVillage) {
      const villageRes = await request(`/api/villages/${testVillage.village_id}`);
      assert(villageRes.status === 200, `GET /api/villages/${testVillage.village_id} returns 200`);
      assert(villageRes.data && villageRes.data.village, 'response contains village object');
      assert(villageRes.data.village.village_id === testVillage.village_id, 'returned village ID matches requested ID');
      assert(villageRes.data.metrics && typeof villageRes.data.metrics.Economy === 'object', 'response contains grouped metrics');
    } else {
      console.log('[SKIP] No test village for detail API test');
    }

    // 5. Test GET /api/villages/:id/history
    console.log('\nTesting /api/villages/:id/history...');
    if (testVillage) {
      const historyRes = await request(`/api/villages/${testVillage.village_id}/history`);
      assert(historyRes.status === 200, `GET /api/villages/${testVillage.village_id}/history returns 200`);
      assert(historyRes.data && Array.isArray(historyRes.data.history), 'returns history array');
      assert(historyRes.data.history.length > 0, 'history has at least one record (the anchor)');
    }

    // 6. Test POST /api/villages/:id/recommendations
    console.log('\nTesting POST /api/villages/:id/recommendations...');
    if (testVillage) {
      const recRes = await request(`/api/villages/${testVillage.village_id}/recommendations`, { method: 'POST' });
      assert(recRes.status === 200, 'POST /api/villages/:id/recommendations returns 200');
      assert(recRes.data && recRes.data.success === true, 'returns success status');
      assert(recRes.data.recommendations && typeof recRes.data.recommendations === 'string', 'returns recommendation text');
    }

    // 7. Test GET /api/villages/amenities-status
    console.log('\nTesting /api/villages/amenities-status...');
    const amenitiesRes = await request('/api/villages/amenities-status?page=1&limit=5');
    assert(amenitiesRes.status === 200, 'GET /api/villages/amenities-status returns 200');
    assert(amenitiesRes.data && Array.isArray(amenitiesRes.data.data), 'returns data array');
    assert(amenitiesRes.data.aggregates && typeof amenitiesRes.data.aggregates.total_count === 'number', 'returns aggregates object');

    // 8. Test GET /api/admin/data-quality
    console.log('\nTesting /api/admin/data-quality...');
    const dqRes = await request('/api/admin/data-quality');
    assert(dqRes.status === 200, 'GET /api/admin/data-quality returns 200');
    assert(dqRes.data && dqRes.data.success === true, 'data quality report success');
    assert(dqRes.data.stats && typeof dqRes.data.stats.healthScore === 'number', 'health score computed');

    // 9. Test GET /api/simulate-rank
    console.log('\nTesting /api/simulate-rank...');
    const simRes = await request('/api/simulate-rank?score=72.5');
    assert(simRes.status === 200, 'GET /api/simulate-rank returns 200');
    assert(simRes.data && typeof simRes.data.rank === 'number', 'returns a numeric rank estimate');

    // 10. Test GET /api/compare/states
    console.log('\nTesting /api/compare/states...');
    const compareRes = await request('/api/compare/states');
    assert(compareRes.status === 200, 'GET /api/compare/states returns 200');
    assert(compareRes.data && Array.isArray(compareRes.data.data), 'returns states comparison array');

    // 11. Test GET /api/simulation/region
    console.log('\nTesting /api/simulation/region...');
    if (testVillage) {
      const regRes = await request(`/api/simulation/region?state=${encodeURIComponent(testVillage.state)}&district=${encodeURIComponent(testVillage.district)}&budget=1000000&strategy=balanced`);
      assert(regRes.status === 200, 'GET /api/simulation/region returns 200');
      assert(regRes.data && regRes.data.success === true, 'simulation execution success');
      assert(regRes.data.summary && typeof regRes.data.summary.baselineAvgScore === 'number', 'contains summary baseline and simulated scores');
    }

    // 12. Test GET /api/admin/stats
    console.log('\nTesting /api/admin/stats...');
    const adminStatsRes = await request('/api/admin/stats');
    assert(adminStatsRes.status === 200, 'GET /api/admin/stats returns 200');
    assert(adminStatsRes.data && typeof adminStatsRes.data.villageCount === 'number', 'returns DB stats');

    // 13. Test GET /api/stats/districts
    console.log('\nTesting /api/stats/districts...');
    const distAggRes = await request('/api/stats/districts');
    assert(distAggRes.status === 200, 'GET /api/stats/districts returns 200');
    assert(distAggRes.data && Array.isArray(distAggRes.data.data), 'returns districts aggregate array');

    // 14. Test GET /api/analytics/correlation
    console.log('\nTesting /api/analytics/correlation...');
    const corrMatrixRes = await request('/api/analytics/correlation');
    assert(corrMatrixRes.status === 200, 'GET /api/analytics/correlation returns 200');
    assert(corrMatrixRes.data && typeof corrMatrixRes.data.matrix === 'object', 'returns correlation matrix object');

    const corrVarRes = await request('/api/analytics/correlation?var1=poverty_rate&var2=avg_household_income');
    assert(corrVarRes.status === 200, 'GET /api/analytics/correlation with vars returns 200');
    assert(corrVarRes.data && typeof corrVarRes.data.r === 'number', 'returns Pearson correlation coefficient');

    // 15. Test GET /api/districts/rankings
    console.log('\nTesting /api/districts/rankings...');
    const distRankRes = await request('/api/districts/rankings');
    assert(distRankRes.status === 200, 'GET /api/districts/rankings returns 200');
    assert(distRankRes.data && Array.isArray(distRankRes.data.data), 'returns districts rankings array');

    // 16. Test GET /api/admin/anomalies
    console.log('\nTesting /api/admin/anomalies...');
    const anomalyRes = await request('/api/admin/anomalies');
    assert(anomalyRes.status === 200, 'GET /api/admin/anomalies returns 200');
    assert(anomalyRes.data && typeof anomalyRes.data.counts === 'object', 'returns anomaly categories and counts');

    // 17. Test POST /api/villages/:id/update-metrics
    console.log('\nTesting POST /api/villages/:id/update-metrics...');
    if (testVillage) {
      // First get the village details so we can keep the metrics
      const villageDetails = await request(`/api/villages/${testVillage.village_id}`);
      const rawVillage = villageDetails.data.village;
      // We will perform a round-trip update of households count or similar, or just write back some metrics
      const origWater = rawVillage.drinking_water_coverage_pct || 90;
      const targetWater = origWater >= 95 ? 90.0 : 95.0;
      
      const updateRes = await request(`/api/villages/${testVillage.village_id}/update-metrics`, {
        method: 'POST',
        body: {
          metrics: {
            drinking_water_coverage_pct: targetWater
          }
        }
      });
      
      assert(updateRes.status === 200, 'POST /api/villages/:id/update-metrics returns 200');
      assert(updateRes.data && updateRes.data.success === true, 'reports successful metrics update');
      
      // Verify in DB that it updated
      const verifyRes = await request(`/api/villages/${testVillage.village_id}`);
      const waterMetric = verifyRes.data.metrics.Infrastructure.find(m => m.name === 'drinking_water_coverage_pct');
      assert(waterMetric && waterMetric.value === targetWater, 'metric value was successfully updated in DB');

      // Revert back
      await request(`/api/villages/${testVillage.village_id}/update-metrics`, {
        method: 'POST',
        body: {
          metrics: {
            drinking_water_coverage_pct: origWater
          }
        }
      });
    }

    console.log(`\n=== Diagnostics Summary: Passed ${successCount}/${testCount} tests ===`);

  } catch (err) {
    console.error('\n[FATAL ERROR] Diagnostic tests script encountered an error:', err);
  }
}

runTests();
