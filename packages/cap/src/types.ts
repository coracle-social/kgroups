/**
 * @nkg/cap - Type definitions for capability system
 */

import type { Event } from "nostr-tools";

// ============================================================================
// Core Types
// ============================================================================

/** Hex-encoded string */
export type Hex = string;

/** Nostr pubkey (32-byte hex) */
export type Pubkey = string;

/** Nostr event ID (32-byte hex) */
export type EventId = string;

/** Unix timestamp in seconds */
export type Timestamp = number;

// ============================================================================
// Capability Types
// ============================================================================

/** Types of capabilities that can be granted */
export type CapabilityType =
  | "read"      // Can read group content
  | "write"     // Can write group content  
  | "publish"   // Can publish on behalf of the group
  | "delete"    // Can delete group content
  | "delegate"; // Can create chained capabilities

/** Qualifiers that restrict a capability's scope */
export interface CapabilityQualifier {
  /** Restrict to specific event kinds */
  kinds?: number[];
  /** Require events to have these tags */
  requiredTags?: [string, string][];
  /** Exclude events with these tags */
  excludedTags?: [string, string][];
  /** Maximum events per time period (rate limiting) */
  rateLimit?: {
    count: number;
    periodSeconds: number;
  };
}

/** A capability granted to a pubkey */
export interface Capability {
  /** The type of capability */
  type: CapabilityType;
  /** The pubkey that holds this capability */
  holder: Pubkey;
  /** The group pubkey that issued this capability */
  issuer: Pubkey;
  /** Qualifiers restricting the capability */
  qualifiers?: CapabilityQualifier;
  /** When the capability was issued (unix timestamp) */
  issuedAt: Timestamp;
  /** When the capability expires (unix timestamp, optional) */
  expiresAt?: Timestamp;
  /** If this is a delegated capability, the chain of delegation */
  delegationChain?: DelegationLink[];
}

/** A link in a delegation chain */
export interface DelegationLink {
  /** The pubkey that delegated */
  delegator: Pubkey;
  /** The pubkey that received the delegation */
  delegatee: Pubkey;
  /** The event ID of the delegation */
  eventId: EventId;
}

// ============================================================================
// Capability Event Types (Nostr Events)
// ============================================================================

/** Event kind for capability events */
export const CAPABILITY_EVENT_KINDS = {
  /** Capability grant event */
  GRANT: 29000,
  /** Capability revocation event */
  REVOKE: 29001,
  /** Capability delegation event */
  DELEGATE: 29002,
} as const;

/** Tags used in capability events */
export const CAPABILITY_TAGS = {
  /** Holder pubkey tag */
  HOLDER: "p",
  /** Capability type tag */
  TYPE: "capability",
  /** Event kinds qualifier tag */
  KINDS: "kinds",
  /** Required tags qualifier tag */
  REQUIRED_TAGS: "required-tags",
  /** Excluded tags qualifier tag */
  EXCLUDED_TAGS: "excluded-tags",
  /** Rate limit qualifier tag */
  RATE_LIMIT: "rate-limit",
  /** Expiration tag */
  EXPIRATION: "expiration",
  /** Reference to original capability (for revocation/delegation) */
  REFERENCE: "e",
  /** Group identifier tag */
  GROUP: "h",
} as const;

/** Parsed capability from a nostr event */
export interface CapabilityEvent {
  /** The nostr event */
  event: Event;
  /** The parsed capability */
  capability: Capability;
}

/** Revocation event data */
export interface RevocationEvent {
  /** The nostr event */
  event: Event;
  /** The event ID being revoked */
  revokedEventId: EventId;
  /** The group pubkey */
  groupPubkey: Pubkey;
  /** When the revocation occurred */
  revokedAt: Timestamp;
}

// ============================================================================
// Validation Types
// ============================================================================

/** Result of capability validation */
export interface ValidationResult {
  /** Whether the capability is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** The validated capability if valid */
  capability?: Capability;
}

/** Context for validating a capability */
export interface ValidationContext {
  /** Current timestamp for expiration checks */
  currentTime: Timestamp;
  /** Set of revoked event IDs */
  revokedEventIds: Set<EventId>;
  /** Function to verify event signatures */
  verifySignature?: (event: Event) => boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/** Filter for querying capabilities */
export interface CapabilityFilter {
  /** Filter by holder pubkey */
  holder?: Pubkey;
  /** Filter by capability type */
  type?: CapabilityType;
  /** Filter by issuer (group pubkey) */
  issuer?: Pubkey;
  /** Only include non-expired capabilities */
  activeOnly?: boolean;
  /** Filter by event kind (from qualifiers) */
  forKind?: number;
}
