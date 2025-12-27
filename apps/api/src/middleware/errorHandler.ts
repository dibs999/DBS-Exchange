import { FastifyRequest, FastifyReply } from 'fastify';

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

interface ErrorResponse {
  ok: false;
  error: string;
  message: string;
  details?: any;
}

// Sensitive data patterns that should be redacted
const SENSITIVE_PATTERNS = [
  /private[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /bearer/i,
];

function isSensitiveField(key: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeError(error: any): any {
  if (!error || typeof error !== 'object') {
    return 'An error occurred';
  }

  // Don't expose stack traces in production
  if (!isDevelopment && error.stack) {
    delete error.stack;
  }

  // Redact sensitive fields
  const sanitized: any = {};
  for (const [key, value] of Object.entries(error)) {
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeError(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = (error as any).statusCode || 500;
  const errorCode = (error as any).code || 'INTERNAL_ERROR';

  // Log error with full details (server-side only)
  request.log.error({
    err: error,
    url: request.url,
    method: request.method,
    ip: request.ip,
  }, 'Request error');

  // Prepare response
  const response: ErrorResponse = {
    ok: false,
    error: errorCode,
    message: isDevelopment ? error.message : 'An internal error occurred',
  };

  // Add details only in development
  if (isDevelopment) {
    response.details = sanitizeError(error);
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && !isDevelopment) {
    response.message = 'An internal server error occurred. Please try again later.';
  }

  reply.code(statusCode).send(response);
}

// Custom error classes
export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  errors?: any[];

  constructor(message: string, errors?: any[]) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

