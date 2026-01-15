/**
 * @nkg/signer - Distributed Key Generation (DKG) implementation
 *
 * This module implements a simplified DKG protocol using @cmdcode/frost.
 * For production use, participants should communicate via nostr events
 * to exchange round packages.
 */
import type { DKGConfig, DKGSession, DKGRound1Package, DKGRound2Package, KeyPackage, Hex, SecretShare } from "./types.js";
export type { DKGConfig, DKGSession, DKGRound1Package, DKGRound2Package, KeyPackage, };
/**
 * Create a new DKG session
 */
export declare function createDKGSession(config: DKGConfig): DKGSession;
/**
 * Generate a random session ID
 */
export declare function generateSessionId(): Hex;
/**
 * Generate Round 1 package (VSS commitments)
 *
 * Each participant generates random coefficients for their polynomial
 * and broadcasts the commitments to all other participants.
 */
export declare function generateRound1Package(session: DKGSession): {
    package: DKGRound1Package;
    session: DKGSession;
};
/**
 * Process a Round 1 package received from another participant
 */
export declare function processRound1Package(session: DKGSession, pkg: DKGRound1Package): DKGSession;
/**
 * Generate Round 2 packages (encrypted shares for each participant)
 *
 * Each participant evaluates their polynomial at each other participant's
 * index and sends the encrypted share.
 */
export declare function generateRound2Packages(session: DKGSession): {
    packages: DKGRound2Package[];
    session: DKGSession;
};
/**
 * Process a Round 2 package received from another participant
 */
export declare function processRound2Package(session: DKGSession, pkg: DKGRound2Package): DKGSession;
/**
 * Finalize the DKG session and produce the key package
 */
export declare function finalizeDKG(session: DKGSession): {
    keyPackage: KeyPackage;
    session: DKGSession;
};
/**
 * Create a key group using a trusted dealer (for testing/development)
 *
 * In production, use the full DKG protocol above.
 */
export declare function createKeyGroupWithDealer(threshold: number, maxSigners: number, secrets?: Hex[]): {
    shares: SecretShare[];
    groupPubkey: Hex;
    vssCommitments: Hex[];
};
/**
 * Create a key package from a dealer-generated share
 */
export declare function createKeyPackageFromShare(share: SecretShare, groupPubkey: Hex, vssCommitments: Hex[], threshold: number, maxSigners: number): KeyPackage;
/** Refresh share package from a participant */
export interface RefreshSharePackage {
    /** Participant index who generated the refresh */
    fromIdx: number;
    /** The refresh shares for each participant */
    refreshShares: SecretShare[];
    /** VSS commitments for verification */
    vssCommitments: Hex[];
}
/**
 * Generate refresh shares for key rotation
 *
 * This allows rotating admins without changing the group public key.
 * Each current admin generates refresh shares and distributes them.
 * The new shares, when combined with existing shares, produce new
 * valid shares for the same group public key.
 */
export declare function generateRefreshShares(keyPackage: KeyPackage): RefreshSharePackage;
/**
 * Apply refresh shares to update a key share
 *
 * Each participant collects refresh shares from all other participants
 * and combines them with their current share to get a new share.
 * The VSS commitments must also be updated to reflect the new polynomial.
 */
export declare function applyRefreshShares(currentKeyPackage: KeyPackage, refreshPackages: RefreshSharePackage[]): KeyPackage;
/**
 * Verify that a new share is valid for the same group public key
 *
 * This can be used after refresh to verify the share still works
 * with the original group public key.
 */
export declare function verifyRefreshedShare(keyPackage: KeyPackage): boolean;
//# sourceMappingURL=dkg.d.ts.map