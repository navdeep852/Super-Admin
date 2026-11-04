import http from 'http';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3002${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Testing Gateway endpoints...');
  
  const health = await get('/api/v1/platform/health');
  console.log('Health:', health.status, health.body.status);

  const overview = await get('/api/v1/platform/overview');
  console.log('Overview metrics:', overview.body.data?.metrics);
  console.log('Overview charts:', Object.keys(overview.body.data?.charts || {}));

  const workspaces = await get('/api/v1/workspaces?page=1&limit=5');
  console.log('Workspaces pagination:', workspaces.body.data?.pagination);
  console.log('First 2 workspaces:');
  (workspaces.body.data?.businesses || []).slice(0, 2).forEach(b => {
    console.log(`  - ${b.legalName} (${b.status}, Plan: ${b.planName}, Staff: ${b.activeStaffCount}, GMV: ₹${b.monthlyGmvInr})`);
  });

  if (workspaces.body.data?.businesses?.length > 0) {
    const wsId = workspaces.body.data.businesses[0].id;
    const detail = await get(`/api/v1/workspaces/${wsId}`);
    console.log(`Detail for ${wsId}:`);
    console.log('  Employees:', detail.body.data?.employees?.length);
    console.log('  Recent Invoices:', detail.body.data?.recentInvoices?.length);
    console.log('  Metrics:', detail.body.data?.metrics);
  }
}

main().catch(console.error);

