/**
 * @nkg/relay - NIP-29 event handling
 */
import { type Event } from "nostr-tools";
import { type GroupId, type GroupMetadata, type GroupAdmin, type GroupMember, type GroupEvent, type Pubkey, type Timestamp } from "./types.js";
/**
 * Check if an event kind is a NIP-29 group event
 */
export declare function isNip29Event(kind: number): boolean;
/**
 * Check if an event kind is a moderation event
 */
export declare function isModerationEvent(kind: number): boolean;
/**
 * Check if an event kind is relay-generated metadata
 */
export declare function isRelayMetadataEvent(kind: number): boolean;
/**
 * Get the group ID from an event's h tag
 */
export declare function getGroupId(event: Event): GroupId | null;
/**
 * Get previous event references from an event
 */
export declare function getPreviousRefs(event: Event): string[];
/**
 * Parse a group event
 */
export declare function parseGroupEvent(event: Event): GroupEvent | null;
/**
 * Validate a NIP-29 event
 */
export declare function validateNip29Event(event: Event, options?: {
    requirePreviousRefs?: boolean;
    minPreviousRefs?: number;
    latePublicationWindow?: number;
    currentTime?: Timestamp;
}): {
    valid: boolean;
    error?: string;
};
/**
 * Create a group metadata event (kind 39000)
 */
export declare function createGroupMetadataEvent(metadata: GroupMetadata, relaySecretKey: Uint8Array): Event;
/**
 * Create a group admins event (kind 39001)
 */
export declare function createGroupAdminsEvent(groupId: GroupId, admins: GroupAdmin[], relaySecretKey: Uint8Array): Event;
/**
 * Create a group members event (kind 39002)
 */
export declare function createGroupMembersEvent(groupId: GroupId, members: GroupMember[], relaySecretKey: Uint8Array): Event;
/**
 * Parse a group metadata event
 */
export declare function parseGroupMetadataEvent(event: Event): GroupMetadata | null;
/**
 * Parse a group admins event
 */
export declare function parseGroupAdminsEvent(event: Event): GroupAdmin[] | null;
/**
 * Parse a group members event
 */
export declare function parseGroupMembersEvent(event: Event): Pubkey[] | null;
/** Moderation action result */
export interface ModerationAction {
    kind: number;
    actor: Pubkey;
    groupId: GroupId;
    targets: Pubkey[];
    reason?: string;
}
/**
 * Parse a moderation event
 */
export declare function parseModerationEvent(event: Event): ModerationAction | null;
/**
 * Check if a pubkey is admin for a specific action
 */
export declare function canPerformModerationAction(admins: GroupAdmin[], pubkey: Pubkey, actionKind: number): boolean;
//# sourceMappingURL=nip29.d.ts.map