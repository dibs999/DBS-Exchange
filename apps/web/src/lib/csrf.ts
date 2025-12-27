// CSRF Protection Utilities

let csrfToken: string | null = null;

/**
 * Generate a CSRF token (simple implementation)
 * In production, this should be generated server-side and stored in httpOnly cookie
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or generate CSRF token
 */
export function getCsrfToken(): string {
  if (!csrfToken) {
    // Try to get from sessionStorage first
    const stored = sessionStorage.getItem('csrf_token');
    if (stored) {
      csrfToken = stored;
    } else {
      csrfToken = generateCsrfToken();
      sessionStorage.setItem('csrf_token', csrfToken);
    }
  }
  return csrfToken;
}

/**
 * Validate CSRF token (for future server-side validation)
 */
export function validateCsrfToken(token: string): boolean {
  const stored = sessionStorage.getItem('csrf_token');
  return stored === token;
}

/**
 * Clear CSRF token
 */
export function clearCsrfToken(): void {
  csrfToken = null;
  sessionStorage.removeItem('csrf_token');
}

