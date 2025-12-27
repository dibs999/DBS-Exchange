import { createPublicClient, formatUnits, http } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from './config.js';
import { getPool } from './db/index.js';

const USDC_DECIMALS = 6;
const SHARES_DECIMALS = 18;

const VAULT_ABI = [
  {
    type: 'function',
    name: 'totalAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function getClient() {
  const chain = env.chainId === 8453 ? base : sepolia;
  return createPublicClient({
    chain,
    transport: http(env.baseRpcUrl || env.rpcUrl),
  });
}

async function getOnChainVaultTotals() {
  if (!env.vaultAddress) {
    return { totalAssetsRaw: 0n, totalSupplyRaw: 0n };
  }

  const client = getClient();
  const [totalAssetsRaw, totalSupplyRaw] = await Promise.all([
    client.readContract({
      address: env.vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'totalAssets',
    }),
    client.readContract({
      address: env.vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      functionName: 'totalSupply',
    }),
  ]);

  return {
    totalAssetsRaw: totalAssetsRaw as bigint,
    totalSupplyRaw: totalSupplyRaw as bigint,
  };
}

export async function getVaultSummary() {
  try {
    const [{ totalAssetsRaw, totalSupplyRaw }, pool] = await Promise.all([getOnChainVaultTotals(), getPool()]);

    const totalAssets = Number(formatUnits(totalAssetsRaw, USDC_DECIMALS));
    const totalSupply = Number(formatUnits(totalSupplyRaw, SHARES_DECIMALS));
    const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;

    const [depositResult, withdrawResult] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(assets), 0) AS amount FROM vault_deposits'),
      pool.query('SELECT COALESCE(SUM(assets), 0) AS amount FROM vault_withdrawals'),
    ]);

    const totalDeposited = Number(depositResult.rows[0].amount || 0);
    const totalWithdrawn = Number(withdrawResult.rows[0].amount || 0);
    const netDeposits = totalDeposited - totalWithdrawn;
    const utilization = totalAssets > 0 ? Math.min(100, (netDeposits / totalAssets) * 100) : 0;

    return {
      totalAssets,
      totalSupply,
      pricePerShare,
      utilization,
      apy: null as number | null,
      netDeposits,
    };
  } catch (err) {
    console.error('Vault summary failed:', err);
    return {
      totalAssets: 0,
      totalSupply: 0,
      pricePerShare: 0,
      utilization: 0,
      apy: null as number | null,
      netDeposits: 0,
    };
  }
}

export async function getVaultAccount(address: string) {
  const lower = address.toLowerCase();
  try {
    const [{ totalAssetsRaw, totalSupplyRaw }, pool] = await Promise.all([getOnChainVaultTotals(), getPool()]);
    const client = env.vaultAddress ? getClient() : null;

    const [sharesRaw, depositResult, withdrawResult] = await Promise.all([
      env.vaultAddress && client
        ? client.readContract({
            address: env.vaultAddress as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'balanceOf',
            args: [lower as `0x${string}`],
          })
        : 0n,
      pool.query('SELECT COALESCE(SUM(assets), 0) AS amount FROM vault_deposits WHERE address = $1', [lower]),
      pool.query('SELECT COALESCE(SUM(assets), 0) AS amount FROM vault_withdrawals WHERE address = $1', [lower]),
    ]);

    const totalAssets = Number(formatUnits(totalAssetsRaw, USDC_DECIMALS));
    const totalSupply = Number(formatUnits(totalSupplyRaw, SHARES_DECIMALS));
    const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;

    const shares = Number(formatUnits(sharesRaw as bigint, SHARES_DECIMALS));
    const assets = pricePerShare > 0 ? shares * pricePerShare : 0;

    return {
      address: lower,
      shares,
      assets,
      pricePerShare,
      lifetimeDeposits: Number(depositResult.rows[0].amount || 0),
      lifetimeWithdrawals: Number(withdrawResult.rows[0].amount || 0),
    };
  } catch (err) {
    console.error('Vault account failed:', err);
    return {
      address: lower,
      shares: 0,
      assets: 0,
      pricePerShare: 0,
      lifetimeDeposits: 0,
      lifetimeWithdrawals: 0,
    };
  }
}

export async function getVaultActivity(address?: string, limit = 50) {
  const pool = getPool();
  const params: any[] = address ? [address.toLowerCase()] : [];
  const filter = address ? 'WHERE address = $1' : '';

  const query = `
    SELECT id, address, assets, shares, tx_hash, created_at, 'deposit' AS type FROM vault_deposits
    ${filter}
    UNION ALL
    SELECT id, address, assets, shares, tx_hash, created_at, 'withdraw' AS type FROM vault_withdrawals
    ${filter}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  try {
    const result = await pool.query(query, params);
    return result.rows.map((row: any) => ({
      id: Number(row.id),
      address: row.address,
      amount: Number(row.assets || 0),
      shares: Number(row.shares || 0),
      type: row.type as 'deposit' | 'withdraw',
      txHash: row.tx_hash,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));
  } catch (err) {
    console.error('Vault activity failed:', err);
    return [];
  }
}
