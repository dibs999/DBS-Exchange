// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title ProofOfReserves
 * @notice On-chain Merkle root storage for Proof of Reserves verification
 * @dev Allows users to cryptographically verify their balance is included in the total liabilities
 */
contract ProofOfReserves is OwnableUpgradeable, UUPSUpgradeable {
    /// @notice The current Merkle root of all user balances
    bytes32 public merkleRoot;
    
    /// @notice Timestamp of last Merkle root update
    uint256 public lastUpdateTimestamp;
    
    /// @notice Total liabilities (sum of all user collateral balances) in 1e18 format
    uint256 public totalLiabilities;
    
    /// @notice Number of accounts included in the Merkle tree
    uint256 public accountCount;
    
    /// @notice Address of the PerpEngine contract holding reserves
    address public engine;
    
    /// @notice Address of the collateral token (USDC)
    IERC20Upgradeable public collateralToken;
    
    /// @notice Mapping of authorized keepers who can update the Merkle root
    mapping(address => bool) public keepers;
    
    /// @notice Historical attestations
    struct Attestation {
        bytes32 merkleRoot;
        uint256 totalLiabilities;
        uint256 totalReserves;
        uint256 accountCount;
        uint256 timestamp;
        uint256 blockNumber;
    }
    
    /// @notice Array of historical attestations
    Attestation[] public attestations;
    
    // Events
    event MerkleRootUpdated(
        bytes32 indexed merkleRoot,
        uint256 totalLiabilities,
        uint256 totalReserves,
        uint256 accountCount,
        uint256 timestamp
    );
    event KeeperSet(address indexed keeper, bool allowed);
    event EngineUpdated(address indexed engine);
    
    // Errors
    error NotKeeper();
    error InvalidProof();
    error ZeroAddress();
    
    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != owner()) revert NotKeeper();
        _;
    }
    
    /// @notice Initialize the contract
    /// @param engine_ Address of the PerpEngine contract
    /// @param collateralToken_ Address of the collateral token (USDC)
    function initialize(address engine_, address collateralToken_) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        
        if (engine_ == address(0) || collateralToken_ == address(0)) revert ZeroAddress();
        engine = engine_;
        collateralToken = IERC20Upgradeable(collateralToken_);
    }
    
    function _authorizeUpgrade(address) internal override onlyOwner {}
    
    /// @notice Set keeper authorization
    /// @param keeper Address to authorize/deauthorize
    /// @param allowed Whether the keeper is allowed
    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }
    
    /// @notice Update the engine address
    /// @param engine_ New engine address
    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = engine_;
        emit EngineUpdated(engine_);
    }
    
    /// @notice Update the Merkle root with new attestation data
    /// @param root_ New Merkle root
    /// @param liabilities_ Total liabilities (sum of all user balances)
    /// @param count_ Number of accounts in the tree
    function updateMerkleRoot(
        bytes32 root_,
        uint256 liabilities_,
        uint256 count_
    ) external onlyKeeper {
        merkleRoot = root_;
        totalLiabilities = liabilities_;
        accountCount = count_;
        lastUpdateTimestamp = block.timestamp;
        
        uint256 reserves = getTotalReserves();
        
        // Store attestation in history
        attestations.push(Attestation({
            merkleRoot: root_,
            totalLiabilities: liabilities_,
            totalReserves: reserves,
            accountCount: count_,
            timestamp: block.timestamp,
            blockNumber: block.number
        }));
        
        emit MerkleRootUpdated(root_, liabilities_, reserves, count_, block.timestamp);
    }
    
    /// @notice Get total reserves (collateral token balance in engine)
    /// @return Total USDC balance held by the engine contract
    function getTotalReserves() public view returns (uint256) {
        return collateralToken.balanceOf(engine);
    }
    
    /// @notice Get the current solvency ratio (reserves / liabilities)
    /// @return ratio Solvency ratio in basis points (10000 = 100%)
    function getSolvencyRatio() external view returns (uint256 ratio) {
        if (totalLiabilities == 0) return 10000; // 100% if no liabilities
        uint256 reserves = getTotalReserves();
        // Scale up reserves to match liabilities (1e18 format)
        // USDC has 6 decimals, internal liabilities are 1e18
        uint256 scaledReserves = reserves * 1e12; // 1e6 -> 1e18
        ratio = (scaledReserves * 10000) / totalLiabilities;
    }
    
    /// @notice Verify that a user's balance is included in the Merkle tree
    /// @param account User's address
    /// @param balance User's balance (in 1e18 format)
    /// @param proof Merkle proof (array of sibling hashes)
    /// @return valid True if the proof is valid
    function verifyInclusion(
        address account,
        uint256 balance,
        bytes32[] calldata proof
    ) external view returns (bool valid) {
        bytes32 leaf = keccak256(abi.encodePacked(account, balance));
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash <= proofElement) {
                // Hash(current, proof)
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                // Hash(proof, current)
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == merkleRoot;
    }
    
    /// @notice Get the number of attestations
    /// @return count Number of attestations
    function getAttestationCount() external view returns (uint256 count) {
        return attestations.length;
    }
    
    /// @notice Get attestation at a specific index
    /// @param index Attestation index
    /// @return attestation The attestation data
    function getAttestation(uint256 index) external view returns (Attestation memory attestation) {
        require(index < attestations.length, "Index out of bounds");
        return attestations[index];
    }
    
    /// @notice Get the latest attestation
    /// @return attestation The latest attestation data
    function getLatestAttestation() external view returns (Attestation memory attestation) {
        require(attestations.length > 0, "No attestations");
        return attestations[attestations.length - 1];
    }
    
    /// @notice Get current reserves summary
    /// @return reserves Total reserves (raw USDC balance)
    /// @return liabilities Total liabilities (1e18 format)
    /// @return ratio Solvency ratio in basis points
    /// @return accounts Number of accounts
    /// @return lastUpdate Timestamp of last update
    function getReservesSummary() external view returns (
        uint256 reserves,
        uint256 liabilities,
        uint256 ratio,
        uint256 accounts,
        uint256 lastUpdate
    ) {
        reserves = getTotalReserves();
        liabilities = totalLiabilities;
        accounts = accountCount;
        lastUpdate = lastUpdateTimestamp;
        
        if (liabilities == 0) {
            ratio = 10000;
        } else {
            uint256 scaledReserves = reserves * 1e12;
            ratio = (scaledReserves * 10000) / liabilities;
        }
    }
}
