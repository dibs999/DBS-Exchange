import { getCsrfToken } from './csrf.js';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') as string;

export function getWsUrl() {
  if (API_URL.startsWith('https://')) return API_URL.replace('https://', 'wss://') + '/ws';
  if (API_URL.startsWith('http://')) return API_URL.replace('http://', 'ws://') + '/ws';
  return `ws://${API_URL.replace(/^ws:\/\//, '')}/ws`;
}

/**
 * Make a secure API request with CSRF protection
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const csrfToken = getCsrfToken();
  
  // Add CSRF token to headers for state-changing requests
  if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method.toUpperCase())) {
    const headers = new Headers(options.headers);
    headers.set('X-CSRF-Token', csrfToken);
    headers.set('X-Requested-With', 'XMLHttpRequest'); // Additional CSRF protection
    options.headers = headers;
  }
  
  // Validate Origin header (browser adds this automatically)
  const origin = window.location.origin;
  if (!options.headers) {
    options.headers = new Headers();
  }
  if (options.headers instanceof Headers) {
    options.headers.set('Origin', origin);
  }
  
  return fetch(url, {
    ...options,
    credentials: 'same-origin', // Send cookies for same-origin requests
  });
}
