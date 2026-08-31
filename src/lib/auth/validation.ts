/**
 * Login form validation. Pure predicates, no React and no provider. When
 * real auth arrives, these rules are still the client-side gate that runs
 * before the network call.
 */

export type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

/** Deliberately permissive: local@domain.tld, no exotic RFC 5322 cases. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL_RE.test(trimmed)) return "That doesn't look like a valid email.";
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return "Enter your password.";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export function validateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your name.";
  if (trimmed.length < 2) return "That name looks too short.";
  return undefined;
}

/**
 * Rough password strength for the sign-up meter. Scores length first,
 * then variety, capped at 4. Presentation only: it never blocks a submit,
 * `validatePassword` does that.
 */
export function passwordStrength(value: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) || /[^\w\s]/.test(value)) score += 1;
  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score: capped, label: labels[capped] };
}

export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function validateSignUp(
  name: string,
  email: string,
  password: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
