/**
 * @nkg/signer - Distributed Key Generation (DKG) implementation
 * 
 * This module implements a simplified DKG protocol using @cmdcode/frost.
 * For production use, participants should communicate via nostr events
 * to exchange round packages.
 */

import { Lib, Util } from "@cmdcode/frost";
import { merge_share_commits } from "@cmdcode/frost/lib";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { nip44 } from "nostr-tools";

import type {
  DKGConfig,
  DKGSession,
  DKGState,
  DKGRound1Package,
  DKGRound2Package,
  KeyPackage,
  Hex,
  ParticipantId,
  SecretShare,
} from "./types.js";

// Re-export types
export type {
  DKGConfig,
  DKGSession,
  DKGRound1Package,
  DKGRound2Package,
  KeyPackage,
};

// ============================================================================
// DKG Session Management
// ============================================================================

/**
 * Create a new DKG session
 */
export function createDKGSession(config: DKGConfig): DKGSession {
  if (config.threshold < 2) {
    throw new Error("Threshold must be at least 2");
  }
  if (config.threshold > config.maxSigners) {
    throw new Error("Threshold cannot exceed max signers");
  }
  if (config.participants.length !== config.maxSigners) {
    throw new Error("Number of participants must equal max signers");
  }
  if (config.myIndex < 1 || config.myIndex > config.maxSigners) {
    throw new Error("My index must be between 1 and max signers");
  }

  return {
    config,
    state: "initialized",
    round1Packages: new Map(),
    round2Packages: new Map(),
  };
}

/**
 * Generate a random session ID
 */
export function generateSessionId(): Hex {
  return Util.random_bytes(32).hex;
}

// ============================================================================
// DKG Round 1 - Commitment Generation
// ============================================================================

/**
 * Generate Round 1 package (VSS commitments)
 * 
 * Each participant generates random coefficients for their polynomial
 * and broadcasts the commitments to all other participants.
 */
export function generateRound1Package(
  session: DKGSession
): { package: DKGRound1Package; session: DKGSession } {
  if (session.state !== "initialized") {
    throw new Error(`Invalid state for Round 1: ${session.state}`);
  }

  const { threshold, maxSigners, myIndex } = session.config;

  // Generate random coefficients for the polynomial
  // First coefficient is the participant's secret contribution
  const coefficients: bigint[] = [];
  for (let i = 0; i < threshold; i++) {
    const randomBytes = Util.random_bytes(32);
    coefficients.push(BigInt("0x" + randomBytes.hex));
  }

  // Compute VSS commitments (public points for each coefficient)
  const vssCommitments = Lib.get_share_commits(coefficients);

  const round1Package: DKGRound1Package = {
    idx: myIndex,
    vssCommitments,
  };

  // Update session state
  const updatedSession: DKGSession = {
    ...session,
    myRound1Secret: { coefficients },
    round1Packages: new Map(session.round1Packages).set(myIndex, round1Package),
  };

  return { package: round1Package, session: updatedSession };
}

/**
 * Process a Round 1 package received from another participant
 */
export function processRound1Package(
  session: DKGSession,
  pkg: DKGRound1Package
): DKGSession {
  if (session.state !== "initialized" && session.state !== "round1_complete") {
    throw new Error(`Invalid state for processing Round 1: ${session.state}`);
  }

  if (pkg.idx === session.config.myIndex) {
    throw new Error("Cannot process own Round 1 package");
  }

  if (pkg.idx < 1 || pkg.idx > session.config.maxSigners) {
    throw new Error(`Invalid participant index: ${pkg.idx}`);
  }

  if (pkg.vssCommitments.length !== session.config.threshold) {
    throw new Error(
      `Invalid VSS commitments length: expected ${session.config.threshold}, got ${pkg.vssCommitments.length}`
    );
  }

  const updatedPackages = new Map(session.round1Packages);
  updatedPackages.set(pkg.idx, pkg);

  // Check if we have all Round 1 packages
  const allReceived = updatedPackages.size === session.config.maxSigners;

  return {
    ...session,
    round1Packages: updatedPackages,
    state: allReceived ? "round1_complete" : session.state,
  };
}

// ============================================================================
// DKG Round 2 - Share Distribution
// ============================================================================

/**
 * Generate Round 2 packages (encrypted shares for each participant)
 * 
 * Each participant evaluates their polynomial at each other participant's
 * index and sends the encrypted share.
 */
export function generateRound2Packages(
  session: DKGSession
): { packages: DKGRound2Package[]; session: DKGSession } {
  if (session.state !== "round1_complete") {
    throw new Error(`Invalid state for Round 2: ${session.state}`);
  }

  if (!session.myRound1Secret) {
    throw new Error("Round 1 secret not found");
  }

  const { coefficients } = session.myRound1Secret;
  const { myIndex, participants, mySecretKey } = session.config;

  const packages: DKGRound2Package[] = [];

  // Generate a share for each other participant
  for (let toIdx = 1; toIdx <= session.config.maxSigners; toIdx++) {
    if (toIdx === myIndex) continue;

    // Evaluate polynomial at participant's index
    const shareValue = evaluatePolynomial(coefficients, BigInt(toIdx));
    const shareHex = bigintToHex(shareValue);

    // Encrypt the share for the recipient using NIP-44
    const recipientPubkey = participants[toIdx - 1];
    if (!recipientPubkey) {
      throw new Error(`No pubkey for participant ${toIdx}`);
    }
    
    const conversationKey = nip44.v2.utils.getConversationKey(
      hexToBytes(mySecretKey),
      recipientPubkey
    );
    const encryptedShare = nip44.v2.encrypt(shareHex, conversationKey);

    packages.push({
      fromIdx: myIndex,
      toIdx,
      encryptedShare,
    });
  }

  // Store our own share
  const myShareValue = evaluatePolynomial(coefficients, BigInt(myIndex));
  const myShare: SecretShare = {
    idx: myIndex,
    seckey: bigintToHex(myShareValue),
  };

  // Update session with our own round 2 "package"
  const myRound2: DKGRound2Package = {
    fromIdx: myIndex,
    toIdx: myIndex,
    encryptedShare: myShare.seckey, // Not actually encrypted for self
  };

  const updatedPackages = new Map(session.round2Packages);
  updatedPackages.set(myIndex, myRound2);

  return {
    packages,
    session: {
      ...session,
      round2Packages: updatedPackages,
    },
  };
}

/**
 * Process a Round 2 package received from another participant
 */
export function processRound2Package(
  session: DKGSession,
  pkg: DKGRound2Package
): DKGSession {
  if (session.state !== "round1_complete" && session.state !== "round2_complete") {
    throw new Error(`Invalid state for processing Round 2: ${session.state}`);
  }

  if (pkg.toIdx !== session.config.myIndex) {
    throw new Error("Round 2 package not addressed to me");
  }

  if (pkg.fromIdx === session.config.myIndex) {
    throw new Error("Cannot process own Round 2 package");
  }

  // Decrypt the share
  const senderPubkey = session.config.participants[pkg.fromIdx - 1];
  if (!senderPubkey) {
    throw new Error(`No pubkey for participant ${pkg.fromIdx}`);
  }

  const conversationKey = nip44.v2.utils.getConversationKey(
    hexToBytes(session.config.mySecretKey),
    senderPubkey
  );
  const decryptedShare = nip44.v2.decrypt(pkg.encryptedShare, conversationKey);

  // Verify the share against the sender's VSS commitments
  const senderRound1 = session.round1Packages.get(pkg.fromIdx);
  if (!senderRound1) {
    throw new Error(`No Round 1 package from participant ${pkg.fromIdx}`);
  }

  const shareObj: SecretShare = {
    idx: session.config.myIndex,
    seckey: decryptedShare,
  };

  const isValid = Lib.verify_share(
    senderRound1.vssCommitments,
    shareObj,
    session.config.threshold
  );

  if (!isValid) {
    throw new Error(`Invalid share from participant ${pkg.fromIdx}`);
  }

  // Store the decrypted share
  const decryptedPkg: DKGRound2Package = {
    ...pkg,
    encryptedShare: decryptedShare, // Store decrypted for aggregation
  };

  const updatedPackages = new Map(session.round2Packages);
  updatedPackages.set(pkg.fromIdx, decryptedPkg);

  // Check if we have all Round 2 packages
  const allReceived = updatedPackages.size === session.config.maxSigners;

  return {
    ...session,
    round2Packages: updatedPackages,
    state: allReceived ? "round2_complete" : session.state,
  };
}

// ============================================================================
// DKG Round 3 - Finalization
// ============================================================================

/**
 * Finalize the DKG session and produce the key package
 */
export function finalizeDKG(session: DKGSession): { keyPackage: KeyPackage; session: DKGSession } {
  if (session.state !== "round2_complete") {
    throw new Error(`Invalid state for finalization: ${session.state}`);
  }

  // Aggregate all shares to get final secret share
  let aggregatedSecret = 0n;
  for (const [, pkg] of session.round2Packages) {
    aggregatedSecret += BigInt("0x" + pkg.encryptedShare);
  }
  // Mod by curve order
  const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  aggregatedSecret = ((aggregatedSecret % CURVE_ORDER) + CURVE_ORDER) % CURVE_ORDER;

  const finalShare: SecretShare = {
    idx: session.config.myIndex,
    seckey: bigintToHex(aggregatedSecret),
  };

  // Aggregate VSS commitments to get group public key
  // The group public key is the sum of all participants' first VSS commitment
  const groupPubkeyPoint = aggregateFirstCommitments(session.round1Packages);

  // Aggregate all VSS commitments for verification
  const aggregatedCommitments = aggregateVSSCommitments(
    session.round1Packages,
    session.config.threshold
  );

  const keyPackage: KeyPackage = {
    share: finalShare,
    groupPubkey: groupPubkeyPoint,
    vssCommitments: aggregatedCommitments,
    threshold: session.config.threshold,
    maxSigners: session.config.maxSigners,
  };

  return {
    keyPackage,
    session: {
      ...session,
      state: "finalized",
      keyPackage,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Evaluate a polynomial at a given x value
 */
function evaluatePolynomial(coefficients: bigint[], x: bigint): bigint {
  const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  let result = 0n;
  let xPower = 1n;

  for (const coeff of coefficients) {
    result = (result + coeff * xPower) % CURVE_ORDER;
    xPower = (xPower * x) % CURVE_ORDER;
  }

  return result;
}

/**
 * Convert a bigint to a 32-byte hex string
 */
function bigintToHex(n: bigint): Hex {
  const hex = n.toString(16).padStart(64, "0");
  return hex.slice(-64); // Ensure exactly 64 chars (32 bytes)
}

/**
 * Aggregate the first VSS commitments from all participants to get group pubkey
 */
function aggregateFirstCommitments(
  round1Packages: Map<ParticipantId, DKGRound1Package>
): Hex {
  // Sort packages by participant index for deterministic ordering
  const sortedPackages = Array.from(round1Packages.entries())
    .sort(([idxA], [idxB]) => idxA - idxB);
  
  if (sortedPackages.length === 0) {
    throw new Error("No Round 1 packages to aggregate");
  }
  
  // Start with the first participant's first commitment
  let aggregated = sortedPackages[0]![1].vssCommitments[0]!;
  
  // Merge each subsequent participant's first commitment using EC point addition
  for (let i = 1; i < sortedPackages.length; i++) {
    const nextCommit = sortedPackages[i]![1].vssCommitments[0]!;
    // merge_share_commits performs EC point addition
    aggregated = merge_share_commits([aggregated], [nextCommit])[0]!;
  }
  
  return aggregated;
}

/**
 * Aggregate VSS commitments from all participants
 */
function aggregateVSSCommitments(
  round1Packages: Map<ParticipantId, DKGRound1Package>,
  threshold: number
): Hex[] {
  const result: Hex[] = [];
  
  // Sort packages by participant index for deterministic ordering
  const sortedPackages = Array.from(round1Packages.entries())
    .sort(([idxA], [idxB]) => idxA - idxB);
  
  // Aggregate each coefficient position across all participants
  for (let i = 0; i < threshold; i++) {
    // Start with the first participant's commitment at this index
    let aggregated = sortedPackages[0]![1].vssCommitments[i]!;
    
    // Merge each subsequent participant's commitment at this index
    for (let j = 1; j < sortedPackages.length; j++) {
      const nextCommit = sortedPackages[j]![1].vssCommitments[i]!;
      // merge_share_commits performs EC point addition
      aggregated = merge_share_commits([aggregated], [nextCommit])[0]!;
    }
    
    result.push(aggregated);
  }

  return result;
}

// ============================================================================
// Simplified API for Trusted Dealer Setup (for testing)
// ============================================================================

/**
 * Create a key group using a trusted dealer (for testing/development)
 * 
 * In production, use the full DKG protocol above.
 */
export function createKeyGroupWithDealer(
  threshold: number,
  maxSigners: number,
  secrets: Hex[] = []
): { shares: SecretShare[]; groupPubkey: Hex; vssCommitments: Hex[] } {
  const secretBytes = secrets.length > 0 
    ? secrets.map((s) => s) 
    : [Util.random_bytes(32).hex];

  const group = Lib.create_dealer_set(threshold, maxSigners, secretBytes);

  return {
    shares: group.shares,
    groupPubkey: group.group_pk,
    vssCommitments: group.vss_commits,
  };
}

/**
 * Create a key package from a dealer-generated share
 */
export function createKeyPackageFromShare(
  share: SecretShare,
  groupPubkey: Hex,
  vssCommitments: Hex[],
  threshold: number,
  maxSigners: number
): KeyPackage {
  return {
    share,
    groupPubkey,
    vssCommitments,
    threshold,
    maxSigners,
  };
}

// ============================================================================
// Key Share Refresh (Admin Rotation)
// ============================================================================

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
export function generateRefreshShares(
  keyPackage: KeyPackage
): RefreshSharePackage {
  const { threshold, maxSigners, share } = keyPackage;

  // Generate refresh package using frost library
  const refreshPkg = Lib.gen_refresh_shares(
    share.idx,
    threshold,
    maxSigners
  );

  return {
    fromIdx: share.idx,
    refreshShares: refreshPkg.shares,
    vssCommitments: refreshPkg.vss_commits,
  };
}

/**
 * Apply refresh shares to update a key share
 * 
 * Each participant collects refresh shares from all other participants
 * and combines them with their current share to get a new share.
 * The VSS commitments must also be updated to reflect the new polynomial.
 */
export function applyRefreshShares(
  currentKeyPackage: KeyPackage,
  refreshPackages: RefreshSharePackage[]
): KeyPackage {
  const { share, vssCommitments, threshold } = currentKeyPackage;
  
  // Collect all refresh shares destined for this participant
  const myRefreshShares: SecretShare[] = [];
  
  for (const pkg of refreshPackages) {
    // Find the refresh share for our index
    const refreshShare = pkg.refreshShares.find((s) => s.idx === share.idx);
    if (!refreshShare) {
      throw new Error(`No refresh share for index ${share.idx} from participant ${pkg.fromIdx}`);
    }
    
    myRefreshShares.push(refreshShare);
  }

  // Combine current share with all refresh shares
  const newShare = Lib.refresh_share(myRefreshShares, share);

  // Aggregate all refresh VSS commitments to get the new VSS commitments
  // The refresh shares have threshold-1 coefficients (since the constant term is 0)
  // We need to aggregate them and add to the original commitments (excluding the first one)
  let aggregatedRefreshCommits = refreshPackages[0]!.vssCommitments;
  
  for (let i = 1; i < refreshPackages.length; i++) {
    aggregatedRefreshCommits = Lib.merge_share_commits(
      aggregatedRefreshCommits,
      refreshPackages[i]!.vssCommitments
    );
  }

  // The new VSS commitments: the group pubkey stays the same (index 0),
  // but the other coefficients are updated by adding the refresh commits
  // Since refresh shares have zero constant term, the group pubkey doesn't change
  const newVssCommitments: Hex[] = [vssCommitments[0]!]; // Keep the group pubkey
  
  for (let i = 1; i < threshold; i++) {
    // Merge the original commitment at index i with the aggregated refresh commitment at i-1
    const merged = Lib.merge_share_commits(
      [vssCommitments[i]!],
      [aggregatedRefreshCommits[i - 1]!]
    );
    newVssCommitments.push(merged[0]!);
  }

  return {
    ...currentKeyPackage,
    share: newShare,
    vssCommitments: newVssCommitments,
  };
}

/**
 * Verify that a new share is valid for the same group public key
 * 
 * This can be used after refresh to verify the share still works
 * with the original group public key.
 */
export function verifyRefreshedShare(
  keyPackage: KeyPackage
): boolean {
  try {
    // Verify the share against the VSS commitments
    return Lib.verify_share(
      keyPackage.vssCommitments,
      keyPackage.share,
      keyPackage.threshold
    );
  } catch {
    return false;
  }
}
