// Comprehensive test script for Pollinations API endpoints
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
    console.log(`${endpoint} - Result keys:`, Object.keys(result));
    if (result.error) {
      console.log(`${endpoint} - Error:`, result.error);
    }
    console.log('---');
    
    return { status: response.status, result };
  } catch (error) {
    console.error(`${endpoint} - Error:`, error.message);
    console.log('---');
    return { error: error.message };
  }
}

async function runComprehensiveTests() {
  console.log('Starting comprehensive API tests...\n');
  
  // Test /v1/models endpoint
  console.log('1. Testing /v1/models (GET)...');
  await testEndpoint('/v1/models', 'GET');
  
  // Test that the server recognizes different routes
  console.log('2. Testing non-existent endpoint (should show basic response)...');
  await testEndpoint('/v1/nonexistent', 'GET');
  
  // Test basic response
  console.log('3. Testing root endpoint...');
  const response = await fetch(BASE_URL);
  console.log('Root endpoint - Status:', response.status);
  const text = await response.text();
  console.log('Root endpoint - Body:', text);
  console.log('---');
  
  // Test that account routes would be handled (without actual API key)
  console.log('4. Testing account endpoint structure...');
  await testEndpoint('/v1/account/profile', 'GET');
  
  console.log('Comprehensive API tests completed.');
}

// Run the tests
runComprehensiveTests().catch(console.error);