/**
 * @nkg/signer - Threshold signing implementation
 * 
 * This module implements FROST threshold signing using @cmdcode/frost.
 * For production use, participants should communicate via nostr events
 * to exchange nonce commitments and partial signatures.
 */

import { Lib, Util } from "@cmdcode/frost";

import type {
  KeyPackage,
  SigningConfig,
  SigningSession,
  CommitmentPackage,
  PublicNonce,
  PartialSignature,
  SecretNonce,
  Hex,
  ParticipantId,
} from "./types.js";

// Re-export types
export type {
  SigningConfig,
  SigningSession,
  CommitmentPackage,
  PublicNonce,
  PartialSignature,
};

// ============================================================================
// Signing Session Management
// ============================================================================

/**
 * Create a new signing session
 */
export function createSigningSession(
  config: SigningConfig,
  keyPackage: KeyPackage
): SigningSession {
  if (config.signerIndices.length < keyPackage.threshold) {
    throw new Error(
      `Not enough signers: need ${keyPackage.threshold}, got ${config.signerIndices.length}`
    );
  }

  if (!config.signerIndices.includes(keyPackage.share.idx)) {
    throw new Error("This participant is not in the signer list");
  }

  return {
    config,
    keyPackage,
    publicNonces: new Map(),
    partialSignatures: new Map(),
  };
}

/**
 * Generate a random session ID for signing
 */
export function generateSigningSessionId(): Hex {
  return Util.random_bytes(32).hex;
}

// ============================================================================
// Round 1 - Nonce Commitment Generation
// ============================================================================

/**
 * Generate nonce commitment for the signing session
 * 
 * Each participating signer generates a random nonce pair and
 * broadcasts the public nonces to other participants.
 */
export function generateNonceCommitment(
  session: SigningSession
): { publicNonce: PublicNonce; session: SigningSession } {
  if (session.myCommitment) {
    throw new Error("Nonce commitment already generated for this session");
  }

  // Use @cmdcode/frost to create the commitment package
  const commitment = Lib.create_commit_pkg(session.keyPackage.share);

  // Extract public nonce for broadcasting
  const publicNonce: PublicNonce = {
    idx: commitment.idx,
    hidden_pn: commitment.hidden_pn,
    binder_pn: commitment.binder_pn,
  };

  // Update session with our commitment
  const updatedNonces = new Map(session.publicNonces);
  updatedNonces.set(commitment.idx, publicNonce);

  return {
    publicNonce,
    session: {
      ...session,
      myCommitment: commitment,
      publicNonces: updatedNonces,
    },
  };
}

/**
 * Process a public nonce received from another participant
 */
export function processPublicNonce(
  session: SigningSession,
  nonce: PublicNonce
): SigningSession {
  if (!session.config.signerIndices.includes(nonce.idx)) {
    throw new Error(`Participant ${nonce.idx} is not in the signer list`);
  }

  if (nonce.idx === session.keyPackage.share.idx && !session.myCommitment) {
    throw new Error("Received own nonce before generating commitment");
  }

  const updatedNonces = new Map(session.publicNonces);
  updatedNonces.set(nonce.idx, nonce);

  return {
    ...session,
    publicNonces: updatedNonces,
  };
}

/**
 * Check if all nonce commitments have been received
 */
export function hasAllNonces(session: SigningSession): boolean {
  return session.publicNonces.size === session.config.signerIndices.length;
}

// ============================================================================
// Round 2 - Partial Signature Generation
// ============================================================================

/**
 * Generate partial signature for the signing session
 * 
 * Once all nonce commitments have been received, each participant
 * generates their partial signature.
 */
export function generatePartialSignature(
  session: SigningSession
): { partialSig: PartialSignature; session: SigningSession } {
  if (!session.myCommitment) {
    throw new Error("Nonce commitment not generated");
  }

  if (!hasAllNonces(session)) {
    throw new Error("Not all nonce commitments received");
  }

  // Collect all public nonces in order
  const pnonces: PublicNonce[] = session.config.signerIndices
    .map((idx) => session.publicNonces.get(idx))
    .filter((n): n is PublicNonce => n !== undefined);

  // Get the signing context
  const ctx = Lib.get_group_signing_ctx(
    session.keyPackage.groupPubkey,
    pnonces,
    session.config.message
  );

  // Get the commitment package for our share
  const commit = Lib.get_commit_pkg(
    [session.myCommitment],
    session.keyPackage.share
  );

  // Generate the partial signature
  const sig = Lib.sign_msg(ctx, session.keyPackage.share, commit);

  // Verify our own partial signature
  const pnonce: PublicNonce = {
    idx: session.myCommitment.idx,
    hidden_pn: session.myCommitment.hidden_pn,
    binder_pn: session.myCommitment.binder_pn,
  };

  const isValid = Lib.verify_partial_sig(ctx, pnonce, sig.pubkey, sig.psig);
  if (!isValid) {
    throw new Error("Generated invalid partial signature");
  }

  const partialSig: PartialSignature = {
    idx: sig.idx,
    psig: sig.psig,
    pubkey: sig.pubkey,
  };

  // Update session with our partial signature
  const updatedSigs = new Map(session.partialSignatures);
  updatedSigs.set(sig.idx, partialSig);

  return {
    partialSig,
    session: {
      ...session,
      partialSignatures: updatedSigs,
    },
  };
}

/**
 * Process a partial signature received from another participant
 */
export function processPartialSignature(
  session: SigningSession,
  partialSig: PartialSignature
): SigningSession {
  if (!hasAllNonces(session)) {
    throw new Error("Cannot process partial signatures before all nonces received");
  }

  if (!session.config.signerIndices.includes(partialSig.idx)) {
    throw new Error(`Participant ${partialSig.idx} is not in the signer list`);
  }

  // Verify the partial signature
  const pnonces: PublicNonce[] = session.config.signerIndices
    .map((idx) => session.publicNonces.get(idx))
    .filter((n): n is PublicNonce => n !== undefined);

  const ctx = Lib.get_group_signing_ctx(
    session.keyPackage.groupPubkey,
    pnonces,
    session.config.message
  );

  const pnonce = session.publicNonces.get(partialSig.idx);
  if (!pnonce) {
    throw new Error(`No nonce for participant ${partialSig.idx}`);
  }

  const isValid = Lib.verify_partial_sig(
    ctx,
    pnonce,
    partialSig.pubkey,
    partialSig.psig
  );

  if (!isValid) {
    throw new Error(`Invalid partial signature from participant ${partialSig.idx}`);
  }

  const updatedSigs = new Map(session.partialSignatures);
  updatedSigs.set(partialSig.idx, partialSig);

  return {
    ...session,
    partialSignatures: updatedSigs,
  };
}

/**
 * Check if all partial signatures have been received
 */
export function hasAllPartialSignatures(session: SigningSession): boolean {
  return session.partialSignatures.size === session.config.signerIndices.length;
}

// ============================================================================
// Signature Aggregation
// ============================================================================

/**
 * Aggregate partial signatures into a final signature
 */
export function aggregateSignatures(
  session: SigningSession
): { signature: Hex; session: SigningSession } {
  if (!hasAllPartialSignatures(session)) {
    throw new Error("Not all partial signatures received");
  }

  // Collect all public nonces in order
  const pnonces: PublicNonce[] = session.config.signerIndices
    .map((idx) => session.publicNonces.get(idx))
    .filter((n): n is PublicNonce => n !== undefined);

  // Get the signing context
  const ctx = Lib.get_group_signing_ctx(
    session.keyPackage.groupPubkey,
    pnonces,
    session.config.message
  );

  // Collect partial signatures
  const psigs = session.config.signerIndices
    .map((idx) => session.partialSignatures.get(idx))
    .filter((s): s is PartialSignature => s !== undefined);

  // Aggregate the signatures
  const signature = Lib.combine_partial_sigs(ctx, psigs);

  // Verify the final signature
  const isValid = Lib.verify_final_sig(
    Lib.get_group_key_context(session.keyPackage.groupPubkey),
    session.config.message,
    signature
  );

  if (!isValid) {
    throw new Error("Final signature verification failed");
  }

  return {
    signature,
    session: {
      ...session,
      finalSignature: signature,
    },
  };
}

// ============================================================================
// Simplified API for Single-Round Signing (for testing)
// ============================================================================

/**
 * Sign a message with a group of shares in a single operation
 * 
 * This is a simplified API for testing that performs all signing
 * rounds synchronously. In production, use the session-based API.
 */
export function signWithShares(
  shares: { share: { idx: number; seckey: Hex }; groupPubkey: Hex }[],
  message: Hex,
  threshold: number
): Hex {
  if (shares.length < threshold) {
    throw new Error(`Not enough shares: need ${threshold}, got ${shares.length}`);
  }

  // Select threshold shares
  const selectedShares = shares.slice(0, threshold);
  const groupPubkey = selectedShares[0]!.groupPubkey;

  // Generate commitments
  const commits = selectedShares.map((s) =>
    Lib.create_commit_pkg(s.share)
  );

  // Get signing context
  const pnonces: PublicNonce[] = commits.map((c) => ({
    idx: c.idx,
    hidden_pn: c.hidden_pn,
    binder_pn: c.binder_pn,
  }));

  const ctx = Lib.get_group_signing_ctx(groupPubkey, pnonces, message);

  // Generate partial signatures
  const psigs = selectedShares.map((s, i) => {
    const commit = Lib.get_commit_pkg(commits, s.share);
    return Lib.sign_msg(ctx, s.share, commit);
  });

  // Aggregate signatures
  const signature = Lib.combine_partial_sigs(ctx, psigs);

  // Verify
  const isValid = Lib.verify_final_sig(
    Lib.get_group_key_context(groupPubkey),
    message,
    signature
  );

  if (!isValid) {
    throw new Error("Signature verification failed");
  }

  return signature;
}

/**
 * Verify a signature against a group public key
 */
export function verifySignature(
  groupPubkey: Hex,
  message: Hex,
  signature: Hex
): boolean {
  try {
    return Lib.verify_final_sig(
      Lib.get_group_key_context(groupPubkey),
      message,
      signature
    );
  } catch {
    return false;
  }
}
