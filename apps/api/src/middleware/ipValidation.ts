import { FastifyRequest } from 'fastify';

// Trusted proxy IPs (configure via TRUSTED_PROXIES env var)
const TRUSTED_PROXIES = new Set<string>(
  (process.env.TRUSTED_PROXIES || '').split(',').filter(Boolean).map((ip) => ip.trim())
);

// Keeper IP whitelist
const KEEPER_IPS = new Set<string>(
  (process.env.KEEPER_IPS || '').split(',').filter(Boolean).map((ip) => ip.trim())
);

/**
 * Get client IP with proxy validation
 * Validates X-Forwarded-For header against trusted proxies
 */
export function getValidatedClientIp(request: FastifyRequest): string {
  const xForwardedFor = request.headers['x-forwarded-for'];
  const directIp = request.ip || request.socket?.remoteAddress || 'unknown';

  // If no proxy header, return direct IP
  if (!xForwardedFor || typeof xForwardedFor !== 'string') {
    return directIp;
  }

  // Parse X-Forwarded-For (can contain multiple IPs: client, proxy1, proxy2)
  const ips = xForwardedFor.split(',').map((ip) => ip.trim());

  // If we have trusted proxies configured, validate the chain
  if (TRUSTED_PROXIES.size > 0) {
    // Last IP in chain should be from trusted proxy
    const lastProxy = ips[ips.length - 1];
    if (TRUSTED_PROXIES.has(lastProxy) || TRUSTED_PROXIES.has(directIp)) {
      // Return first IP (original client)
      return ips[0] || directIp;
    }
    // If proxy not trusted, return direct IP (more secure)
    return directIp;
  }

  // No trusted proxies configured, return first IP from X-Forwarded-For
  // (less secure, but common in development)
  return ips[0] || directIp;
}

/**
 * Check if IP is in keeper whitelist
 */
export function isKeeperIp(ip: string): boolean {
  return KEEPER_IPS.has(ip);
}

/**
 * Validate IP format (basic check)
 */
export function isValidIp(ip: string): boolean {
  if (ip === 'unknown') return false;
  
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

