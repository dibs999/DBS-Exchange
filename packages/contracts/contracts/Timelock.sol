// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Timelock is Ownable {
    uint256 public constant MIN_DELAY = 24 hours;
    uint256 public constant MAX_DELAY = 7 days;
    
    uint256 public delay = 48 hours;
    
    mapping(bytes32 => bool) public queued;
    mapping(bytes32 => uint256) public timestamps;
    
    event Queue(bytes32 indexed txHash, address target, bytes data, uint256 timestamp);
    event Execute(bytes32 indexed txHash, address target, bytes data);
    event Cancel(bytes32 indexed txHash);
    event DelayUpdated(uint256 newDelay);
    
    constructor() Ownable(msg.sender) {}
    
    function setDelay(uint256 newDelay) external onlyOwner {
        require(newDelay >= MIN_DELAY && newDelay <= MAX_DELAY, "Invalid delay");
        delay = newDelay;
        emit DelayUpdated(newDelay);
    }
    
    function queue(
        address target,
        bytes calldata data
    ) external onlyOwner returns (bytes32) {
        bytes32 txHash = keccak256(abi.encode(target, data));
        require(!queued[txHash], "Already queued");
        
        uint256 executeTime = block.timestamp + delay;
        queued[txHash] = true;
        timestamps[txHash] = executeTime;
        
        emit Queue(txHash, target, data, executeTime);
        return txHash;
    }
    
    function execute(
        address target,
        bytes calldata data
    ) external onlyOwner returns (bytes memory) {
        bytes32 txHash = keccak256(abi.encode(target, data));
        require(queued[txHash], "Not queued");
        require(block.timestamp >= timestamps[txHash], "Too early");
        
        queued[txHash] = false;
        
        (bool success, bytes memory returnData) = target.call(data);
        require(success, "Call failed");
        
        emit Execute(txHash, target, data);
        return returnData;
    }
    
    function cancel(bytes32 txHash) external onlyOwner {
        require(queued[txHash], "Not queued");
        queued[txHash] = false;
        emit Cancel(txHash);
    }
    
    function getExecuteTime(bytes32 txHash) external view returns (uint256) {
        return timestamps[txHash];
    }
}

