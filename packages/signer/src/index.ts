// @nkg/signer - MPC/DKG key generation and threshold signing

// Types
export * from "./types.js";

// DKG - Distributed Key Generation
export {
  // Session management
  createDKGSession,
  generateSessionId,
  // Round 1
  generateRound1Package,
  processRound1Package,
  // Round 2
  generateRound2Packages,
  processRound2Package,
  // Finalization
  finalizeDKG,
  // Simplified API (trusted dealer)
  createKeyGroupWithDealer,
  createKeyPackageFromShare,
  // Key share refresh (admin rotation)
  generateRefreshShares,
  applyRefreshShares,
  verifyRefreshedShare,
  type RefreshSharePackage,
} from "./dkg.js";

// Signing - Threshold signatures
export {
  // Session management
  createSigningSession,
  generateSigningSessionId,
  // Round 1 - Nonce commitments
  generateNonceCommitment,
  processPublicNonce,
  hasAllNonces,
  // Round 2 - Partial signatures
  generatePartialSignature,
  processPartialSignature,
  hasAllPartialSignatures,
  // Aggregation
  aggregateSignatures,
  // Simplified API
  signWithShares,
  verifySignature,
} from "./signing.js";

// Re-export key types for convenience
export type {
  DKGConfig,
  DKGSession,
  DKGRound1Package,
  DKGRound2Package,
  KeyPackage,
} from "./dkg.js";

export type {
  SigningConfig,
  SigningSession,
  CommitmentPackage,
  PublicNonce,
  PartialSignature,
} from "./signing.js";
