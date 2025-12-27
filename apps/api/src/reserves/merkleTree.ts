import { keccak256, encodePacked, Address } from 'viem';

export interface BalanceLeaf {
    address: Address;
    balance: bigint;
}

export interface MerkleProof {
    leaf: string;
    proof: string[];
    leafIndex: number;
    balance: string;
    address: string;
}

export interface MerkleTreeResult {
    root: string;
    totalLiabilities: bigint;
    accountCount: number;
    leaves: string[];
    proofs: Map<string, MerkleProof>;
}

/**
 * Build a Merkle tree from user balances
 * Leaves are keccak256(abi.encodePacked(address, balance))
 */
export function buildMerkleTree(balances: BalanceLeaf[]): MerkleTreeResult {
    if (balances.length === 0) {
        return {
            root: '0x' + '0'.repeat(64),
            totalLiabilities: 0n,
            accountCount: 0,
            leaves: [],
            proofs: new Map(),
        };
    }

    // Sort balances by address for deterministic ordering
    const sortedBalances = [...balances].sort((a, b) =>
        a.address.toLowerCase().localeCompare(b.address.toLowerCase())
    );

    // Calculate total liabilities
    const totalLiabilities = sortedBalances.reduce((sum, b) => sum + b.balance, 0n);

    // Create leaves
    const leaves = sortedBalances.map(b =>
        keccak256(encodePacked(['address', 'uint256'], [b.address, b.balance]))
    );

    // Pad to power of 2 if necessary
    const paddedLeaves = [...leaves];
    while (paddedLeaves.length > 1 && (paddedLeaves.length & (paddedLeaves.length - 1)) !== 0) {
        // Pad with zero hashes
        paddedLeaves.push('0x' + '0'.repeat(64) as `0x${string}`);
    }

    // Build tree levels
    const tree: string[][] = [paddedLeaves];

    while (tree[tree.length - 1].length > 1) {
        const currentLevel = tree[tree.length - 1];
        const nextLevel: string[] = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || left; // Duplicate if odd

            // Sort before hashing for consistent ordering
            const [first, second] = left <= right ? [left, right] : [right, left];
            const hash = keccak256(encodePacked(['bytes32', 'bytes32'], [first as `0x${string}`, second as `0x${string}`]));
            nextLevel.push(hash);
        }

        tree.push(nextLevel);
    }

    const root = tree[tree.length - 1][0];

    // Generate proofs for each original leaf
    const proofs = new Map<string, MerkleProof>();

    for (let i = 0; i < sortedBalances.length; i++) {
        const balance = sortedBalances[i];
        const proof = getProof(tree, i);

        proofs.set(balance.address.toLowerCase(), {
            leaf: leaves[i],
            proof,
            leafIndex: i,
            balance: balance.balance.toString(),
            address: balance.address,
        });
    }

    return {
        root,
        totalLiabilities,
        accountCount: sortedBalances.length,
        leaves,
        proofs,
    };
}

/**
 * Get Merkle proof for a leaf at a given index
 */
function getProof(tree: string[][], leafIndex: number): string[] {
    const proof: string[] = [];
    let index = leafIndex;

    for (let level = 0; level < tree.length - 1; level++) {
        const currentLevel = tree[level];
        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;

        if (siblingIndex < currentLevel.length) {
            proof.push(currentLevel[siblingIndex]);
        }

        index = Math.floor(index / 2);
    }

    return proof;
}

/**
 * Verify a Merkle proof
 */
export function verifyProof(
    root: string,
    address: Address,
    balance: bigint,
    proof: string[]
): boolean {
    let computedHash = keccak256(encodePacked(['address', 'uint256'], [address, balance]));

    for (const proofElement of proof) {
        const [first, second] = computedHash <= proofElement
            ? [computedHash, proofElement]
            : [proofElement, computedHash];

        computedHash = keccak256(encodePacked(['bytes32', 'bytes32'], [first as `0x${string}`, second as `0x${string}`]));
    }

    return computedHash === root;
}

/**
 * Hash a leaf (address + balance)
 */
export function hashLeaf(address: Address, balance: bigint): string {
    return keccak256(encodePacked(['address', 'uint256'], [address, balance]));
}
