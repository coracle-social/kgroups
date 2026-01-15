/**
 * @nkg/relay - Type definitions for NIP-29 relay
 */
// ============================================================================
// NIP-29 Event Kinds
// ============================================================================
/** NIP-29 event kinds */
export const NIP29_KINDS = {
    // User events
    CHAT_MESSAGE: 9,
    CHAT_REPLY: 10,
    TEXT_NOTE: 11,
    TEXT_REPLY: 12,
    // Moderation events (9000-9020)
    MOD_ADD_USER: 9000,
    MOD_REMOVE_USER: 9001,
    MOD_EDIT_METADATA: 9002,
    MOD_DELETE_EVENT: 9005,
    MOD_CREATE_GROUP: 9007,
    MOD_DELETE_GROUP: 9008,
    MOD_CREATE_INVITE: 9009,
    // Join/Leave
    JOIN_REQUEST: 9021,
    LEAVE_REQUEST: 9022,
    // Group metadata (relay-generated)
    GROUP_METADATA: 39000,
    GROUP_ADMINS: 39001,
    GROUP_MEMBERS: 39002,
    GROUP_ROLES: 39003,
};
//# sourceMappingURL=types.js.map