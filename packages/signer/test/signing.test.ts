import { describe, it, expect } from "vitest";
import {
  createKeyGroupWithDealer,
  createKeyPackageFromShare,
  createSigningSession,
  generateNonceCommitment,
  processPublicNonce,
  generatePartialSignature,
  processPartialSignature,
  aggregateSignatures,
  signWithShares,
  verifySignature,
  hasAllNonces,
  hasAllPartialSignatures,
  generateRefreshShares,
  applyRefreshShares,
  verifyRefreshedShare,
} from "../src/index.js";

describe("Threshold Signing", () => {
  describe("signWithShares (simplified API)", () => {
    it("should sign a message with 2-of-3 threshold", () => {
      // Create a 2-of-3 key group
      const { shares, groupPubkey } = createKeyGroupWithDealer(2, 3);
      
      expect(shares).toHaveLength(3);
      expect(groupPubkey).toBeDefined();
      expect(groupPubkey.length).toBeGreaterThan(0);

      // Create a test message
      const message = "deadbeef".repeat(8); // 32 bytes

      // Sign with first 2 shares
      const sharesWithPubkey = shares.slice(0, 2).map((share) => ({
        share,
        groupPubkey,
      }));

      const signature = signWithShares(sharesWithPubkey, message, 2);

      expect(signature).toBeDefined();
      expect(signature.length).toBe(128); // 64 bytes = 128 hex chars

      // Verify the signature
      const isValid = verifySignature(groupPubkey, message, signature);
      expect(isValid).toBe(true);
    });

    it("should sign a message with 3-of-5 threshold", () => {
      const { shares, groupPubkey } = createKeyGroupWithDealer(3, 5);
      
      expect(shares).toHaveLength(5);

      const message = "cafebabe".repeat(8);

      // Sign with first 3 shares
      const sharesWithPubkey = shares.slice(0, 3).map((share) => ({
        share,
        groupPubkey,
      }));

      const signature = signWithShares(sharesWithPubkey, message, 3);

      expect(signature).toBeDefined();
      expect(verifySignature(groupPubkey, message, signature)).toBe(true);
    });

    it("should fail to sign with insufficient shares", () => {
      const { shares, groupPubkey } = createKeyGroupWithDealer(3, 5);
      
      const message = "deadbeef".repeat(8);

      // Try to sign with only 2 shares (need 3)
      const sharesWithPubkey = shares.slice(0, 2).map((share) => ({
        share,
        groupPubkey,
      }));

      expect(() => signWithShares(sharesWithPubkey, message, 3)).toThrow(
        "Not enough shares"
      );
    });

    it("should produce different signatures for different messages", () => {
      const { shares, groupPubkey } = createKeyGroupWithDealer(2, 3);
      
      const message1 = "11111111".repeat(8);
      const message2 = "22222222".repeat(8);

      const sharesWithPubkey = shares.slice(0, 2).map((share) => ({
        share,
        groupPubkey,
      }));

      const sig1 = signWithShares(sharesWithPubkey, message1, 2);
      const sig2 = signWithShares(sharesWithPubkey, message2, 2);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("Session-based signing", () => {
    it("should complete a full signing session with 2-of-3", () => {
      // Setup: Create key group and key packages
      const { shares, groupPubkey, vssCommitments } = createKeyGroupWithDealer(2, 3);
      
      const keyPackages = shares.map((share) =>
        createKeyPackageFromShare(share, groupPubkey, vssCommitments, 2, 3)
      );

      const message = "abcdabcd".repeat(8);
      const signerIndices = [1, 2]; // Participants 1 and 2 will sign

      // Create signing sessions for participants 1 and 2
      const config = {
        sessionId: "test-session-123",
        message,
        groupPubkey,
        signerIndices,
      };

      let session1 = createSigningSession(config, keyPackages[0]!);
      let session2 = createSigningSession(config, keyPackages[1]!);

      // Round 1: Generate and exchange nonce commitments
      const { publicNonce: nonce1, session: s1 } = generateNonceCommitment(session1);
      session1 = s1;

      const { publicNonce: nonce2, session: s2 } = generateNonceCommitment(session2);
      session2 = s2;

      // Exchange nonces
      session1 = processPublicNonce(session1, nonce2);
      session2 = processPublicNonce(session2, nonce1);

      expect(hasAllNonces(session1)).toBe(true);
      expect(hasAllNonces(session2)).toBe(true);

      // Round 2: Generate and exchange partial signatures
      const { partialSig: psig1, session: s3 } = generatePartialSignature(session1);
      session1 = s3;

      const { partialSig: psig2, session: s4 } = generatePartialSignature(session2);
      session2 = s4;

      // Exchange partial signatures
      session1 = processPartialSignature(session1, psig2);
      session2 = processPartialSignature(session2, psig1);

      expect(hasAllPartialSignatures(session1)).toBe(true);
      expect(hasAllPartialSignatures(session2)).toBe(true);

      // Aggregate signatures
      const { signature: sig1, session: s5 } = aggregateSignatures(session1);
      session1 = s5;

      const { signature: sig2, session: s6 } = aggregateSignatures(session2);
      session2 = s6;

      // Both participants should get the same signature
      expect(sig1).toBe(sig2);

      // Verify the signature
      expect(verifySignature(groupPubkey, message, sig1)).toBe(true);
    });

    it("should reject invalid partial signature", () => {
      const { shares, groupPubkey, vssCommitments } = createKeyGroupWithDealer(2, 3);
      
      const keyPackages = shares.map((share) =>
        createKeyPackageFromShare(share, groupPubkey, vssCommitments, 2, 3)
      );

      const message = "1234567890abcdef".repeat(4); // Valid 32-byte hex
      const signerIndices = [1, 2];

      const config = {
        sessionId: "test-session-456",
        message,
        groupPubkey,
        signerIndices,
      };

      let session1 = createSigningSession(config, keyPackages[0]!);
      let session2 = createSigningSession(config, keyPackages[1]!);

      // Generate nonces
      const { publicNonce: nonce1, session: s1 } = generateNonceCommitment(session1);
      session1 = s1;

      const { publicNonce: nonce2, session: s2 } = generateNonceCommitment(session2);
      session2 = s2;

      session1 = processPublicNonce(session1, nonce2);
      session2 = processPublicNonce(session2, nonce1);

      // Generate partial signatures
      const { partialSig: psig1 } = generatePartialSignature(session1);
      const { partialSig: psig2 } = generatePartialSignature(session2);

      // Tamper with the partial signature
      const tamperedSig = {
        ...psig2,
        psig: "ff".repeat(32), // Invalid signature
      };

      // Should reject the tampered signature
      expect(() => processPartialSignature(session1, tamperedSig)).toThrow();
    });
  });

  describe("verifySignature", () => {
    it("should return false for invalid signature", () => {
      const { groupPubkey } = createKeyGroupWithDealer(2, 3);
      const message = "test".repeat(16);
      const invalidSig = "00".repeat(64);

      expect(verifySignature(groupPubkey, message, invalidSig)).toBe(false);
    });

    it("should return false for wrong message", () => {
      const { shares, groupPubkey } = createKeyGroupWithDealer(2, 3);
      
      const message = "1111111111111111111111111111111111111111111111111111111111111111";
      const wrongMessage = "2222222222222222222222222222222222222222222222222222222222222222";

      const sharesWithPubkey = shares.slice(0, 2).map((share) => ({
        share,
        groupPubkey,
      }));

      const signature = signWithShares(sharesWithPubkey, message, 2);

      expect(verifySignature(groupPubkey, wrongMessage, signature)).toBe(false);
    });
  });

  describe("Key Share Refresh (Admin Rotation)", () => {
    it("should refresh shares while maintaining group pubkey", () => {
      // Create initial key group
      const { shares, groupPubkey, vssCommitments } = createKeyGroupWithDealer(2, 3);
      
      // Create key packages for all participants
      const keyPackages = shares.map((share) =>
        createKeyPackageFromShare(share, groupPubkey, vssCommitments, 2, 3)
      );

      // Each participant generates refresh shares
      const refreshPackages = keyPackages.map((pkg) => generateRefreshShares(pkg));

      // Each participant applies all refresh shares to get new key package
      const newKeyPackages = keyPackages.map((pkg) =>
        applyRefreshShares(pkg, refreshPackages)
      );

      // All new key packages should have the same group pubkey
      for (const pkg of newKeyPackages) {
        expect(pkg.groupPubkey).toBe(groupPubkey);
      }

      // Verify the new shares are valid
      for (const pkg of newKeyPackages) {
        expect(verifyRefreshedShare(pkg)).toBe(true);
      }

      // New shares should be different from original shares
      for (let i = 0; i < shares.length; i++) {
        expect(newKeyPackages[i]!.share.seckey).not.toBe(shares[i]!.seckey);
      }
    });

    it("should sign with refreshed shares", () => {
      // Create initial key group
      const { shares, groupPubkey, vssCommitments } = createKeyGroupWithDealer(2, 3);
      
      const keyPackages = shares.map((share) =>
        createKeyPackageFromShare(share, groupPubkey, vssCommitments, 2, 3)
      );

      // Refresh shares
      const refreshPackages = keyPackages.map((pkg) => generateRefreshShares(pkg));
      const newKeyPackages = keyPackages.map((pkg) =>
        applyRefreshShares(pkg, refreshPackages)
      );

      // Sign a message with the refreshed shares
      const message = "aabbccdd".repeat(8);
      
      const sharesWithPubkey = newKeyPackages.slice(0, 2).map((pkg) => ({
        share: pkg.share,
        groupPubkey: pkg.groupPubkey,
      }));

      const signature = signWithShares(sharesWithPubkey, message, 2);

      // Verify the signature using the same group public key
      expect(verifySignature(groupPubkey, message, signature)).toBe(true);
    });
  });
});
