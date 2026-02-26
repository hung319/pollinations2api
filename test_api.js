// Simple test script to verify API endpoints
const BASE_URL = 'http://localhost:3000';

async function testEndpoint(endpoint, method = 'GET', data = null) {
  try {
    console.log(`Testing ${method} ${endpoint}...`);
    
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const result = await response.json();
    
    console.log(`${endpoint} - Status: ${response.status}`);
    console.log(`${endpoint} - Result:`, JSON.stringify(result, null, 2));
    console.log('---');
    
    return { status: response.status, result };
  } catch (error) {
    console.error(`${endpoint} - Error:`, error.message);
    console.log('---');
    return { error: error.message };
  }
}

async function runTests() {
  console.log('Starting API tests...\n');
  
  // Test /v1/models endpoint
  await testEndpoint('/v1/models', 'GET');
  
  // Test basic response
  const response = await fetch(BASE_URL);
  console.log('Root endpoint - Status:', response.status);
  const text = await response.text();
  console.log('Root endpoint - Body:', text);
  console.log('---');
  
  console.log('API tests completed.');
}

// Run the tests
runTests().catch(console.error);