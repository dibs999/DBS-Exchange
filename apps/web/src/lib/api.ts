export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') as string;

export function getWsUrl() {
  if (API_URL.startsWith('https://')) return API_URL.replace('https://', 'wss://') + '/ws';
  if (API_URL.startsWith('http://')) return API_URL.replace('http://', 'ws://') + '/ws';
  return `ws://${API_URL.replace(/^ws:\/\//, '')}/ws`;
}
