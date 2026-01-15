/**
 * @nkg/cap - Capability validation
 */
import { verifyEvent } from "nostr-tools";
import { parseCapabilityGrantEvent, parseDelegationEvent, parseRevocationEvent, isCapabilityExpired, capabilityAllowsAction, eventMatchesRequiredTags, eventHasExcludedTags, } from "./capability.js";
import { CAPABILITY_EVENT_KINDS, } from "./types.js";
// ============================================================================
// Capability Validation
// ============================================================================
/**
 * Validate a capability grant event
 */
export function validateCapabilityEvent(event, expectedGroupPubkey, context) {
    // Verify event signature
    if (context.verifySignature) {
        if (!context.verifySignature(event)) {
            return { valid: false, error: "Invalid event signature" };
        }
    }
    else {
        if (!verifyEvent(event)) {
            return { valid: false, error: "Invalid event signature" };
        }
    }
    // Check event kind
    if (event.kind !== CAPABILITY_EVENT_KINDS.GRANT) {
        return { valid: false, error: "Invalid event kind" };
    }
    // Check issuer
    if (event.pubkey !== expectedGroupPubkey) {
        return { valid: false, error: "Capability not issued by expected group" };
    }
    // Parse the capability
    const capEvent = parseCapabilityGrantEvent(event);
    if (!capEvent) {
        return { valid: false, error: "Failed to parse capability event" };
    }
    // Check if revoked
    if (context.revokedEventIds.has(event.id)) {
        return { valid: false, error: "Capability has been revoked" };
    }
    // Check expiration
    if (isCapabilityExpired(capEvent.capability, context.currentTime)) {
        return { valid: false, error: "Capability has expired" };
    }
    return { valid: true, capability: capEvent.capability };
}
/**
 * Validate a delegated capability
 */
export function validateDelegatedCapability(delegationEvent, originalCapabilityEvent, expectedGroupPubkey, context) {
    // First validate the original capability
    const originalResult = validateCapabilityEvent(originalCapabilityEvent, expectedGroupPubkey, context);
    if (!originalResult.valid || !originalResult.capability) {
        return {
            valid: false,
            error: `Original capability invalid: ${originalResult.error}`,
        };
    }
    // Check that original capability allows delegation
    if (originalResult.capability.type !== "delegate") {
        return {
            valid: false,
            error: "Original capability does not allow delegation",
        };
    }
    // Verify delegation event signature
    if (context.verifySignature) {
        if (!context.verifySignature(delegationEvent)) {
            return { valid: false, error: "Invalid delegation event signature" };
        }
    }
    else {
        if (!verifyEvent(delegationEvent)) {
            return { valid: false, error: "Invalid delegation event signature" };
        }
    }
    // Check that delegator is the holder of original capability
    if (delegationEvent.pubkey !== originalResult.capability.holder) {
        return {
            valid: false,
            error: "Delegation not signed by capability holder",
        };
    }
    // Check if delegation is revoked
    if (context.revokedEventIds.has(delegationEvent.id)) {
        return { valid: false, error: "Delegation has been revoked" };
    }
    // Parse the delegation
    const delegatedCap = parseDelegationEvent(delegationEvent, originalResult.capability);
    if (!delegatedCap) {
        return { valid: false, error: "Failed to parse delegation event" };
    }
    // Check expiration of delegated capability
    if (isCapabilityExpired(delegatedCap.capability, context.currentTime)) {
        return { valid: false, error: "Delegated capability has expired" };
    }
    // Validate that delegated qualifiers are a subset of original
    const subsetResult = validateQualifiersSubset(originalResult.capability, delegatedCap.capability);
    if (!subsetResult.valid) {
        return subsetResult;
    }
    return { valid: true, capability: delegatedCap.capability };
}
/**
 * Validate that delegated qualifiers are a subset of original
 */
function validateQualifiersSubset(original, delegated) {
    const origQ = original.qualifiers;
    const delQ = delegated.qualifiers;
    // If original has kind restrictions, delegated must be subset
    if (origQ?.kinds && delQ?.kinds) {
        for (const kind of delQ.kinds) {
            if (!origQ.kinds.includes(kind)) {
                return {
                    valid: false,
                    error: `Delegated kind ${kind} not in original capability`,
                };
            }
        }
    }
    else if (origQ?.kinds && !delQ?.kinds) {
        // Delegated has no kind restriction but original does - invalid
        return {
            valid: false,
            error: "Delegated capability must specify kinds subset",
        };
    }
    // Delegated expiration must be <= original expiration
    if (original.expiresAt && delegated.expiresAt) {
        if (delegated.expiresAt > original.expiresAt) {
            return {
                valid: false,
                error: "Delegated capability expires after original",
            };
        }
    }
    else if (original.expiresAt && !delegated.expiresAt) {
        return {
            valid: false,
            error: "Delegated capability must have expiration",
        };
    }
    return { valid: true };
}
// ============================================================================
// Authorization Checks
// ============================================================================
/**
 * Check if a pubkey is authorized to perform an action
 */
export function checkAuthorization(capabilities, pubkey, action, context = {}) {
    const currentTime = context.currentTime ?? Math.floor(Date.now() / 1000);
    // Find a matching capability
    for (const cap of capabilities) {
        // Check holder
        if (cap.holder !== pubkey) {
            continue;
        }
        // Check expiration
        if (isCapabilityExpired(cap, currentTime)) {
            continue;
        }
        // Check action type
        if (!capabilityAllowsAction(cap, action, context.eventKind)) {
            continue;
        }
        // Check required tags
        if (cap.qualifiers?.requiredTags && context.eventTags) {
            if (!eventMatchesRequiredTags(context.eventTags, cap.qualifiers.requiredTags)) {
                continue;
            }
        }
        // Check excluded tags
        if (cap.qualifiers?.excludedTags && context.eventTags) {
            if (eventHasExcludedTags(context.eventTags, cap.qualifiers.excludedTags)) {
                continue;
            }
        }
        // Found a valid capability
        return { authorized: true, capability: cap };
    }
    return { authorized: false, error: "No valid capability found" };
}
// ============================================================================
// Capability Store
// ============================================================================
/**
 * Simple in-memory capability store for managing capabilities
 */
export class CapabilityStore {
    capabilities = new Map();
    revokedIds = new Set();
    byHolder = new Map();
    byIssuer = new Map();
    /**
     * Add a capability event to the store
     */
    addCapability(event, groupPubkey) {
        const context = {
            currentTime: Math.floor(Date.now() / 1000),
            revokedEventIds: this.revokedIds,
        };
        const result = validateCapabilityEvent(event, groupPubkey, context);
        if (!result.valid || !result.capability) {
            return result;
        }
        const capEvent = {
            event,
            capability: result.capability,
        };
        // Store by event ID
        this.capabilities.set(event.id, capEvent);
        // Index by holder
        if (!this.byHolder.has(result.capability.holder)) {
            this.byHolder.set(result.capability.holder, new Set());
        }
        this.byHolder.get(result.capability.holder).add(event.id);
        // Index by issuer
        if (!this.byIssuer.has(result.capability.issuer)) {
            this.byIssuer.set(result.capability.issuer, new Set());
        }
        this.byIssuer.get(result.capability.issuer).add(event.id);
        return result;
    }
    /**
     * Process a revocation event
     */
    addRevocation(event, groupPubkey) {
        // Verify the revocation is from the group
        if (event.pubkey !== groupPubkey) {
            return false;
        }
        if (!verifyEvent(event)) {
            return false;
        }
        const revocation = parseRevocationEvent(event);
        if (!revocation) {
            return false;
        }
        this.revokedIds.add(revocation.revokedEventId);
        // Remove from capability store
        const capEvent = this.capabilities.get(revocation.revokedEventId);
        if (capEvent) {
            this.capabilities.delete(revocation.revokedEventId);
            // Remove from indexes
            const holderSet = this.byHolder.get(capEvent.capability.holder);
            holderSet?.delete(revocation.revokedEventId);
            const issuerSet = this.byIssuer.get(capEvent.capability.issuer);
            issuerSet?.delete(revocation.revokedEventId);
        }
        return true;
    }
    /**
     * Get all capabilities for a holder
     */
    getCapabilitiesForHolder(holder) {
        const eventIds = this.byHolder.get(holder);
        if (!eventIds) {
            return [];
        }
        const currentTime = Math.floor(Date.now() / 1000);
        const capabilities = [];
        for (const eventId of eventIds) {
            const capEvent = this.capabilities.get(eventId);
            if (capEvent && !isCapabilityExpired(capEvent.capability, currentTime)) {
                capabilities.push(capEvent.capability);
            }
        }
        return capabilities;
    }
    /**
     * Get all capabilities issued by a group
     */
    getCapabilitiesForIssuer(issuer) {
        const eventIds = this.byIssuer.get(issuer);
        if (!eventIds) {
            return [];
        }
        const currentTime = Math.floor(Date.now() / 1000);
        const capabilities = [];
        for (const eventId of eventIds) {
            const capEvent = this.capabilities.get(eventId);
            if (capEvent && !isCapabilityExpired(capEvent.capability, currentTime)) {
                capabilities.push(capEvent.capability);
            }
        }
        return capabilities;
    }
    /**
     * Check if a pubkey is authorized for an action
     */
    checkAuthorization(pubkey, action, context) {
        const capabilities = this.getCapabilitiesForHolder(pubkey);
        return checkAuthorization(capabilities, pubkey, action, context);
    }
    /**
     * Check if an event ID has been revoked
     */
    isRevoked(eventId) {
        return this.revokedIds.has(eventId);
    }
    /**
     * Get all revoked event IDs
     */
    getRevokedIds() {
        return new Set(this.revokedIds);
    }
    /**
     * Clear all stored capabilities
     */
    clear() {
        this.capabilities.clear();
        this.revokedIds.clear();
        this.byHolder.clear();
        this.byIssuer.clear();
    }
}
//# sourceMappingURL=validation.js.map