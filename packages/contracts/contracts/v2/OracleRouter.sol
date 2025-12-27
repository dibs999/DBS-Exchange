// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IPriceSource {
    function getPriceData(bytes32 marketId) external view returns (uint256 price, uint256 updatedAt);
}

contract OracleRouter is OwnableUpgradeable, UUPSUpgradeable {
    uint256 public constant BPS = 10_000;

    struct MarketConfig {
        uint256 maxPriceAge;
        uint256 maxDeviationBps;
        uint256 twapWindow;
        uint256 minSources; // Minimum number of valid sources required
        bool circuitBreakerEnabled; // Circuit breaker for extreme deviations
        uint256 circuitBreakerThresholdBps; // Threshold for circuit breaker (e.g., 10% = 1000 bps)
    }

    struct PriceData {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(bytes32 => MarketConfig) public marketConfigs;
    mapping(bytes32 => PriceData) public prices;
    mapping(bytes32 => address[]) public sources;

    event MarketConfigUpdated(bytes32 indexed marketId, uint256 maxPriceAge, uint256 maxDeviationBps, uint256 twapWindow);
    event CircuitBreakerTriggered(bytes32 indexed marketId, uint256 price, uint256 deviationBps);
    event SourcesUpdated(bytes32 indexed marketId, uint256 count);
    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp);
    event PriceSetManually(bytes32 indexed marketId, uint256 price, uint256 timestamp);

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setMarketConfig(
        bytes32 marketId,
        uint256 maxPriceAge,
        uint256 maxDeviationBps,
        uint256 twapWindow,
        uint256 minSources,
        bool circuitBreakerEnabled,
        uint256 circuitBreakerThresholdBps
    ) external onlyOwner {
        require(maxDeviationBps <= BPS, "Bad deviation");
        require(minSources > 0, "minSources=0");
        require(circuitBreakerThresholdBps <= BPS, "Bad circuit breaker threshold");
        marketConfigs[marketId] = MarketConfig({
            maxPriceAge: maxPriceAge,
            maxDeviationBps: maxDeviationBps,
            twapWindow: twapWindow,
            minSources: minSources,
            circuitBreakerEnabled: circuitBreakerEnabled,
            circuitBreakerThresholdBps: circuitBreakerThresholdBps
        });
        emit MarketConfigUpdated(marketId, maxPriceAge, maxDeviationBps, twapWindow);
    }

    function setSources(bytes32 marketId, address[] calldata newSources) external onlyOwner {
        require(newSources.length > 0, "No sources");
        sources[marketId] = newSources;
        emit SourcesUpdated(marketId, newSources.length);
    }

    function setPriceManual(bytes32 marketId, uint256 price) external onlyOwner {
        require(price > 0, "Bad price");
        prices[marketId] = PriceData({ price: price, updatedAt: block.timestamp });
        emit PriceSetManually(marketId, price, block.timestamp);
    }

    function updatePrice(bytes32 marketId) external returns (uint256) {
        (uint256 aggPrice, uint256 validCount) = _aggregatePrice(marketId);
        
        MarketConfig memory cfg = marketConfigs[marketId];
        
        // Require minimum number of sources
        require(validCount >= cfg.minSources, "Insufficient sources");
        require(validCount > 0, "No price");

        PriceData memory prev = prices[marketId];

        // Circuit breaker check
        if (prev.price > 0 && cfg.circuitBreakerEnabled && cfg.circuitBreakerThresholdBps > 0) {
            uint256 diff = aggPrice > prev.price ? aggPrice - prev.price : prev.price - aggPrice;
            uint256 deviationBps = (diff * BPS) / prev.price;
            if (deviationBps >= cfg.circuitBreakerThresholdBps) {
                emit CircuitBreakerTriggered(marketId, aggPrice, deviationBps);
                revert("Circuit breaker triggered");
            }
        }

        // Normal deviation check
        if (prev.price > 0 && cfg.maxDeviationBps > 0) {
            uint256 diff = aggPrice > prev.price ? aggPrice - prev.price : prev.price - aggPrice;
            require((diff * BPS) <= (prev.price * cfg.maxDeviationBps), "Max deviation");
        }

        uint256 finalPrice = aggPrice;
        if (cfg.twapWindow > 0 && prev.updatedAt > 0) {
            uint256 elapsed = block.timestamp - prev.updatedAt;
            if (elapsed < cfg.twapWindow) {
                uint256 weightPrev = cfg.twapWindow - elapsed;
                finalPrice = (prev.price * weightPrev + aggPrice * elapsed) / cfg.twapWindow;
            }
        }

        prices[marketId] = PriceData({ price: finalPrice, updatedAt: block.timestamp });
        emit PriceUpdated(marketId, finalPrice, block.timestamp);
        return finalPrice;
    }

    function previewPrice(bytes32 marketId) external view returns (uint256 price, uint256 validCount) {
        return _aggregatePrice(marketId);
    }

    function getPriceData(bytes32 marketId) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory data = prices[marketId];
        return (data.price, data.updatedAt);
    }

    function _aggregatePrice(bytes32 marketId) internal view returns (uint256 aggPrice, uint256 validCount) {
        address[] memory list = sources[marketId];
        MarketConfig memory cfg = marketConfigs[marketId];
        uint256 sum = 0;
        uint256 nowTs = block.timestamp;
        uint256[] memory validPrices = new uint256[](list.length);
        uint256 validIndex = 0;

        // Collect all valid prices
        for (uint256 i = 0; i < list.length; i++) {
            (uint256 price, uint256 updatedAt) = IPriceSource(list[i]).getPriceData(marketId);
            if (price == 0 || updatedAt == 0) continue;
            if (cfg.maxPriceAge > 0 && nowTs - updatedAt > cfg.maxPriceAge) continue;
            validPrices[validIndex] = price;
            validIndex++;
        }
        
        validCount = validIndex;
        if (validCount == 0) {
            return (0, 0);
        }

        // Remove outliers (median-based approach for better resistance to manipulation)
        if (validCount >= 3) {
            // Sort prices (simple bubble sort for small arrays)
            for (uint256 i = 0; i < validCount - 1; i++) {
                for (uint256 j = 0; j < validCount - i - 1; j++) {
                    if (validPrices[j] > validPrices[j + 1]) {
                        uint256 temp = validPrices[j];
                        validPrices[j] = validPrices[j + 1];
                        validPrices[j + 1] = temp;
                    }
                }
            }
            
            // Use median for better manipulation resistance
            if (validCount % 2 == 0) {
                aggPrice = (validPrices[validCount / 2 - 1] + validPrices[validCount / 2]) / 2;
            } else {
                aggPrice = validPrices[validCount / 2];
            }
        } else {
            // For < 3 sources, use average
            for (uint256 i = 0; i < validCount; i++) {
                sum += validPrices[i];
            }
            aggPrice = sum / validCount;
        }
    }
}
