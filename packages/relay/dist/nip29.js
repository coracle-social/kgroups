/**
 * @nkg/relay - NIP-29 event handling
 */
import { verifyEvent, finalizeEvent } from "nostr-tools";
import { NIP29_KINDS, } from "./types.js";
// ============================================================================
// Event Validation
// ============================================================================
/**
 * Check if an event kind is a NIP-29 group event
 */
export function isNip29Event(kind) {
    return (kind === NIP29_KINDS.CHAT_MESSAGE ||
        kind === NIP29_KINDS.CHAT_REPLY ||
        kind === NIP29_KINDS.TEXT_NOTE ||
        kind === NIP29_KINDS.TEXT_REPLY ||
        (kind >= 9000 && kind <= 9022) ||
        (kind >= 39000 && kind <= 39003));
}
/**
 * Check if an event kind is a moderation event
 */
export function isModerationEvent(kind) {
    return kind >= 9000 && kind <= 9020;
}
/**
 * Check if an event kind is relay-generated metadata
 */
export function isRelayMetadataEvent(kind) {
    return kind >= 39000 && kind <= 39003;
}
/**
 * Get the group ID from an event's h tag
 */
export function getGroupId(event) {
    const hTag = event.tags.find((t) => t[0] === "h");
    return hTag?.[1] ?? null;
}
/**
 * Get previous event references from an event
 */
export function getPreviousRefs(event) {
    return event.tags
        .filter((t) => t[0] === "previous")
        .flatMap((t) => t.slice(1))
        .filter((ref) => ref.length === 8); // First 8 chars of event ID
}
/**
 * Parse a group event
 */
export function parseGroupEvent(event) {
    const groupId = getGroupId(event);
    if (!groupId) {
        return null;
    }
    return {
        event,
        groupId,
        previousRefs: getPreviousRefs(event),
    };
}
/**
 * Validate a NIP-29 event
 */
export function validateNip29Event(event, options = {}) {
    // Verify signature
    if (!verifyEvent(event)) {
        return { valid: false, error: "Invalid signature" };
    }
    // Check for h tag
    const groupId = getGroupId(event);
    if (!groupId) {
        return { valid: false, error: "Missing h tag (group ID)" };
    }
    // Check previous refs (for non-metadata events)
    if (!isRelayMetadataEvent(event.kind)) {
        if (options.requirePreviousRefs) {
            const previousRefs = getPreviousRefs(event);
            const minRefs = options.minPreviousRefs ?? 3;
            if (previousRefs.length < minRefs) {
                return {
                    valid: false,
                    error: `Insufficient previous references: need ${minRefs}, got ${previousRefs.length}`,
                };
            }
        }
    }
    // Check for late publication
    if (options.latePublicationWindow !== undefined) {
        const currentTime = options.currentTime ?? Math.floor(Date.now() / 1000);
        const maxAge = options.latePublicationWindow;
        if (currentTime - event.created_at > maxAge) {
            return {
                valid: false,
                error: "Late publication rejected",
            };
        }
    }
    return { valid: true };
}
// ============================================================================
// Metadata Event Creation (Relay-generated)
// ============================================================================
/**
 * Create a group metadata event (kind 39000)
 */
export function createGroupMetadataEvent(metadata, relaySecretKey) {
    const tags = [
        ["d", metadata.id],
        ["name", metadata.name],
    ];
    if (metadata.picture) {
        tags.push(["picture", metadata.picture]);
    }
    if (metadata.about) {
        tags.push(["about", metadata.about]);
    }
    // Add visibility/access flags
    if (metadata.visibility === "public") {
        tags.push(["public"]);
    }
    else {
        tags.push(["private"]);
    }
    if (metadata.access === "open") {
        tags.push(["open"]);
    }
    else {
        tags.push(["closed"]);
    }
    const unsigned = {
        kind: NIP29_KINDS.GROUP_METADATA,
        pubkey: "", // Will be set by finalizeEvent
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    };
    return finalizeEvent(unsigned, relaySecretKey);
}
/**
 * Create a group admins event (kind 39001)
 */
export function createGroupAdminsEvent(groupId, admins, relaySecretKey) {
    const tags = [["d", groupId]];
    for (const admin of admins) {
        tags.push(["p", admin.pubkey, admin.label, ...admin.permissions]);
    }
    const unsigned = {
        kind: NIP29_KINDS.GROUP_ADMINS,
        pubkey: "",
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    };
    return finalizeEvent(unsigned, relaySecretKey);
}
/**
 * Create a group members event (kind 39002)
 */
export function createGroupMembersEvent(groupId, members, relaySecretKey) {
    const tags = [["d", groupId]];
    for (const member of members) {
        tags.push(["p", member.pubkey]);
    }
    const unsigned = {
        kind: NIP29_KINDS.GROUP_MEMBERS,
        pubkey: "",
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: "",
    };
    return finalizeEvent(unsigned, relaySecretKey);
}
// ============================================================================
// Metadata Event Parsing
// ============================================================================
/**
 * Parse a group metadata event
 */
export function parseGroupMetadataEvent(event) {
    if (event.kind !== NIP29_KINDS.GROUP_METADATA) {
        return null;
    }
    const dTag = event.tags.find((t) => t[0] === "d");
    const nameTag = event.tags.find((t) => t[0] === "name");
    if (!dTag?.[1] || !nameTag?.[1]) {
        return null;
    }
    const pictureTag = event.tags.find((t) => t[0] === "picture");
    const aboutTag = event.tags.find((t) => t[0] === "about");
    const hasPublic = event.tags.some((t) => t[0] === "public");
    const hasOpen = event.tags.some((t) => t[0] === "open");
    return {
        id: dTag[1],
        name: nameTag[1],
        ...(pictureTag?.[1] && { picture: pictureTag[1] }),
        ...(aboutTag?.[1] && { about: aboutTag[1] }),
        visibility: hasPublic ? "public" : "private",
        access: hasOpen ? "open" : "closed",
        pubkey: event.pubkey,
    };
}
/**
 * Parse a group admins event
 */
export function parseGroupAdminsEvent(event) {
    if (event.kind !== NIP29_KINDS.GROUP_ADMINS) {
        return null;
    }
    const admins = [];
    for (const tag of event.tags) {
        if (tag[0] === "p" && tag[1]) {
            admins.push({
                pubkey: tag[1],
                label: tag[2] ?? "admin",
                permissions: tag.slice(3).filter((p) => [
                    "add-user",
                    "edit-metadata",
                    "delete-event",
                    "remove-user",
                    "add-permission",
                    "remove-permission",
                    "edit-group-status",
                    "delete-group",
                ].includes(p)),
            });
        }
    }
    return admins;
}
/**
 * Parse a group members event
 */
export function parseGroupMembersEvent(event) {
    if (event.kind !== NIP29_KINDS.GROUP_MEMBERS) {
        return null;
    }
    return event.tags
        .filter((t) => t[0] === "p" && t[1])
        .map((t) => t[1]);
}
/**
 * Parse a moderation event
 */
export function parseModerationEvent(event) {
    if (!isModerationEvent(event.kind)) {
        return null;
    }
    const groupId = getGroupId(event);
    if (!groupId) {
        return null;
    }
    const targets = event.tags
        .filter((t) => t[0] === "p" && t[1])
        .map((t) => t[1]);
    return {
        kind: event.kind,
        actor: event.pubkey,
        groupId,
        targets,
        ...(event.content && { reason: event.content }),
    };
}
/**
 * Check if a pubkey is admin for a specific action
 */
export function canPerformModerationAction(admins, pubkey, actionKind) {
    const admin = admins.find((a) => a.pubkey === pubkey);
    if (!admin) {
        return false;
    }
    // Map event kind to required permission
    const permissionMap = {
        [NIP29_KINDS.MOD_ADD_USER]: "add-user",
        [NIP29_KINDS.MOD_REMOVE_USER]: "remove-user",
        [NIP29_KINDS.MOD_EDIT_METADATA]: "edit-metadata",
        [NIP29_KINDS.MOD_DELETE_EVENT]: "delete-event",
        [NIP29_KINDS.MOD_DELETE_GROUP]: "delete-group",
    };
    const requiredPermission = permissionMap[actionKind];
    if (!requiredPermission) {
        return false;
    }
    return admin.permissions.includes(requiredPermission);
}
//# sourceMappingURL=nip29.js.map