/**
 * @nkg/signer - Type definitions for MPC/DKG key management
 */
// ============================================================================
// Nostr Event Types for DKG/Signing Protocol
// ============================================================================
/** Event kinds for DKG protocol messages */
export const DKG_EVENT_KINDS = {
    /** DKG session initiation */
    SESSION_INIT: 28000,
    /** DKG Round 1 package (broadcast) */
    ROUND1_PACKAGE: 28001,
    /** DKG Round 2 package (encrypted, direct) */
    ROUND2_PACKAGE: 28002,
    /** DKG completion confirmation */
    COMPLETION: 28003,
};
/** Event kinds for signing protocol messages */
export const SIGNING_EVENT_KINDS = {
    /** Signing session initiation */
    SESSION_INIT: 28010,
    /** Nonce commitment (broadcast) */
    NONCE_COMMITMENT: 28011,
    /** Partial signature */
    PARTIAL_SIGNATURE: 28012,
    /** Final signature broadcast */
    FINAL_SIGNATURE: 28013,
};
/** Tags used in DKG/signing events */
export const PROTOCOL_TAGS = {
    /** Session ID tag */
    SESSION: "session",
    /** Participant index tag */
    INDEX: "idx",
    /** Round number tag */
    ROUND: "round",
    /** Recipient pubkey tag (for encrypted messages) */
    RECIPIENT: "p",
};
//# sourceMappingURL=types.js.map