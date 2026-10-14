// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title PrintBook
/// @notice Public, append-only record for Last Print: daily pack seeds (commit then reveal),
///         fingerprints of card pulls (Merkle roots), and crowned Last Prints.
/// @dev Holds no funds and never touches Chog Genesis tokens. A Last Print is only accepted when the
///      root containing its pull was posted in a block strictly before the sale block, and the pull
///      time is before the sale time, so a pull cannot be added after the sale is known.
contract PrintBook {
    struct LastPrintClaim {
        uint256 tokenId;      // Chog Genesis token id (not the display number)
        uint32 edition;       // edition closed by the sale
        bytes32 cardId;
        uint32 printNo;
        bytes32 playerId;
        uint64 pulledAtMs;
        bytes32 snapshotHash; // Hot listing snapshot, or zero
        bytes32 root;
        bytes32 saleTx;
        uint64 saleBlock;
        uint64 saleTimeMs;
    }

    address public owner;
    address public pendingOwner;

    mapping(uint32 day => bytes32) public seedHashOf;
    mapping(uint32 day => bytes32) public seedOf;
    mapping(bytes32 root => uint64) public rootBlock;
    mapping(uint256 tokenId => mapping(uint32 edition => bytes32 cardId)) public lastPrintOf;

    event SeedCommitted(uint32 indexed day, bytes32 seedHash);
    event SeedRevealed(uint32 indexed day, bytes32 seed);
    event PullRoot(bytes32 indexed root, uint64 fromMs, uint64 toMs, uint32 count);
    event LastPrint(uint256 indexed tokenId, uint32 indexed edition, bytes32 cardId, bytes32 saleTx, bytes32 root);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error AlreadySet();
    error NotCommitted();
    error SeedMismatch();
    error EmptyRoot();
    error BadRange();
    error RootUnknown();
    error RootNotBeforeSale();
    error PulledAfterSale();
    error SaleInFuture();
    error BadProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function commitSeed(uint32 day, bytes32 seedHash) external onlyOwner {
        if (seedHashOf[day] != bytes32(0)) revert AlreadySet();
        if (seedHash == bytes32(0)) revert EmptyRoot();
        seedHashOf[day] = seedHash;
        emit SeedCommitted(day, seedHash);
    }

    function revealSeed(uint32 day, bytes32 seed) external onlyOwner {
        bytes32 h = seedHashOf[day];
        if (h == bytes32(0)) revert NotCommitted();
        if (seedOf[day] != bytes32(0)) revert AlreadySet();
        if (keccak256(abi.encodePacked(seed)) != h) revert SeedMismatch();
        seedOf[day] = seed;
        emit SeedRevealed(day, seed);
    }

    function postPullRoot(bytes32 root, uint64 fromMs, uint64 toMs, uint32 count) external onlyOwner {
        if (root == bytes32(0) || count == 0) revert EmptyRoot();
        if (fromMs > toMs) revert BadRange();
        if (rootBlock[root] != 0) revert AlreadySet();
        rootBlock[root] = uint64(block.number);
        emit PullRoot(root, fromMs, toMs, count);
    }

    function recordLastPrint(LastPrintClaim calldata c, bytes32[] calldata proof) external onlyOwner {
        if (lastPrintOf[c.tokenId][c.edition] != bytes32(0)) revert AlreadySet();
        uint64 rb = rootBlock[c.root];
        if (rb == 0) revert RootUnknown();
        if (rb >= c.saleBlock) revert RootNotBeforeSale();
        if (c.saleBlock > block.number) revert SaleInFuture();
        if (c.pulledAtMs >= c.saleTimeMs) revert PulledAfterSale();
        if (!verify(proof, c.root, pullLeaf(c))) revert BadProof();
        lastPrintOf[c.tokenId][c.edition] = c.cardId;
        emit LastPrint(c.tokenId, c.edition, c.cardId, c.saleTx, c.root);
    }

    /// @notice Leaf for one pull; matches packages/core/src/merkle.ts pullLeaf.
    function pullLeaf(LastPrintClaim calldata c) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(
            c.cardId, c.tokenId, c.edition, c.printNo, c.playerId, c.pulledAtMs, c.snapshotHash
        ))));
    }

    function verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) public pure returns (bool) {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == root;
    }

    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
