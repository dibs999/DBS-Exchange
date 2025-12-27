import { createPublicClient, formatUnits, hexToString, http, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import { getPool } from './db/index.js';
import { env } from './config.js';

const ENGINE_ABI = [
  parseAbiItem('event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, uint256 margin)'),
  parseAbiItem('event PositionClosed(address indexed account, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl)'),
  parseAbiItem('event PositionUpdated(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, uint256 margin, int256 realizedPnl)'),
  parseAbiItem('event Liquidated(address indexed account, address indexed liquidator, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl, uint256 penalty)'),
];

const ORDERBOOK_ABI = [
  parseAbiItem('event OrderCreated(uint256 indexed orderId, address indexed owner, bytes32 indexed marketId, int256 sizeDelta, uint256 leverage, uint256 triggerPrice, bool isStop, bool reduceOnly)'),
  parseAbiItem('event OrderExecuted(uint256 indexed orderId, address indexed owner, bytes32 indexed marketId, int256 sizeDelta, uint256 executionPrice)'),
  parseAbiItem('event OrderCancelled(uint256 indexed orderId, address indexed owner)'),
];

const ORACLE_ABI = [
  parseAbiItem('event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp)'),
];

const FUNDING_ABI = [
  parseAbiItem('event FundingRateUpdated(bytes32 indexed marketId, int256 ratePerSecond, int256 cumulativeFundingRate)'),
];

export async function startIndexer() {
  if (!env.databaseUrl || !env.rpcUrl || !env.engineAddress || !env.oracleAddress) {
    console.warn('Indexer: Missing required config; skipping');
    return;
  }

  const pool = getPool();
  const client = createPublicClient({
    chain: sepolia,
    transport: http(env.rpcUrl),
  });

  // Get last processed block
  let lastBlock = await getLastProcessedBlock(pool);
  const currentBlock = await client.getBlockNumber();
  
  if (lastBlock === 0n) {
    // First run: start from current block - 1000 (safety margin)
    lastBlock = currentBlock - 1000n;
    await updateLastProcessedBlock(pool, lastBlock);
  }

  console.log(`Indexer: Starting from block ${lastBlock}, current: ${currentBlock}`);

  // Process historical blocks in batches
  const BATCH_SIZE = 1000n;
  let fromBlock = lastBlock + 1n;

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock 
      ? currentBlock 
      : fromBlock + BATCH_SIZE - 1n;

    try {
      await indexBlockRange(client, pool, fromBlock, toBlock);
      await updateLastProcessedBlock(pool, toBlock);
      console.log(`Indexed blocks ${fromBlock} to ${toBlock}`);
      fromBlock = toBlock + 1n;
    } catch (err) {
      console.error(`Error indexing blocks ${fromBlock}-${toBlock}:`, err);
      // Continue with next batch
      fromBlock = toBlock + 1n;
    }
  }

  // Watch for new events
  console.log('Indexer: Starting event watchers...');
  
  if (env.engineAddress) {
    client.watchContractEvent({
      address: env.engineAddress as `0x${string}`,
      abi: ENGINE_ABI,
      eventName: 'PositionOpened',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPositionOpened(pool, log);
        }
      },
    });

    client.watchContractEvent({
      address: env.engineAddress as `0x${string}`,
      abi: ENGINE_ABI,
      eventName: 'PositionClosed',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPositionClosed(pool, log);
        }
      },
    });
  }

  if (env.orderbookAddress) {
    client.watchContractEvent({
      address: env.orderbookAddress as `0x${string}`,
      abi: ORDERBOOK_ABI,
      eventName: 'OrderExecuted',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexOrderExecuted(pool, log);
        }
      },
    });
  }

  if (env.oracleAddress) {
    client.watchContractEvent({
      address: env.oracleAddress as `0x${string}`,
      abi: ORACLE_ABI,
      eventName: 'PriceUpdated',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPriceUpdate(pool, log);
        }
      },
    });
  }
}

async function getLastProcessedBlock(pool: any): Promise<bigint> {
  const result = await pool.query('SELECT last_processed_block FROM indexer_state WHERE id = 1');
  if (result.rows.length === 0) {
    await pool.query('INSERT INTO indexer_state (id, last_processed_block) VALUES (1, 0)');
    return 0n;
  }
  return BigInt(result.rows[0].last_processed_block);
}

async function updateLastProcessedBlock(pool: any, blockNumber: bigint) {
  await pool.query(
    'UPDATE indexer_state SET last_processed_block = $1, last_updated_at = NOW() WHERE id = 1',
    [blockNumber.toString()]
  );
}

async function indexBlockRange(client: any, pool: any, fromBlock: bigint, toBlock: bigint) {
  // Index PositionOpened events
  if (env.engineAddress) {
    const positionLogs = await client.getLogs({
      address: env.engineAddress as `0x${string}`,
      event: parseAbiItem('event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, uint256 margin)'),
      fromBlock,
      toBlock,
    });
    for (const log of positionLogs) {
      await indexPositionOpened(pool, log);
    }
  }
}

async function indexPositionOpened(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.size as bigint, 18));
  const side = size >= 0 ? 'long' : 'short';
  
  await pool.query(
    `INSERT INTO positions_history (address, market_id, side, size, entry_price, margin, leverage, opened_at, tx_hash_open)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
     ON CONFLICT DO NOTHING`,
    [
      log.args.account,
      marketId,
      side,
      Math.abs(size),
      Number(formatUnits(log.args.entryPrice as bigint, 18)),
      Number(formatUnits(log.args.margin as bigint, 18)),
      1, // Default leverage, could be calculated
      log.transactionHash,
    ]
  );
}

async function indexPositionClosed(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  
  await pool.query(
    `UPDATE positions_history 
     SET closed_at = NOW(), exit_price = $1, pnl = $2, tx_hash_close = $3
     WHERE address = $4 AND market_id = $5 AND closed_at IS NULL
     ORDER BY opened_at DESC LIMIT 1`,
    [
      Number(formatUnits(log.args.exitPrice as bigint, 18)),
      Number(formatUnits(log.args.pnl as bigint, 18)),
      log.transactionHash,
      log.args.account,
      marketId,
    ]
  );
}

async function indexOrderExecuted(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.sizeDelta as bigint, 18));
  
  await pool.query(
    `INSERT INTO trades (market_id, address, side, size, price, tx_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      marketId,
      log.args.owner,
      size >= 0 ? 'buy' : 'sell',
      Math.abs(size),
      Number(formatUnits(log.args.executionPrice as bigint, 18)),
      log.transactionHash,
      Number(log.blockNumber),
    ]
  );
}

async function indexPriceUpdate(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  
  // Store funding rate if available (would need FundingRateUpdated event)
  // For now, just log price updates
}

