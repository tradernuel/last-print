// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PrintBook} from "../src/PrintBook.sol";
import {LastPrintCertificate, IPrintBook} from "../src/LastPrintCertificate.sol";

contract PrintBookTest is Test {
    PrintBook book;
    LastPrintCertificate cert;
    address server = address(0xA11CE);
    address stranger = address(0xBEEF);

    // Vectors produced by packages/core/src/merkle.ts (see scripts/interop-vectors.ts).
    bytes32 constant LEAF = 0xb3e1e84af97eb713015b949f6e9607a019012c73ed856007f7c07d8f6ccacdc3;
    bytes32 constant ROOT = 0x8fed393cc4035886279bce8832ed72a3f23ad3e84e1845c00c89ec2996c187b7;

    function setUp() public {
        book = new PrintBook(server);
        cert = new LastPrintCertificate(IPrintBook(address(book)), server, "https://example.invalid/cert/");
        vm.roll(1000);
    }

    function proof() internal pure returns (bytes32[] memory p) {
        p = new bytes32[](3);
        p[0] = 0x53162e144295e8816a1d280f46c239278819b2a2ed337698f54846ae53ddc42e;
        p[1] = 0xea8e5d045ccb242dbb300e4d51316d5eb7f76bd7765fd9825a6218e8ff453022;
        p[2] = 0xe06bff3c7ec6cd11c8218a11eac15beb81f3acb8b225bbc20f014a71ad7b2662;
    }

    function claim(uint64 saleBlock) internal pure returns (PrintBook.LastPrintClaim memory c) {
        c = PrintBook.LastPrintClaim({
            tokenId: 1864, edition: 8, cardId: bytes32(uint256(0xc1)), printNo: 41,
            playerId: bytes32(uint256(0xa1)), pulledAtMs: 1760500000000, snapshotHash: bytes32(uint256(0x5a)),
            root: ROOT, saleTx: bytes32(uint256(0x5a1e)), saleBlock: saleBlock, saleTimeMs: 1760500010000
        });
    }

    function postRoot() internal {
        vm.prank(server);
        book.postPullRoot(ROOT, 1760500000000, 1760500000000, 5);
    }

    // --- interop with the TypeScript engine ---
    function test_leafMatchesTypeScript() public view {
        assertEq(book.pullLeaf(claim(0)), LEAF);
        assertTrue(book.verify(proof(), ROOT, LEAF));
    }

    // --- seeds ---
    function test_commitReveal() public {
        bytes32 seed = keccak256("seed");
        vm.startPrank(server);
        book.commitSeed(20261015, keccak256(abi.encodePacked(seed)));
        book.revealSeed(20261015, seed);
        vm.stopPrank();
        assertEq(book.seedOf(20261015), seed);
    }

    function test_revealWrongSeedReverts() public {
        vm.startPrank(server);
        book.commitSeed(1, keccak256(abi.encodePacked(bytes32("a"))));
        vm.expectRevert(PrintBook.SeedMismatch.selector);
        book.revealSeed(1, bytes32("b"));
    }

    function test_revealWithoutCommitReverts() public {
        vm.prank(server);
        vm.expectRevert(PrintBook.NotCommitted.selector);
        book.revealSeed(1, bytes32("a"));
    }

    function test_commitTwiceReverts() public {
        vm.startPrank(server);
        book.commitSeed(1, bytes32("h"));
        vm.expectRevert(PrintBook.AlreadySet.selector);
        book.commitSeed(1, bytes32("h2"));
    }

    // --- roots ---
    function test_postRootRecordsBlock() public {
        postRoot();
        assertEq(book.rootBlock(ROOT), 1000);
    }

    function test_rootValidation() public {
        vm.startPrank(server);
        vm.expectRevert(PrintBook.EmptyRoot.selector);
        book.postPullRoot(bytes32(0), 1, 2, 1);
        vm.expectRevert(PrintBook.BadRange.selector);
        book.postPullRoot(ROOT, 2, 1, 1);
        book.postPullRoot(ROOT, 1, 2, 1);
        vm.expectRevert(PrintBook.AlreadySet.selector);
        book.postPullRoot(ROOT, 1, 2, 1);
    }

    // --- Last Prints ---
    function test_recordLastPrint() public {
        postRoot();
        vm.roll(1010);
        vm.prank(server);
        book.recordLastPrint(claim(1005), proof());
        assertEq(book.lastPrintOf(1864, 8), bytes32(uint256(0xc1)));
    }

    function test_rootInSaleBlockReverts() public {
        postRoot();
        vm.roll(1010);
        vm.prank(server);
        vm.expectRevert(PrintBook.RootNotBeforeSale.selector);
        book.recordLastPrint(claim(1000), proof());
    }

    function test_rootAfterSaleReverts() public {
        vm.roll(1010);
        postRoot();
        vm.prank(server);
        vm.expectRevert(PrintBook.RootNotBeforeSale.selector);
        book.recordLastPrint(claim(1005), proof());
    }

    function test_unknownRootReverts() public {
        vm.prank(server);
        vm.expectRevert(PrintBook.RootUnknown.selector);
        book.recordLastPrint(claim(1005), proof());
    }

    function test_pullAfterSaleTimeReverts() public {
        postRoot();
        vm.roll(1010);
        PrintBook.LastPrintClaim memory c = claim(1005);
        c.saleTimeMs = c.pulledAtMs;
        vm.prank(server);
        vm.expectRevert(PrintBook.PulledAfterSale.selector);
        book.recordLastPrint(c, proof());
    }

    function test_futureSaleReverts() public {
        postRoot();
        vm.prank(server);
        vm.expectRevert(PrintBook.SaleInFuture.selector);
        book.recordLastPrint(claim(5000), proof());
    }

    function test_tamperedClaimReverts() public {
        postRoot();
        vm.roll(1010);
        PrintBook.LastPrintClaim memory c = claim(1005);
        c.printNo = 1;
        vm.prank(server);
        vm.expectRevert(PrintBook.BadProof.selector);
        book.recordLastPrint(c, proof());
    }

    function test_doubleRecordReverts() public {
        postRoot();
        vm.roll(1010);
        vm.startPrank(server);
        book.recordLastPrint(claim(1005), proof());
        vm.expectRevert(PrintBook.AlreadySet.selector);
        book.recordLastPrint(claim(1005), proof());
    }

    function test_nonOwnerReverts() public {
        vm.startPrank(stranger);
        vm.expectRevert(PrintBook.NotOwner.selector);
        book.commitSeed(1, bytes32("h"));
        vm.expectRevert(PrintBook.NotOwner.selector);
        book.postPullRoot(ROOT, 1, 2, 1);
        vm.expectRevert(PrintBook.NotOwner.selector);
        book.recordLastPrint(claim(1005), proof());
    }

    function test_twoStepOwnership() public {
        vm.prank(server);
        book.transferOwnership(stranger);
        assertEq(book.owner(), server);
        vm.prank(stranger);
        book.acceptOwnership();
        assertEq(book.owner(), stranger);
    }

    // --- certificate ---
    function crown() internal {
        postRoot();
        vm.roll(1010);
        vm.prank(server);
        book.recordLastPrint(claim(1005), proof());
    }

    function test_certificateClaimAndSoulbound() public {
        crown();
        vm.prank(server);
        uint256 id = cert.claim(1864, 8, stranger);
        assertEq(cert.ownerOf(id), stranger);
        assertEq(cert.balanceOf(stranger), 1);
        assertEq(cert.tokenURI(id), "https://example.invalid/cert/0x00000000000000000000000000000000000000000000000000000000000000c1.json");
        vm.prank(stranger);
        vm.expectRevert(LastPrintCertificate.Soulbound.selector);
        cert.transferFrom(stranger, server, id);
        vm.prank(stranger);
        vm.expectRevert(LastPrintCertificate.Soulbound.selector);
        cert.approve(server, id);
    }

    function test_certificateOnlyForLastPrints() public {
        vm.prank(server);
        vm.expectRevert(LastPrintCertificate.NotALastPrint.selector);
        cert.claim(1864, 8, stranger);
    }

    function test_certificateOncePerLastPrint() public {
        crown();
        vm.startPrank(server);
        cert.claim(1864, 8, stranger);
        vm.expectRevert(LastPrintCertificate.AlreadyClaimed.selector);
        cert.claim(1864, 8, server);
    }

    function test_certificateOnlyServer() public {
        crown();
        vm.prank(stranger);
        vm.expectRevert(LastPrintCertificate.NotOwner.selector);
        cert.claim(1864, 8, stranger);
    }

    function test_certificateInterfaces() public view {
        assertTrue(cert.supportsInterface(0x80ac58cd));
        assertTrue(cert.supportsInterface(0x5b5e139f));
        assertFalse(cert.supportsInterface(0xffffffff));
    }

    function testFuzz_verifyRejectsRandomLeaf(bytes32 leaf) public view {
        vm.assume(leaf != LEAF);
        assertFalse(book.verify(proof(), ROOT, leaf));
    }
}
