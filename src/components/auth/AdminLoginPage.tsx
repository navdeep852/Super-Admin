import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminGatewayClient } from '../../services/adminGatewayClient';

type LoginStep = 'credentials' | 'mfa' | 'forgot' | 'reset';

export const AdminLoginPage: React.FC = () => {
  const { login, verifyMfa, isMfaRequired } = useAdminAuth();

  const [email, setEmail] = useState('navdeep@vistaarone.com');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>(isMfaRequired ? 'mfa' : 'credentials');

  // Forgot password & Reset states
  const [forgotEmail, setForgotEmail] = useState('navdeep@vistaarone.com');
  const [stagingRecoveryLink, setStagingRecoveryLink] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Check URL hash on mount for Supabase recovery token (e.g. #access_token=...&type=recovery)
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && (hash.includes('type=recovery') || hash.includes('type=invite') || hash.includes('access_token='))) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const token = params.get('access_token');
        if (token) {
          setRecoveryToken(token);
          setStep('reset');
          setError(null);
          setSuccessMessage('Recovery token verified. Please enter your new password.');
        }
      }
    } catch {
      // Ignore hash parse errors
    }
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Invalid administrator credentials');
      } else if (result.mfaRequired) {
        setStep('mfa');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected authentication error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const result = await verifyMfa(totpCode.trim());
      if (!result.success) {
        setError(result.error || 'Invalid or expired TOTP code');
      }
    } catch (err: any) {
      setError(err.message || 'MFA challenge verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setStagingRecoveryLink(null);
    setLoading(true);

    try {
      const res = await adminGatewayClient.requestPasswordReset(forgotEmail.trim());
      setSuccessMessage(res.message);
      if (res.recoveryLink) {
        setStagingRecoveryLink(res.recoveryLink);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch password recovery request');
    } finally {
      setLoading(false);
    }
  };

  // Reset password strength validation
  const resetHasMinLength = resetNewPassword.length >= 8;
  const resetHasLetter = /[a-zA-Z]/.test(resetNewPassword);
  const resetHasNumberOrSymbol = /[\d\W_]/.test(resetNewPassword);
  const resetPasswordsMatch = resetNewPassword.length > 0 && resetNewPassword === resetConfirmPassword;
  const isResetValid = resetHasMinLength && resetHasLetter && resetHasNumberOrSymbol && resetPasswordsMatch;

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isResetValid) return;

    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await adminGatewayClient.confirmPasswordReset(resetNewPassword, recoveryToken || undefined);
      setSuccessMessage('Password reset successfully. You can now sign in with your new password.');
      setPassword('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setTimeout(() => {
        setStep('credentials');
        // Clear hash from window location to avoid re-triggering
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update administrator password');
    } finally {
      setLoading(false);
    }
  };

  const handleStagingLinkDirect = () => {
    if (!stagingRecoveryLink) return;
    try {
      const parsedUrl = new URL(stagingRecoveryLink);
      const hash = parsedUrl.hash;
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const token = params.get('access_token');
      if (token) {
        setRecoveryToken(token);
        setStep('reset');
        setError(null);
        setSuccessMessage('Recovery token loaded from staging generator. Enter your new password.');
      } else {
        window.location.href = stagingRecoveryLink;
      }
    } catch {
      window.location.href = stagingRecoveryLink;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-8 backdrop-blur-xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            VISTAAR <span className="text-emerald-400 font-mono text-sm px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">ADMIN</span>
          </h1>
          <p className="text-xs text-slate-400 mt-2">
            Authoritative Cloud Administrative Control Plane
          </p>
        </div>

        {/* Air-Gap Environment Badge */}
        <div className="mb-6 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] flex items-center justify-between">
          <span className="text-slate-300 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Environment: <strong className="text-emerald-400 font-mono">staging</strong>
          </span>
          <span className="text-slate-400 font-mono text-[10px]">vlbhxcajphyjkeueubud</span>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-6 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{successMessage}</div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* Step 1: Standard Credentials Login */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Administrator Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vistaarone.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setForgotEmail(email || 'navdeep@vistaarone.com');
                    setStep('forgot');
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  Authenticate
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2: MFA TOTP Code Verification */}
        {step === 'mfa' && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-blue-400" />
                Multi-Factor Authentication Required
              </div>
              Enter the 6-digit TOTP challenge code from your registered authenticator application.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                6-Digit Security Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full text-center tracking-[0.5em] font-mono text-lg py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Token...
                </>
              ) : (
                <>
                  Verify & Enter Control Plane
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(null); }}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Back to email login
            </button>
          </form>
        )}

        {/* Step 3: Forgot Password Request */}
        {step === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                Password Recovery Dispatcher
              </div>
              Enter your registered administrator email to receive secure recovery instructions.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Administrator Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="admin@vistaarone.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !forgotEmail}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Recovery Link...
                </>
              ) : (
                <>
                  Send Recovery Link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {stagingRecoveryLink && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleStagingLinkDirect}
                  className="w-full py-2.5 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  Set New Password Now (Staging Link)
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(null); setSuccessMessage(null); }}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          </form>
        )}

        {/* Step 4: Reset Password (via Recovery Token) */}
        {step === 'reset' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                Establish New Administrator Password
              </div>
              Enter and confirm your new master credentials below.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showResetConfirm ? 'text' : 'password'}
                  required
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(!showResetConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg space-y-1.5 text-[11px]">
              <div className="font-semibold text-slate-400 mb-1">Password Requirements:</div>
              <div className={`flex items-center gap-1.5 ${resetHasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${resetHasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                Minimum 8 characters
              </div>
              <div className={`flex items-center gap-1.5 ${resetHasLetter ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${resetHasLetter ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                Contains letters
              </div>
              <div className={`flex items-center gap-1.5 ${resetHasNumberOrSymbol ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${resetHasNumberOrSymbol ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                Contains numbers or special characters
              </div>
              <div className={`flex items-center gap-1.5 ${resetPasswordsMatch ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${resetPasswordsMatch ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                Passwords match exactly
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isResetValid}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving New Password...
                </>
              ) : (
                <>
                  Update Password & Sign In
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(null); setSuccessMessage(null); }}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Sign In
            </button>
          </form>
        )}

        <div className="mt-8 pt-4 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500">
            Protected by Gateway Cryptographic Assertion Protocol (GCAP). All administrative operations are cryptographically signed and logged.
          </p>
        </div>
      </div>
    </div>
  );
};
