/**
 * @nkg/cap - Capability issuance and management
 */
import { type Event, type UnsignedEvent } from "nostr-tools";
import { type Capability, type CapabilityEvent, type CapabilityQualifier, type CapabilityType, type EventId, type Pubkey, type RevocationEvent, type Timestamp } from "./types.js";
/**
 * Create an unsigned capability grant event
 */
export declare function createCapabilityGrantEvent(holder: Pubkey, type: CapabilityType, groupPubkey: Pubkey, options?: {
    qualifiers?: CapabilityQualifier;
    expiresAt?: Timestamp;
    groupId?: string;
}): UnsignedEvent;
/**
 * Create an unsigned capability revocation event
 */
export declare function createCapabilityRevocationEvent(eventIdToRevoke: EventId, groupPubkey: Pubkey, reason?: string): UnsignedEvent;
/**
 * Create an unsigned capability delegation event
 *
 * Used when a holder with "delegate" capability wants to
 * create a chained capability for another pubkey.
 */
export declare function createCapabilityDelegationEvent(originalCapabilityEventId: EventId, newHolder: Pubkey, delegatorPubkey: Pubkey, type: CapabilityType, options?: {
    qualifiers?: CapabilityQualifier;
    expiresAt?: Timestamp;
}): UnsignedEvent;
/**
 * Parse a capability grant event
 */
export declare function parseCapabilityGrantEvent(event: Event): CapabilityEvent | null;
/**
 * Parse a capability revocation event
 */
export declare function parseRevocationEvent(event: Event): RevocationEvent | null;
/**
 * Parse a capability delegation event
 */
export declare function parseDelegationEvent(event: Event, originalCapability: Capability): CapabilityEvent | null;
/**
 * Check if a capability allows a specific action
 */
export declare function capabilityAllowsAction(capability: Capability, action: CapabilityType, eventKind?: number): boolean;
/**
 * Check if a capability is expired
 */
export declare function isCapabilityExpired(capability: Capability, currentTime?: Timestamp): boolean;
/**
 * Check if an event matches the required tags qualifier
 */
export declare function eventMatchesRequiredTags(eventTags: string[][], requiredTags: [string, string][]): boolean;
/**
 * Check if an event has any excluded tags
 */
export declare function eventHasExcludedTags(eventTags: string[][], excludedTags: [string, string][]): boolean;
//# sourceMappingURL=capability.d.ts.map