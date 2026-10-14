// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPrintBook {
    function lastPrintOf(uint256 tokenId, uint32 edition) external view returns (bytes32);
}

/// @title LastPrintCertificate
/// @notice Optional, non-transferable certificate for a crowned Last Print. One per Last Print.
///         Minted by the game server (it pays gas) after it checks the claimant owns the Last Print card.
contract LastPrintCertificate {
    string public constant name = "Last Print Certificate";
    string public constant symbol = "LPCERT";

    IPrintBook public immutable book;
    address public owner;
    string private baseURI;

    mapping(uint256 certId => address) private ownerOfCert;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 certId => bytes32 cardId) public cardOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event BaseURISet(string uri);

    error NotOwner();
    error Soulbound();
    error NotALastPrint();
    error AlreadyClaimed();
    error UnknownToken();
    error ZeroAddress();

    constructor(IPrintBook book_, address owner_, string memory baseURI_) {
        book = book_;
        owner = owner_;
        baseURI = baseURI_;
    }

    function certIdOf(uint256 chogTokenId, uint32 edition) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(chogTokenId, edition)));
    }

    function claim(uint256 chogTokenId, uint32 edition, address to) external returns (uint256 certId) {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        bytes32 cardId = book.lastPrintOf(chogTokenId, edition);
        if (cardId == bytes32(0)) revert NotALastPrint();
        certId = certIdOf(chogTokenId, edition);
        if (ownerOfCert[certId] != address(0)) revert AlreadyClaimed();
        ownerOfCert[certId] = to;
        cardOf[certId] = cardId;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, certId);
    }

    function ownerOf(uint256 certId) external view returns (address o) {
        o = ownerOfCert[certId];
        if (o == address(0)) revert UnknownToken();
    }

    function tokenURI(uint256 certId) external view returns (string memory) {
        if (ownerOfCert[certId] == address(0)) revert UnknownToken();
        return string.concat(baseURI, _hex(cardOf[certId]), ".json");
    }

    function setBaseURI(string calldata uri) external {
        if (msg.sender != owner) revert NotOwner();
        baseURI = uri;
        emit BaseURISet(uri);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    // Soulbound: every transfer and approval path reverts.
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure { revert Soulbound(); }
    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }
    function getApproved(uint256) external pure returns (address) { return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }

    function _hex(bytes32 b) private pure returns (string memory) {
        bytes memory s = new bytes(64);
        bytes16 sym = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            s[2 * i] = sym[uint8(b[i]) >> 4];
            s[2 * i + 1] = sym[uint8(b[i]) & 0x0f];
        }
        return string.concat("0x", string(s));
    }
}
