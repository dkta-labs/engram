// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    uint256 private _nextId = 1;

    mapping(address => uint256) public agentIds;
    mapping(uint256 => address) public agentOwners;
    mapping(uint256 => string) public memoryIndex;

    event AgentRegistered(uint256 indexed agentId, address indexed owner);
    event IndexUpdated(uint256 indexed agentId, string cid);

    function register(address owner) external returns (uint256) {
        require(agentIds[owner] == 0, "Already registered");
        uint256 id = _nextId++;
        agentIds[owner] = id;
        agentOwners[id] = owner;
        emit AgentRegistered(id, owner);
        return id;
    }

    function updateIndex(uint256 agentId, string calldata cid) external {
        require(agentOwners[agentId] == msg.sender, "Not owner");
        memoryIndex[agentId] = cid;
        emit IndexUpdated(agentId, cid);
    }

    function getAgentId(address owner) external view returns (uint256) {
        return agentIds[owner];
    }

    function getIndex(uint256 agentId) external view returns (string memory) {
        return memoryIndex[agentId];
    }
}
