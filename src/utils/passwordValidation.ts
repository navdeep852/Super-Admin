/**
 * Centralized Password Validation Utility
 * Enforces VISTAAR platform credential complexity and match rules.
 */

export interface PasswordValidationResult {
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumberOrSymbol: boolean;
  passwordsMatch: boolean;
  bothNonEmpty: boolean;
  isValid: boolean;
  mismatchMessage: string | null;
}

/**
 * Validates new password and password confirmation against platform security policies.
 *
 * Rules:
 * 1. Minimum 8 characters.
 * 2. Contains at least one letter (uppercase or lowercase).
 * 3. Contains numbers or special characters.
 * 4. Passwords match exactly and both are non-empty.
 * 5. Not currently processing a request.
 */
export function validatePasswordChange(
  newPassword: string,
  confirmPassword: string,
  isLoading: boolean = false
): PasswordValidationResult {
  const pwd = newPassword ?? '';
  const confirm = confirmPassword ?? '';

  const hasMinLength = pwd.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumberOrSymbol = /[\d\W_]/.test(pwd);
  const bothNonEmpty = pwd.length > 0 && confirm.length > 0;
  const passwordsMatch = bothNonEmpty && pwd === confirm;

  const mismatchMessage =
    confirm.length > 0 && pwd !== confirm
      ? 'Passwords do not match'
      : null;

  const isValid =
    hasMinLength &&
    hasLetter &&
    hasNumberOrSymbol &&
    passwordsMatch &&
    bothNonEmpty &&
    !isLoading;

  return {
    hasMinLength,
    hasLetter,
    hasNumberOrSymbol,
    passwordsMatch,
    bothNonEmpty,
    isValid,
    mismatchMessage,
  };
}

