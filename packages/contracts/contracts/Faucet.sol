// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Faucet is Ownable, ReentrancyGuard {
    IERC20 public immutable token;
    
    uint256 public maxAmountPerRequest = 10_000 * 1e18; // 10k oUSD max per request
    uint256 public cooldownPeriod = 1 hours; // 1 hour cooldown between requests
    uint256 public dailyLimit = 50_000 * 1e18; // 50k oUSD per day per address
    uint256 public totalDailyLimit = 500_000 * 1e18; // 500k oUSD total per day
    
    mapping(address => uint256) public lastRequestTime;
    mapping(address => uint256) public dailyClaimed;
    mapping(address => bool) public allowlist;
    bool public allowlistEnabled = false;
    
    uint256 public totalDailyClaimed;
    uint256 public lastResetDay;
    
    event FaucetRequest(address indexed user, uint256 amount);
    event AllowlistUpdated(address indexed user, bool allowed);
    event LimitsUpdated(uint256 maxAmount, uint256 cooldown, uint256 dailyLimit, uint256 totalDailyLimit);
    
    constructor(address token_) Ownable(msg.sender) {
        require(token_ != address(0), "Bad token");
        token = IERC20(token_);
        lastResetDay = block.timestamp / 1 days;
    }
    
    function request(uint256 amount) external nonReentrant {
        require(amount > 0 && amount <= maxAmountPerRequest, "Invalid amount");
        
        if (allowlistEnabled) {
            require(allowlist[msg.sender], "Not allowlisted");
        }
        
        // Reset daily counters if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastResetDay) {
            totalDailyClaimed = 0;
            lastResetDay = currentDay;
        }
        
        // Check cooldown
        require(
            block.timestamp >= lastRequestTime[msg.sender] + cooldownPeriod,
            "Cooldown active"
        );
        
        // Check daily limits
        require(
            dailyClaimed[msg.sender] + amount <= dailyLimit,
            "Daily limit exceeded"
        );
        require(
            totalDailyClaimed + amount <= totalDailyLimit,
            "Total daily limit exceeded"
        );
        
        // Update state
        lastRequestTime[msg.sender] = block.timestamp;
        dailyClaimed[msg.sender] += amount;
        totalDailyClaimed += amount;
        
        // Transfer tokens
        require(token.transfer(msg.sender, amount), "Transfer failed");
        
        emit FaucetRequest(msg.sender, amount);
    }
    
    function setAllowlist(address user, bool allowed) external onlyOwner {
        allowlist[user] = allowed;
        emit AllowlistUpdated(user, allowed);
    }
    
    function setAllowlistEnabled(bool enabled) external onlyOwner {
        allowlistEnabled = enabled;
    }
    
    function setLimits(
        uint256 maxAmount,
        uint256 cooldown,
        uint256 dailyLimit_,
        uint256 totalDailyLimit_
    ) external onlyOwner {
        require(maxAmount > 0, "Bad maxAmount");
        require(cooldown >= 1 hours, "Cooldown too short");
        maxAmountPerRequest = maxAmount;
        cooldownPeriod = cooldown;
        dailyLimit = dailyLimit_;
        totalDailyLimit = totalDailyLimit_;
        emit LimitsUpdated(maxAmount, cooldown, dailyLimit_, totalDailyLimit_);
    }
    
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(token.transfer(owner(), amount), "Transfer failed");
    }
    
    function getRemainingDailyLimit(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastResetDay) {
            return dailyLimit;
        }
        uint256 claimed = dailyClaimed[user];
        return claimed >= dailyLimit ? 0 : dailyLimit - claimed;
    }
    
    function canRequest(address user, uint256 amount) external view returns (bool, string memory) {
        if (allowlistEnabled && !allowlist[user]) {
            return (false, "Not allowlisted");
        }
        if (amount == 0 || amount > maxAmountPerRequest) {
            return (false, "Invalid amount");
        }
        if (block.timestamp < lastRequestTime[user] + cooldownPeriod) {
            return (false, "Cooldown active");
        }
        uint256 currentDay = block.timestamp / 1 days;
        uint256 userDailyClaimed = currentDay > lastResetDay ? 0 : dailyClaimed[user];
        if (userDailyClaimed + amount > dailyLimit) {
            return (false, "Daily limit exceeded");
        }
        uint256 totalClaimed = currentDay > lastResetDay ? 0 : totalDailyClaimed;
        if (totalClaimed + amount > totalDailyLimit) {
            return (false, "Total daily limit exceeded");
        }
        return (true, "");
    }
}

