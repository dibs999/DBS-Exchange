import { useMemo } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits, stringToHex } from 'viem';
import { ENGINE_ABI, ENGINE_ADDRESS, ENGINE_READY } from '../contracts';
import { Position } from '@dbs/shared';

/**
 * Calculate the liquidation price for a position
 * 
 * Uses the contract's _isLiquidatable logic:
 * equity = margin + pnl
 * liquidatable when: equity * BPS < notional * maintenanceMarginBps
 * 
 * Solving for price:
 * For long: liquidationPrice = entryPrice * (1 - (margin / notional) * (BPS / maintenanceMarginBps))
 * For short: liquidationPrice = entryPrice * (1 + (margin / notional) * (BPS / maintenanceMarginBps))
 */
export function useLiquidationPrice(
  position: Position | null,
  marketPrice: number
): { price: number | null; distance: number | null; warning: 'none' | 'yellow' | 'orange' | 'red' } {
  const publicClient = usePublicClient();

  return useMemo(() => {
    if (!position || !marketPrice || !ENGINE_READY) {
      return { price: null, distance: null, warning: 'none' };
    }

    // Calculate liquidation price based on maintenance margin
    // This is a simplified calculation - the contract uses exact values
    const notional = position.size * position.entryPrice;
    const marginRatio = position.margin / notional;
    
    // Maintenance margin is typically 50% of initial margin (10% initial = 5% maintenance)
    // For this calculation, we'll use a conservative estimate
    // In production, this should be read from the contract's market config
    const maintenanceMarginBps = 500; // 5% = 500 bps (conservative estimate)
    const BPS = 10000;

    let liquidationPrice: number;

    if (position.side === 'long') {
      // For long: price drops, liquidation when equity < maintenance margin
      // liquidationPrice = entryPrice * (1 - marginRatio * (BPS / maintenanceMarginBps))
      liquidationPrice = position.entryPrice * (1 - marginRatio * (BPS / maintenanceMarginBps));
    } else {
      // For short: price rises, liquidation when equity < maintenance margin
      // liquidationPrice = entryPrice * (1 + marginRatio * (BPS / maintenanceMarginBps))
      liquidationPrice = position.entryPrice * (1 + marginRatio * (BPS / maintenanceMarginBps));
    }

    // Calculate distance to liquidation
    let distance: number;
    if (position.side === 'long') {
      distance = ((marketPrice - liquidationPrice) / marketPrice) * 100;
    } else {
      distance = ((liquidationPrice - marketPrice) / marketPrice) * 100;
    }

    // Determine warning level
    let warning: 'none' | 'yellow' | 'orange' | 'red' = 'none';
    if (distance < 2) {
      warning = 'red';
    } else if (distance < 5) {
      warning = 'orange';
    } else if (distance < 10) {
      warning = 'yellow';
    }

    return {
      price: liquidationPrice,
      distance,
      warning,
    };
  }, [position, marketPrice]);
}

