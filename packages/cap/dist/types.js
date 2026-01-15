/**
 * @nkg/cap - Type definitions for capability system
 */
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
};
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
};
//# sourceMappingURL=types.js.map