/**
 * @nkg/cap - Capability validation
 */
import { type Event } from "nostr-tools";
import { type Capability, type CapabilityType, type EventId, type Pubkey, type Timestamp, type ValidationContext, type ValidationResult } from "./types.js";
/**
 * Validate a capability grant event
 */
export declare function validateCapabilityEvent(event: Event, expectedGroupPubkey: Pubkey, context: ValidationContext): ValidationResult;
/**
 * Validate a delegated capability
 */
export declare function validateDelegatedCapability(delegationEvent: Event, originalCapabilityEvent: Event, expectedGroupPubkey: Pubkey, context: ValidationContext): ValidationResult;
/**
 * Check if a pubkey is authorized to perform an action
 */
export declare function checkAuthorization(capabilities: Capability[], pubkey: Pubkey, action: CapabilityType, context?: {
    eventKind?: number;
    eventTags?: string[][];
    currentTime?: Timestamp;
}): {
    authorized: boolean;
    capability?: Capability;
    error?: string;
};
/**
 * Simple in-memory capability store for managing capabilities
 */
export declare class CapabilityStore {
    private capabilities;
    private revokedIds;
    private byHolder;
    private byIssuer;
    /**
     * Add a capability event to the store
     */
    addCapability(event: Event, groupPubkey: Pubkey): ValidationResult;
    /**
     * Process a revocation event
     */
    addRevocation(event: Event, groupPubkey: Pubkey): boolean;
    /**
     * Get all capabilities for a holder
     */
    getCapabilitiesForHolder(holder: Pubkey): Capability[];
    /**
     * Get all capabilities issued by a group
     */
    getCapabilitiesForIssuer(issuer: Pubkey): Capability[];
    /**
     * Check if a pubkey is authorized for an action
     */
    checkAuthorization(pubkey: Pubkey, action: CapabilityType, context?: {
        eventKind?: number;
        eventTags?: string[][];
    }): {
        authorized: boolean;
        capability?: Capability;
        error?: string;
    };
    /**
     * Check if an event ID has been revoked
     */
    isRevoked(eventId: EventId): boolean;
    /**
     * Get all revoked event IDs
     */
    getRevokedIds(): Set<EventId>;
    /**
     * Clear all stored capabilities
     */
    clear(): void;
}
//# sourceMappingURL=validation.d.ts.map