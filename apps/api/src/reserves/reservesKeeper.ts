import { createPublicClient, createWalletClient, http, privateKeyToAccount, Address } from 'viem';
import { base, sepolia } from 'viem/chains';
import { env } from '../config.js';
import { getPool } from '../db/index.js';
import { buildMerkleTree, type BalanceLeaf, type MerkleTreeResult } from './merkleTree.js';

// In-memory cache for the current Merkle tree
let currentTree: MerkleTreeResult | null = null;
let lastTreeUpdate: number = 0;

const PROOF_OF_RESERVES_ABI = [
    {
        type: 'function',
        name: 'updateMerkleRoot',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'root_', type: 'bytes32' },
            { name: 'liabilities_', type: 'uint256' },
            { name: 'count_', type: 'uint256' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'getReservesSummary',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'reserves', type: 'uint256' },
            { name: 'liabilities', type: 'uint256' },
            { name: 'ratio', type: 'uint256' },
            { name: 'accounts', type: 'uint256' },
            { name: 'lastUpdate', type: 'uint256' },
        ],
    },
    {
        type: 'function',
        name: 'merkleRoot',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'bytes32' }],
    },
    {
        type: 'function',
        name: 'getAttestationCount',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'count', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'getAttestation',
        stateMutability: 'view',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [
            {
                name: 'attestation',
                type: 'tuple',
                components: [
                    { name: 'merkleRoot', type: 'bytes32' },
                    { name: 'totalLiabilities', type: 'uint256' },
                    { name: 'totalReserves', type: 'uint256' },
                    { name: 'accountCount', type: 'uint256' },
                    { name: 'timestamp', type: 'uint256' },
                    { name: 'blockNumber', type: 'uint256' },
                ],
            },
        ],
    },
] as const;

const PERP_ENGINE_ABI = [
    {
        type: 'function',
        name: 'collateralBalance',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

/**
 * Get current Merkle tree (from cache or rebuild)
 */
export function getCurrentTree(): MerkleTreeResult | null {
    return currentTree;
}

/**
 * Get the timestamp of the last tree update
 */
export function getLastTreeUpdate(): number {
    return lastTreeUpdate;
}

/**
 * Fetch all user balances from the database
 */
async function fetchAllBalances(): Promise<BalanceLeaf[]> {
    const pool = getPool();

    // Get all unique addresses that have had positions
    const result = await pool.query(`
    SELECT DISTINCT address FROM (
      SELECT address FROM positions_history
      UNION
      SELECT address FROM v2_positions
      UNION
      SELECT address FROM trades
    ) subq
  `);

    if (result.rows.length === 0) {
        return [];
    }

    const chain = env.chainId === 8453 ? base : sepolia;
    const publicClient = createPublicClient({
        chain,
        transport: http(env.baseRpcUrl || env.rpcUrl),
    });

    const engineAddress = env.engineV2Address || env.engineAddress;
    if (!engineAddress) {
        console.warn('Reserves: No engine address configured');
        return [];
    }

    // Fetch balances from contract for each address
    const balances: BalanceLeaf[] = [];

    for (const row of result.rows) {
        const address = row.address as Address;
        try {
            const balance = await publicClient.readContract({
                address: engineAddress as Address,
                abi: PERP_ENGINE_ABI,
                functionName: 'collateralBalance',
                args: [address],
            });

            if (balance > 0n) {
                balances.push({ address, balance });
            }
        } catch (err) {
            console.warn(`Reserves: Failed to fetch balance for ${address}`, err);
        }
    }

    return balances;
}

/**
 * Rebuild the Merkle tree from current balances
 */
export async function rebuildMerkleTree(): Promise<MerkleTreeResult> {
    console.log('Reserves: Rebuilding Merkle tree...');

    const balances = await fetchAllBalances();
    const tree = buildMerkleTree(balances);

    currentTree = tree;
    lastTreeUpdate = Date.now();

    console.log(`Reserves: Tree built with ${tree.accountCount} accounts, root: ${tree.root}`);

    return tree;
}

/**
 * Update the on-chain Merkle root
 */
async function updateOnChainRoot(tree: MerkleTreeResult): Promise<string | null> {
    if (!env.proofOfReservesAddress || !env.keeperPrivateKey) {
        console.warn('Reserves: ProofOfReserves address or keeper key not configured');
        return null;
    }

    const chain = env.chainId === 8453 ? base : sepolia;
    const account = privateKeyToAccount(env.keeperPrivateKey as `0x${string}`);

    const walletClient = createWalletClient({
        chain,
        transport: http(env.baseRpcUrl || env.rpcUrl),
        account,
    });

    const publicClient = createPublicClient({
        chain,
        transport: http(env.baseRpcUrl || env.rpcUrl),
    });

    try {
        const hash = await walletClient.writeContract({
            address: env.proofOfReservesAddress as Address,
            abi: PROOF_OF_RESERVES_ABI,
            functionName: 'updateMerkleRoot',
            args: [tree.root as `0x${string}`, tree.totalLiabilities, BigInt(tree.accountCount)],
        });

        console.log(`Reserves: Updated on-chain root, tx: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });

        return hash;
    } catch (err) {
        console.error('Reserves: Failed to update on-chain root:', err);
        return null;
    }
}

/**
 * Get reserves summary from contract
 */
export async function getOnChainReservesSummary(): Promise<{
    reserves: bigint;
    liabilities: bigint;
    ratio: bigint;
    accounts: bigint;
    lastUpdate: bigint;
    merkleRoot: string;
} | null> {
    if (!env.proofOfReservesAddress) {
        return null;
    }

    const chain = env.chainId === 8453 ? base : sepolia;
    const publicClient = createPublicClient({
        chain,
        transport: http(env.baseRpcUrl || env.rpcUrl),
    });

    try {
        const [summary, merkleRoot] = await Promise.all([
            publicClient.readContract({
                address: env.proofOfReservesAddress as Address,
                abi: PROOF_OF_RESERVES_ABI,
                functionName: 'getReservesSummary',
            }),
            publicClient.readContract({
                address: env.proofOfReservesAddress as Address,
                abi: PROOF_OF_RESERVES_ABI,
                functionName: 'merkleRoot',
            }),
        ]);

        return {
            reserves: summary[0],
            liabilities: summary[1],
            ratio: summary[2],
            accounts: summary[3],
            lastUpdate: summary[4],
            merkleRoot: merkleRoot as string,
        };
    } catch (err) {
        console.error('Reserves: Failed to get on-chain summary:', err);
        return null;
    }
}

/**
 * Start the reserves keeper
 */
export async function startReservesKeeper() {
    const interval = env.reservesKeeperInterval || 3600000; // Default 1 hour

    if (!env.reservesKeeperEnabled) {
        console.log('Reserves Keeper: Disabled');
        return;
    }

    console.log('Reserves Keeper: Started');

    async function updateReserves() {
        try {
            const tree = await rebuildMerkleTree();
            await updateOnChainRoot(tree);
        } catch (err) {
            console.error('Reserves Keeper: Error in update cycle:', err);
        }
    }

    // Initial update
    await updateReserves();

    // Set up interval
    const intervalId = setInterval(updateReserves, interval);

    // Graceful shutdown
    process.on('SIGTERM', () => {
        clearInterval(intervalId);
        console.log('Reserves Keeper: Stopped');
    });
}
