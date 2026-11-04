import http from 'http';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3002${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing /api/v1/health...');
  const h = await get('/api/v1/health');
  console.log('Health:', h.status, h.data.status);

  console.log('\nTesting /api/v1/platform/overview...');
  const o = await get('/api/v1/platform/overview');
  console.log('Overview:', o.status, o.data.success, 'Metrics:', o.data.data?.metrics);

  console.log('\nTesting /api/v1/workspaces...');
  const w = await get('/api/v1/workspaces');
  console.log('Workspaces:', w.status, w.data.success, 'Count:', w.data.data?.pagination?.total);

  console.log('\nTesting /api/v1/platform/health...');
  const ph = await get('/api/v1/platform/health');
  console.log('Platform Health:', ph.status, ph.data.status, ph.data.services);
}

run().catch(console.error);

