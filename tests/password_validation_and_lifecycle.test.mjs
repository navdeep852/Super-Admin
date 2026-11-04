import assert from 'assert';
import { validatePasswordChange } from '../src/utils/passwordValidation.ts';

console.log('=== TEST SUITE: Password Validation & Button State ===\n');

// 1. Both fields empty
const test1 = validatePasswordChange('', '', false);
assert.strictEqual(test1.isValid, false, 'Test 1 Failed: Both empty must be disabled');
assert.strictEqual(test1.bothNonEmpty, false);
console.log('✔ Case 1: Both fields empty -> Button disabled');

// 2. Password shorter than 8 characters
const test2 = validatePasswordChange('Ab1!', 'Ab1!', false);
assert.strictEqual(test2.hasMinLength, false);
assert.strictEqual(test2.isValid, false, 'Test 2 Failed: Under 8 chars must be disabled');
console.log('✔ Case 2: Password shorter than 8 characters -> Button disabled');

// 3. No letter
const test3 = validatePasswordChange('12345678#', '12345678#', false);
assert.strictEqual(test3.hasLetter, false);
assert.strictEqual(test3.isValid, false, 'Test 3 Failed: No letter must be disabled');
console.log('✔ Case 3: No letter -> Button disabled');

// 4. Only letters
const test4 = validatePasswordChange('Abcdefghij', 'Abcdefghij', false);
assert.strictEqual(test4.hasNumberOrSymbol, false);
assert.strictEqual(test4.isValid, false, 'Test 4 Failed: Only letters must be disabled');
console.log('✔ Case 4: Only letters -> Button disabled');

// 5. Valid password, confirmation empty
const test5 = validatePasswordChange('ValidPass123!', '', false);
assert.strictEqual(test5.hasMinLength, true);
assert.strictEqual(test5.hasLetter, true);
assert.strictEqual(test5.hasNumberOrSymbol, true);
assert.strictEqual(test5.bothNonEmpty, false);
assert.strictEqual(test5.passwordsMatch, false);
assert.strictEqual(test5.isValid, false, 'Test 5 Failed: Empty confirm must be disabled');
console.log('✔ Case 5: Valid password, confirmation empty -> Button disabled');

// 6. Passwords do not match
const test6 = validatePasswordChange('ValidPass123!', 'ValidPass123?', false);
assert.strictEqual(test6.passwordsMatch, false);
assert.strictEqual(test6.mismatchMessage, 'Passwords do not match');
assert.strictEqual(test6.isValid, false, 'Test 6 Failed: Mismatched passwords must be disabled');
console.log('✔ Case 6: Passwords do not match -> Button disabled, mismatch message displayed');

// 7. Valid matching passwords
const test7 = validatePasswordChange('VistaarAdmin2026!#', 'VistaarAdmin2026!#', false);
assert.strictEqual(test7.hasMinLength, true);
assert.strictEqual(test7.hasLetter, true);
assert.strictEqual(test7.hasNumberOrSymbol, true);
assert.strictEqual(test7.passwordsMatch, true);
assert.strictEqual(test7.bothNonEmpty, true);
assert.strictEqual(test7.mismatchMessage, null);
assert.strictEqual(test7.isValid, true, 'Test 7 Failed: Valid matching passwords must be enabled');
console.log('✔ Case 7: Valid matching passwords -> Button enabled');

// 8. Update request processing (loading state)
const test8 = validatePasswordChange('VistaarAdmin2026!#', 'VistaarAdmin2026!#', true);
assert.strictEqual(test8.isValid, false, 'Test 8 Failed: Processing state must disable button');
console.log('✔ Case 8: Update request processing -> Button disabled (loading state)');

// 9. Edge case: whitespace only
const test9 = validatePasswordChange('         ', '         ', false);
assert.strictEqual(test9.hasLetter, false);
assert.strictEqual(test9.isValid, false);
console.log('✔ Case 9: Whitespace only -> Button disabled');

console.log('\n=== INTEGRATION TESTS: Live Gateway BFF & Supabase Auth on Staging ===\n');

async function runIntegrationTests() {
  // 10. Login to staging to acquire authenticated session token
  const loginRes = await fetch('http://localhost:3002/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'navdeep@vistaarone.com', password: 'VistaarAdmin2026!#' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Admin login failed');
  const validToken = loginData.session.access_token;
  console.log('✔ Case 10: Authenticated session acquired for navdeep@vistaarone.com');

  // 11. Test password change with authenticated session (without requiring current password)
  const changeRes = await fetch('http://localhost:3002/api/v1/auth/password/change', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({ new_password: 'VistaarAdmin2026!#' })
  });
  const changeData = await changeRes.json();
  assert.strictEqual(changeRes.status, 200);
  assert.strictEqual(changeData.success, true);
  console.log('✔ Case 11: Supabase confirms success -> Password updated via authenticated session');

  // 12. Test expired / invalid session handling
  const expiredRes = await fetch('http://localhost:3002/api/v1/auth/password/change', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token'
    },
    body: JSON.stringify({ new_password: 'VistaarAdmin2026!#' })
  });
  assert.strictEqual(expiredRes.status, 401);
  const expiredData = await expiredRes.json();
  console.log('✔ Case 12: Session expired / invalid -> Returns 401 error, does not fake success');

  console.log('\n======================================================');
  console.log('ALL 12 TEST CASES PASSED SUCCESSFULLY ON STAGING!');
  console.log('======================================================\n');
}

runIntegrationTests().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
