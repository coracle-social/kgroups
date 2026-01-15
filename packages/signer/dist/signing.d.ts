/**
 * @nkg/signer - Threshold signing implementation
 *
 * This module implements FROST threshold signing using @cmdcode/frost.
 * For production use, participants should communicate via nostr events
 * to exchange nonce commitments and partial signatures.
 */
import type { KeyPackage, SigningConfig, SigningSession, CommitmentPackage, PublicNonce, PartialSignature, Hex } from "./types.js";
export type { SigningConfig, SigningSession, CommitmentPackage, PublicNonce, PartialSignature, };
/**
 * Create a new signing session
 */
export declare function createSigningSession(config: SigningConfig, keyPackage: KeyPackage): SigningSession;
/**
 * Generate a random session ID for signing
 */
export declare function generateSigningSessionId(): Hex;
/**
 * Generate nonce commitment for the signing session
 *
 * Each participating signer generates a random nonce pair and
 * broadcasts the public nonces to other participants.
 */
export declare function generateNonceCommitment(session: SigningSession): {
    publicNonce: PublicNonce;
    session: SigningSession;
};
/**
 * Process a public nonce received from another participant
 */
export declare function processPublicNonce(session: SigningSession, nonce: PublicNonce): SigningSession;
/**
 * Check if all nonce commitments have been received
 */
export declare function hasAllNonces(session: SigningSession): boolean;
/**
 * Generate partial signature for the signing session
 *
 * Once all nonce commitments have been received, each participant
 * generates their partial signature.
 */
export declare function generatePartialSignature(session: SigningSession): {
    partialSig: PartialSignature;
    session: SigningSession;
};
/**
 * Process a partial signature received from another participant
 */
export declare function processPartialSignature(session: SigningSession, partialSig: PartialSignature): SigningSession;
/**
 * Check if all partial signatures have been received
 */
export declare function hasAllPartialSignatures(session: SigningSession): boolean;
/**
 * Aggregate partial signatures into a final signature
 */
export declare function aggregateSignatures(session: SigningSession): {
    signature: Hex;
    session: SigningSession;
};
/**
 * Sign a message with a group of shares in a single operation
 *
 * This is a simplified API for testing that performs all signing
 * rounds synchronously. In production, use the session-based API.
 */
export declare function signWithShares(shares: {
    share: {
        idx: number;
        seckey: Hex;
    };
    groupPubkey: Hex;
}[], message: Hex, threshold: number): Hex;
/**
 * Verify a signature against a group public key
 */
export declare function verifySignature(groupPubkey: Hex, message: Hex, signature: Hex): boolean;
//# sourceMappingURL=signing.d.ts.map