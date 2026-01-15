/**
 * @nkg/signer - Type definitions for MPC/DKG key management
 */
/** Hex-encoded string */
export type Hex = string;
/** Participant identifier in a DKG session */
export type ParticipantId = number;
/** Nostr pubkey (32-byte hex) */
export type Pubkey = string;
/** A secret share held by a participant */
export interface SecretShare {
    /** Participant index (1-based) */
    idx: number;
    /** The secret key share (32-byte hex) */
    seckey: Hex;
}
/** A public share (the public key corresponding to a secret share) */
export interface PublicShare {
    /** Participant index (1-based) */
    idx: number;
    /** The public key (33-byte hex, compressed) */
    pubkey: Hex;
}
/** Complete key package for a participant */
export interface KeyPackage {
    /** The participant's secret share */
    share: SecretShare;
    /** The group public key (the nostr pubkey for the group) */
    groupPubkey: Hex;
    /** VSS commitments for verification */
    vssCommitments: Hex[];
    /** Threshold required for signing */
    threshold: number;
    /** Maximum number of shares */
    maxSigners: number;
}
/** Serialized key package for storage */
export interface SerializedKeyPackage {
    /** Version for forward compatibility */
    version: 1;
    /** The key package data */
    data: KeyPackage;
}
/** State of a DKG session */
export type DKGState = "initialized" | "round1_complete" | "round2_complete" | "finalized" | "failed";
/** DKG Round 1 package (commitment) */
export interface DKGRound1Package {
    /** Participant index */
    idx: number;
    /** VSS commitments */
    vssCommitments: Hex[];
    /** Proof of knowledge (optional, for verification) */
    proofOfKnowledge?: Hex;
}
/** DKG Round 2 package (share distribution) */
export interface DKGRound2Package {
    /** Sender participant index */
    fromIdx: number;
    /** Recipient participant index */
    toIdx: number;
    /** Encrypted secret share for the recipient */
    encryptedShare: Hex;
}
/** Configuration for a DKG session */
export interface DKGConfig {
    /** Session identifier (random hex string) */
    sessionId: Hex;
    /** Minimum signers required (threshold) */
    threshold: number;
    /** Maximum number of signers */
    maxSigners: number;
    /** List of participant nostr pubkeys */
    participants: Pubkey[];
    /** This participant's index */
    myIndex: number;
    /** This participant's nostr secret key (for encryption) */
    mySecretKey: Hex;
}
/** DKG session state (for a single participant) */
export interface DKGSession {
    /** Session configuration */
    config: DKGConfig;
    /** Current state */
    state: DKGState;
    /** Round 1 packages received from other participants */
    round1Packages: Map<ParticipantId, DKGRound1Package>;
    /** Round 2 packages received from other participants */
    round2Packages: Map<ParticipantId, DKGRound2Package>;
    /** This participant's round 1 secret (kept locally) */
    myRound1Secret?: {
        coefficients: bigint[];
    };
    /** Final key package (after finalization) */
    keyPackage?: KeyPackage;
}
/** Secret nonce for a signing session */
export interface SecretNonce {
    /** Participant index */
    idx: number;
    /** Hidden secret nonce */
    hidden_sn: Hex;
    /** Binder secret nonce */
    binder_sn: Hex;
}
/** Public nonce (commitment) for a signing session */
export interface PublicNonce {
    /** Participant index */
    idx: number;
    /** Hidden public nonce */
    hidden_pn: Hex;
    /** Binder public nonce */
    binder_pn: Hex;
}
/** Commitment package for a signing session */
export interface CommitmentPackage extends SecretNonce, PublicNonce {
}
/** Partial signature from a participant */
export interface PartialSignature {
    /** Participant index */
    idx: number;
    /** Partial signature value */
    psig: Hex;
    /** Public key of the signer */
    pubkey: Hex;
}
/** Configuration for a signing session */
export interface SigningConfig {
    /** Session identifier */
    sessionId: Hex;
    /** The message to sign (hex-encoded) */
    message: Hex;
    /** The group public key */
    groupPubkey: Hex;
    /** Participating signer indices */
    signerIndices: number[];
}
/** Signing session state */
export interface SigningSession {
    /** Session configuration */
    config: SigningConfig;
    /** This participant's key package */
    keyPackage: KeyPackage;
    /** This participant's commitment (nonces) */
    myCommitment?: CommitmentPackage;
    /** Public nonces received from other participants */
    publicNonces: Map<ParticipantId, PublicNonce>;
    /** Partial signatures received */
    partialSignatures: Map<ParticipantId, PartialSignature>;
    /** Final aggregated signature */
    finalSignature?: Hex;
}
/** Event kinds for DKG protocol messages */
export declare const DKG_EVENT_KINDS: {
    /** DKG session initiation */
    readonly SESSION_INIT: 28000;
    /** DKG Round 1 package (broadcast) */
    readonly ROUND1_PACKAGE: 28001;
    /** DKG Round 2 package (encrypted, direct) */
    readonly ROUND2_PACKAGE: 28002;
    /** DKG completion confirmation */
    readonly COMPLETION: 28003;
};
/** Event kinds for signing protocol messages */
export declare const SIGNING_EVENT_KINDS: {
    /** Signing session initiation */
    readonly SESSION_INIT: 28010;
    /** Nonce commitment (broadcast) */
    readonly NONCE_COMMITMENT: 28011;
    /** Partial signature */
    readonly PARTIAL_SIGNATURE: 28012;
    /** Final signature broadcast */
    readonly FINAL_SIGNATURE: 28013;
};
/** Tags used in DKG/signing events */
export declare const PROTOCOL_TAGS: {
    /** Session ID tag */
    readonly SESSION: "session";
    /** Participant index tag */
    readonly INDEX: "idx";
    /** Round number tag */
    readonly ROUND: "round";
    /** Recipient pubkey tag (for encrypted messages) */
    readonly RECIPIENT: "p";
};
//# sourceMappingURL=types.d.ts.map