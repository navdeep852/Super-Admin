import fs from 'fs';

let content = fs.readFileSync('src/context/AdminAuthContext.tsx', 'utf8');

// 1. Update AdminAuthContextType interface
const typeTarget = '  logout: () => void;\r\n}';
const typeTargetLf = '  logout: () => void;\n}';
const typeAddition = `  logout: () => void;
  updateCurrentAdmin: (updates: Partial<AdminUser>) => void;
  refreshCurrentAdmin: () => Promise<void>;
}`;

if (content.includes(typeTarget)) {
  content = content.replace(typeTarget, typeAddition.replace(/\n/g, '\r\n'));
} else if (content.includes(typeTargetLf)) {
  content = content.replace(typeTargetLf, typeAddition);
} else {
  console.error('typeTarget not found');
}

// 2. Add avatarUrl and phoneNumber to me mapping in verifyExistingSession
const meTarget = `            mfaEnabled: me.mfaEnrolled ?? false,
            lastLoginAt: new Date().toISOString(),`;
const meTargetCrlf = meTarget.replace(/\n/g, '\r\n');
const meReplacement = `            mfaEnabled: me.mfaEnrolled ?? false,
            avatarUrl: me.avatarUrl ?? null,
            phoneNumber: me.phoneNumber ?? null,
            lastLoginAt: new Date().toISOString(),`;

if (content.includes(meTargetCrlf)) {
  content = content.replace(meTargetCrlf, meReplacement.replace(/\n/g, '\r\n'));
} else if (content.includes(meTarget)) {
  content = content.replace(meTarget, meReplacement);
} else {
  console.error('meTarget not found');
}

// 3. Add avatarUrl and phoneNumber to login adminData mapping
const loginTarget = `        mfaEnabled: adminData.mfaEnrolled ?? false,
        lastLoginAt: new Date().toISOString(),`;
const loginTargetCrlf = loginTarget.replace(/\n/g, '\r\n');
const loginReplacement = `        mfaEnabled: adminData.mfaEnrolled ?? false,
        avatarUrl: adminData.avatarUrl ?? null,
        phoneNumber: adminData.phoneNumber ?? null,
        lastLoginAt: new Date().toISOString(),`;

if (content.includes(loginTargetCrlf)) {
  content = content.replace(loginTargetCrlf, loginReplacement.replace(/\n/g, '\r\n'));
} else if (content.includes(loginTarget)) {
  content = content.replace(loginTarget, loginReplacement);
} else {
  console.error('loginTarget not found');
}

// 4. Implement updateCurrentAdmin and refreshCurrentAdmin before return
const providerReturnTarget = `  return (
    <AdminAuthContext.Provider`;
const providerReturnTargetCrlf = providerReturnTarget.replace(/\n/g, '\r\n');

const helpersCode = `  const updateCurrentAdmin = (updates: Partial<AdminUser>) => {
    setCurrentAdmin(prev => (prev ? { ...prev, ...updates } : null));
  };

  const refreshCurrentAdmin = async () => {
    try {
      const me = await adminGatewayClient.getMe();
      if (me) {
        setCurrentAdmin({
          id: me.id,
          email: me.email,
          fullName: me.fullName || 'Platform Administrator',
          role: me.role as PlatformRole,
          isActive: me.isActive ?? true,
          mfaEnabled: me.mfaEnrolled ?? false,
          avatarUrl: me.avatarUrl ?? null,
          phoneNumber: me.phoneNumber ?? null,
          lastLoginAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
        setSessionAal(me.sessionAal || 'aal1');
      }
    } catch (err) {
      console.error('Failed to refresh admin profile:', err);
    }
  };

  return (
    <AdminAuthContext.Provider`;

if (content.includes(providerReturnTargetCrlf)) {
  content = content.replace(providerReturnTargetCrlf, helpersCode.replace(/\n/g, '\r\n'));
} else if (content.includes(providerReturnTarget)) {
  content = content.replace(providerReturnTarget, helpersCode);
} else {
  console.error('providerReturnTarget not found');
}

// 5. Add to value prop
const valueTarget = `        login,
        verifyMfa,
        logout,`;
const valueTargetCrlf = valueTarget.replace(/\n/g, '\r\n');
const valueReplacement = `        login,
        verifyMfa,
        logout,
        updateCurrentAdmin,
        refreshCurrentAdmin,`;

if (content.includes(valueTargetCrlf)) {
  content = content.replace(valueTargetCrlf, valueReplacement.replace(/\n/g, '\r\n'));
} else if (content.includes(valueTarget)) {
  content = content.replace(valueTarget, valueReplacement);
} else {
  console.error('valueTarget not found');
}

fs.writeFileSync('src/context/AdminAuthContext.tsx', content, 'utf8');
console.log('Successfully updated AdminAuthContext.tsx');
