/**
 * @nkg/cap - Capability issuance and management
 */
import { CAPABILITY_EVENT_KINDS, CAPABILITY_TAGS, } from "./types.js";
// ============================================================================
// Capability Event Creation
// ============================================================================
/**
 * Create an unsigned capability grant event
 */
export function createCapabilityGrantEvent(holder, type, groupPubkey, options) {
    const tags = [
        [CAPABILITY_TAGS.HOLDER, holder],
        [CAPABILITY_TAGS.TYPE, type],
    ];
    // Add qualifiers
    if (options?.qualifiers) {
        const q = options.qualifiers;
        if (q.kinds && q.kinds.length > 0) {
            tags.push([CAPABILITY_TAGS.KINDS, ...q.kinds.map(String)]);
        }
        if (q.requiredTags && q.requiredTags.length > 0) {
            tags.push([
                CAPABILITY_TAGS.REQUIRED_TAGS,
                JSON.stringify(q.requiredTags),
            ]);
        }
        if (q.excludedTags && q.excludedTags.length > 0) {
            tags.push([
                CAPABILITY_TAGS.EXCLUDED_TAGS,
                JSON.stringify(q.excludedTags),
            ]);
        }
        if (q.rateLimit) {
            tags.push([
                CAPABILITY_TAGS.RATE_LIMIT,
                String(q.rateLimit.count),
                String(q.rateLimit.periodSeconds),
            ]);
        }
    }
    // Add expiration
    if (options?.expiresAt) {
        tags.push([CAPABILITY_TAGS.EXPIRATION, String(options.expiresAt)]);
    }
    // Add group ID if provided
    if (options?.groupId) {
        tags.push([CAPABILITY_TAGS.GROUP, options.groupId]);
    }
    return {
        kind: CAPABILITY_EVENT_KINDS.GRANT,
        pubkey: groupPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    };
}
/**
 * Create an unsigned capability revocation event
 */
export function createCapabilityRevocationEvent(eventIdToRevoke, groupPubkey, reason) {
    const tags = [
        [CAPABILITY_TAGS.REFERENCE, eventIdToRevoke],
    ];
    return {
        kind: CAPABILITY_EVENT_KINDS.REVOKE,
        pubkey: groupPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: reason ?? "",
    };
}
/**
 * Create an unsigned capability delegation event
 *
 * Used when a holder with "delegate" capability wants to
 * create a chained capability for another pubkey.
 */
export function createCapabilityDelegationEvent(originalCapabilityEventId, newHolder, delegatorPubkey, type, options) {
    const tags = [
        [CAPABILITY_TAGS.REFERENCE, originalCapabilityEventId],
        [CAPABILITY_TAGS.HOLDER, newHolder],
        [CAPABILITY_TAGS.TYPE, type],
    ];
    // Add qualifiers (must be subset of original)
    if (options?.qualifiers) {
        const q = options.qualifiers;
        if (q.kinds && q.kinds.length > 0) {
            tags.push([CAPABILITY_TAGS.KINDS, ...q.kinds.map(String)]);
        }
        if (q.requiredTags && q.requiredTags.length > 0) {
            tags.push([
                CAPABILITY_TAGS.REQUIRED_TAGS,
                JSON.stringify(q.requiredTags),
            ]);
        }
        if (q.excludedTags && q.excludedTags.length > 0) {
            tags.push([
                CAPABILITY_TAGS.EXCLUDED_TAGS,
                JSON.stringify(q.excludedTags),
            ]);
        }
        if (q.rateLimit) {
            tags.push([
                CAPABILITY_TAGS.RATE_LIMIT,
                String(q.rateLimit.count),
                String(q.rateLimit.periodSeconds),
            ]);
        }
    }
    // Add expiration
    if (options?.expiresAt) {
        tags.push([CAPABILITY_TAGS.EXPIRATION, String(options.expiresAt)]);
    }
    return {
        kind: CAPABILITY_EVENT_KINDS.DELEGATE,
        pubkey: delegatorPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    };
}
// ============================================================================
// Event Parsing
// ============================================================================
/**
 * Parse a capability grant event
 */
export function parseCapabilityGrantEvent(event) {
    if (event.kind !== CAPABILITY_EVENT_KINDS.GRANT) {
        return null;
    }
    const holder = getTagValue(event.tags, CAPABILITY_TAGS.HOLDER);
    const type = getTagValue(event.tags, CAPABILITY_TAGS.TYPE);
    if (!holder || !type) {
        return null;
    }
    // Validate capability type
    const validTypes = ["read", "write", "publish", "delete", "delegate"];
    if (!validTypes.includes(type)) {
        return null;
    }
    // Parse qualifiers
    const qualifiers = parseQualifiers(event.tags);
    // Parse expiration
    const expirationStr = getTagValue(event.tags, CAPABILITY_TAGS.EXPIRATION);
    const expiresAt = expirationStr ? parseInt(expirationStr, 10) : undefined;
    const capability = {
        type,
        holder,
        issuer: event.pubkey,
        issuedAt: event.created_at,
        ...(expiresAt !== undefined && { expiresAt }),
        ...(Object.keys(qualifiers).length > 0 && { qualifiers }),
    };
    return { event, capability };
}
/**
 * Parse a capability revocation event
 */
export function parseRevocationEvent(event) {
    if (event.kind !== CAPABILITY_EVENT_KINDS.REVOKE) {
        return null;
    }
    const revokedEventId = getTagValue(event.tags, CAPABILITY_TAGS.REFERENCE);
    if (!revokedEventId) {
        return null;
    }
    return {
        event,
        revokedEventId,
        groupPubkey: event.pubkey,
        revokedAt: event.created_at,
    };
}
/**
 * Parse a capability delegation event
 */
export function parseDelegationEvent(event, originalCapability) {
    if (event.kind !== CAPABILITY_EVENT_KINDS.DELEGATE) {
        return null;
    }
    const holder = getTagValue(event.tags, CAPABILITY_TAGS.HOLDER);
    const type = getTagValue(event.tags, CAPABILITY_TAGS.TYPE);
    const originalEventId = getTagValue(event.tags, CAPABILITY_TAGS.REFERENCE);
    if (!holder || !type || !originalEventId) {
        return null;
    }
    // Parse qualifiers
    const qualifiers = parseQualifiers(event.tags);
    // Parse expiration
    const expirationStr = getTagValue(event.tags, CAPABILITY_TAGS.EXPIRATION);
    const expiresAt = expirationStr ? parseInt(expirationStr, 10) : undefined;
    // Build delegation chain
    const delegationChain = [
        ...(originalCapability.delegationChain ?? []),
        {
            delegator: event.pubkey,
            delegatee: holder,
            eventId: event.id,
        },
    ];
    const capability = {
        type,
        holder,
        issuer: originalCapability.issuer, // Original group is still the issuer
        issuedAt: event.created_at,
        ...(expiresAt !== undefined && { expiresAt }),
        ...(Object.keys(qualifiers).length > 0 && { qualifiers }),
        delegationChain,
    };
    return { event, capability };
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Get the first value for a tag
 */
function getTagValue(tags, tagName) {
    const tag = tags.find((t) => t[0] === tagName);
    return tag?.[1];
}
/**
 * Get all values for a tag (excluding the tag name)
 */
function getTagValues(tags, tagName) {
    const tag = tags.find((t) => t[0] === tagName);
    return tag ? tag.slice(1) : [];
}
/**
 * Parse qualifier tags into a CapabilityQualifier object
 */
function parseQualifiers(tags) {
    const qualifiers = {};
    // Parse kinds
    const kindsValues = getTagValues(tags, CAPABILITY_TAGS.KINDS);
    if (kindsValues.length > 0) {
        qualifiers.kinds = kindsValues.map((v) => parseInt(v, 10)).filter((n) => !isNaN(n));
    }
    // Parse required tags
    const requiredTagsStr = getTagValue(tags, CAPABILITY_TAGS.REQUIRED_TAGS);
    if (requiredTagsStr) {
        try {
            qualifiers.requiredTags = JSON.parse(requiredTagsStr);
        }
        catch {
            // Invalid JSON, ignore
        }
    }
    // Parse excluded tags
    const excludedTagsStr = getTagValue(tags, CAPABILITY_TAGS.EXCLUDED_TAGS);
    if (excludedTagsStr) {
        try {
            qualifiers.excludedTags = JSON.parse(excludedTagsStr);
        }
        catch {
            // Invalid JSON, ignore
        }
    }
    // Parse rate limit
    const rateLimitTag = tags.find((t) => t[0] === CAPABILITY_TAGS.RATE_LIMIT);
    if (rateLimitTag && rateLimitTag.length >= 3) {
        const count = parseInt(rateLimitTag[1], 10);
        const periodSeconds = parseInt(rateLimitTag[2], 10);
        if (!isNaN(count) && !isNaN(periodSeconds)) {
            qualifiers.rateLimit = { count, periodSeconds };
        }
    }
    return qualifiers;
}
// ============================================================================
// Capability Queries
// ============================================================================
/**
 * Check if a capability allows a specific action
 */
export function capabilityAllowsAction(capability, action, eventKind) {
    // Check type
    if (capability.type !== action) {
        return false;
    }
    // Check kind restriction
    if (eventKind !== undefined && capability.qualifiers?.kinds) {
        if (!capability.qualifiers.kinds.includes(eventKind)) {
            return false;
        }
    }
    return true;
}
/**
 * Check if a capability is expired
 */
export function isCapabilityExpired(capability, currentTime = Math.floor(Date.now() / 1000)) {
    if (!capability.expiresAt) {
        return false;
    }
    return currentTime >= capability.expiresAt;
}
/**
 * Check if an event matches the required tags qualifier
 */
export function eventMatchesRequiredTags(eventTags, requiredTags) {
    for (const [tagName, tagValue] of requiredTags) {
        const hasTag = eventTags.some((t) => t[0] === tagName && t[1] === tagValue);
        if (!hasTag) {
            return false;
        }
    }
    return true;
}
/**
 * Check if an event has any excluded tags
 */
export function eventHasExcludedTags(eventTags, excludedTags) {
    for (const [tagName, tagValue] of excludedTags) {
        const hasTag = eventTags.some((t) => t[0] === tagName && t[1] === tagValue);
        if (hasTag) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=capability.js.map