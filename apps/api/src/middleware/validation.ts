import { FastifyRequest, FastifyReply } from 'fastify';
import { isAddress } from 'viem';
import { env } from '../config.js';

// Allowed markets (can be extended via config)
const ALLOWED_MARKETS = new Set(['ETH-USD', 'BTC-USD', 'SOL-USD']);

// Validation limits
const MAX_SIZE = 1_000_000; // 1M ETH max
const MIN_SIZE = 0.0001; // 0.0001 ETH min
const MAX_PRICE = 1_000_000_000; // 1B USD max
const MIN_PRICE = 0.0001; // 0.0001 USD min
const MAX_LIMIT = 1000; // Max pagination limit
const MAX_OFFSET = 1_000_000; // Max pagination offset

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export function validateMarketId(marketId: string): ValidationError | null {
  if (!marketId || typeof marketId !== 'string') {
    return {
      field: 'marketId',
      message: 'Market ID is required',
      code: 'INVALID_MARKET_ID',
    };
  }

  // Check for SQL injection patterns
  const sqlInjectionPattern = /['";\\]|--|\/\*|\*\/|xp_|sp_|exec|union|select|insert|update|delete|drop|create|alter|script|javascript|onerror|onload/i;
  if (sqlInjectionPattern.test(marketId)) {
    return {
      field: 'marketId',
      message: 'Invalid market ID format',
      code: 'INVALID_MARKET_ID',
    };
  }

  // Check if market is allowed
  if (!ALLOWED_MARKETS.has(marketId)) {
    return {
      field: 'marketId',
      message: `Market ${marketId} is not available`,
      code: 'MARKET_NOT_AVAILABLE',
    };
  }

  return null;
}

export function validateAddress(address: string): ValidationError | null {
  if (!address || typeof address !== 'string') {
    return {
      field: 'address',
      message: 'Address is required',
      code: 'INVALID_ADDRESS',
    };
  }

  if (!isAddress(address)) {
    return {
      field: 'address',
      message: 'Invalid Ethereum address format',
      code: 'INVALID_ADDRESS',
    };
  }

  return null;
}

export function validateNumeric(
  value: any,
  field: string,
  min?: number,
  max?: number,
  allowZero = false
): ValidationError | null {
  if (value === undefined || value === null || value === '') {
    return {
      field,
      message: `${field} is required`,
      code: 'INVALID_NUMERIC',
    };
  }

  const num = typeof value === 'string' ? parseFloat(value) : Number(value);

  if (!Number.isFinite(num)) {
    return {
      field,
      message: `${field} must be a valid number`,
      code: 'INVALID_NUMERIC',
    };
  }

  if (isNaN(num) || !isFinite(num)) {
    return {
      field,
      message: `${field} must be a finite number`,
      code: 'INVALID_NUMERIC',
    };
  }

  if (!allowZero && num === 0) {
    return {
      field,
      message: `${field} must be greater than zero`,
      code: 'INVALID_NUMERIC',
    };
  }

  if (min !== undefined && num < min) {
    return {
      field,
      message: `${field} must be at least ${min}`,
      code: 'INVALID_NUMERIC',
    };
  }

  if (max !== undefined && num > max) {
    return {
      field,
      message: `${field} must be at most ${max}`,
      code: 'INVALID_NUMERIC',
    };
  }

  return null;
}

export function validateSize(size: any): ValidationError | null {
  return validateNumeric(size, 'size', MIN_SIZE, MAX_SIZE, false);
}

export function validatePrice(price: any): ValidationError | null {
  return validateNumeric(price, 'price', MIN_PRICE, MAX_PRICE, false);
}

export function validatePagination(limit?: any, offset?: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (limit !== undefined) {
    const limitError = validateNumeric(limit, 'limit', 1, MAX_LIMIT, false);
    if (limitError) errors.push(limitError);
  }

  if (offset !== undefined) {
    const offsetError = validateNumeric(offset, 'offset', 0, MAX_OFFSET, true);
    if (offsetError) errors.push(offsetError);
  }

  return errors;
}

export function validateString(
  value: any,
  field: string,
  minLength = 1,
  maxLength = 1000
): ValidationError | null {
  if (!value || typeof value !== 'string') {
    return {
      field,
      message: `${field} is required`,
      code: 'INVALID_STRING',
    };
  }

  if (value.length < minLength) {
    return {
      field,
      message: `${field} must be at least ${minLength} characters`,
      code: 'INVALID_STRING',
    };
  }

  if (value.length > maxLength) {
    return {
      field,
      message: `${field} must be at most ${maxLength} characters`,
      code: 'INVALID_STRING',
    };
  }

  // Check for SQL injection patterns
  const sqlInjectionPattern = /['";\\]|--|\/\*|\*\/|xp_|sp_|exec|union|select|insert|update|delete|drop|create|alter|script|javascript|onerror|onload/i;
  if (sqlInjectionPattern.test(value)) {
    return {
      field,
      message: `Invalid characters in ${field}`,
      code: 'INVALID_STRING',
    };
  }

  return null;
}

// Middleware factory for route validation
export function createValidationMiddleware(
  validators: Array<(req: FastifyRequest) => ValidationError | ValidationError[] | null>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: ValidationError[] = [];

    for (const validator of validators) {
      const result = validator(request);
      if (result) {
        if (Array.isArray(result)) {
          errors.push(...result);
        } else {
          errors.push(result);
        }
      }
    }

    if (errors.length > 0) {
      reply.code(400).send({
        ok: false,
        error: 'validation_failed',
        message: 'Validation failed',
        errors,
      });
      return;
    }
  };
}

// Common validators
export const validateMarketIdParam = (req: FastifyRequest) => {
  const { marketId } = req.params as { marketId?: string };
  return validateMarketId(marketId || '');
};

export const validateAddressParam = (req: FastifyRequest) => {
  const { address } = req.params as { address?: string };
  return validateAddress(address || '');
};

export const validateAddressQuery = (req: FastifyRequest) => {
  const { address } = req.query as { address?: string };
  if (!address) return null;
  return validateAddress(address);
};

export const validatePaginationQuery = (req: FastifyRequest) => {
  const { limit, offset } = req.query as { limit?: string; offset?: string };
  return validatePagination(limit, offset);
};

