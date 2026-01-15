/**
 * @nkg/relay - WebSocket relay server implementation
 */
import { WebSocketServer, WebSocket } from "ws";
import { verifyEvent } from "nostr-tools";
import { CapabilityStore, checkAuthorization, } from "@nkg/cap";
import { validateNip29Event, isNip29Event, isModerationEvent, isRelayMetadataEvent, getGroupId, canPerformModerationAction, } from "./nip29.js";
import { NIP29_KINDS, } from "./types.js";
// ============================================================================
// Event Storage (In-Memory)
// ============================================================================
/**
 * Simple in-memory event storage
 */
class EventStore {
    events = new Map();
    byGroup = new Map();
    byAuthor = new Map();
    byKind = new Map();
    recentEventPrefixes = new Set();
    add(event) {
        this.events.set(event.id, event);
        // Index by group
        const groupId = getGroupId(event);
        if (groupId) {
            if (!this.byGroup.has(groupId)) {
                this.byGroup.set(groupId, new Set());
            }
            this.byGroup.get(groupId).add(event.id);
        }
        // Index by author
        if (!this.byAuthor.has(event.pubkey)) {
            this.byAuthor.set(event.pubkey, new Set());
        }
        this.byAuthor.get(event.pubkey).add(event.id);
        // Index by kind
        if (!this.byKind.has(event.kind)) {
            this.byKind.set(event.kind, new Set());
        }
        this.byKind.get(event.kind).add(event.id);
        // Store prefix for timeline reference validation
        this.recentEventPrefixes.add(event.id.slice(0, 8));
        // Keep only last 1000 prefixes
        if (this.recentEventPrefixes.size > 1000) {
            const prefixes = Array.from(this.recentEventPrefixes);
            this.recentEventPrefixes = new Set(prefixes.slice(-500));
        }
    }
    get(eventId) {
        return this.events.get(eventId);
    }
    delete(eventId) {
        const event = this.events.get(eventId);
        if (!event) {
            return false;
        }
        this.events.delete(eventId);
        // Remove from indexes
        const groupId = getGroupId(event);
        if (groupId) {
            this.byGroup.get(groupId)?.delete(eventId);
        }
        this.byAuthor.get(event.pubkey)?.delete(eventId);
        this.byKind.get(event.kind)?.delete(eventId);
        return true;
    }
    query(filter) {
        let candidateIds = null;
        // Start with most restrictive filter
        if (filter.ids && filter.ids.length > 0) {
            candidateIds = new Set(filter.ids.filter((id) => this.events.has(id)));
        }
        if (filter["#h"] && filter["#h"].length > 0) {
            const groupIds = new Set();
            for (const groupId of filter["#h"]) {
                const ids = this.byGroup.get(groupId);
                if (ids) {
                    for (const id of ids) {
                        groupIds.add(id);
                    }
                }
            }
            candidateIds = candidateIds
                ? intersection(candidateIds, groupIds)
                : groupIds;
        }
        if (filter.authors && filter.authors.length > 0) {
            const authorIds = new Set();
            for (const author of filter.authors) {
                const ids = this.byAuthor.get(author);
                if (ids) {
                    for (const id of ids) {
                        authorIds.add(id);
                    }
                }
            }
            candidateIds = candidateIds
                ? intersection(candidateIds, authorIds)
                : authorIds;
        }
        if (filter.kinds && filter.kinds.length > 0) {
            const kindIds = new Set();
            for (const kind of filter.kinds) {
                const ids = this.byKind.get(kind);
                if (ids) {
                    for (const id of ids) {
                        kindIds.add(id);
                    }
                }
            }
            candidateIds = candidateIds
                ? intersection(candidateIds, kindIds)
                : kindIds;
        }
        // If no filters matched, return all events
        if (candidateIds === null) {
            candidateIds = new Set(this.events.keys());
        }
        // Apply remaining filters
        let results = [];
        for (const id of candidateIds) {
            const event = this.events.get(id);
            if (event && matchesFilter(event, filter)) {
                results.push(event);
            }
        }
        // Sort by created_at descending
        results.sort((a, b) => b.created_at - a.created_at);
        // Apply limit
        if (filter.limit !== undefined && filter.limit > 0) {
            results = results.slice(0, filter.limit);
        }
        return results;
    }
    hasRecentEventPrefix(prefix) {
        return this.recentEventPrefixes.has(prefix);
    }
    getRecentEventPrefixes() {
        return new Set(this.recentEventPrefixes);
    }
}
function intersection(a, b) {
    const result = new Set();
    for (const item of a) {
        if (b.has(item)) {
            result.add(item);
        }
    }
    return result;
}
function matchesFilter(event, filter) {
    if (filter.since !== undefined && event.created_at < filter.since) {
        return false;
    }
    if (filter.until !== undefined && event.created_at > filter.until) {
        return false;
    }
    // Check #e tag filter
    if (filter["#e"] && filter["#e"].length > 0) {
        const eTags = event.tags.filter((t) => t[0] === "e").map((t) => t[1]);
        if (!filter["#e"].some((e) => eTags.includes(e))) {
            return false;
        }
    }
    // Check #p tag filter
    if (filter["#p"] && filter["#p"].length > 0) {
        const pTags = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
        if (!filter["#p"].some((p) => pTags.includes(p))) {
            return false;
        }
    }
    return true;
}
/**
 * NIP-29 Relay Server with capability-based authorization
 */
export class Relay {
    config;
    wss = null;
    clients = new Set();
    eventStore = new EventStore();
    capabilityStore = new CapabilityStore();
    groups = new Map();
    admins = new Map();
    members = new Map();
    constructor(config) {
        this.config = {
            maxEventSize: 65536,
            maxSubscriptions: 20,
            latePublicationWindow: 3600, // 1 hour default
            ...config,
        };
    }
    /**
     * Start the relay server
     */
    start() {
        this.wss = new WebSocketServer({ port: this.config.port });
        this.wss.on("connection", (ws) => {
            const client = {
                ws,
                subscriptions: new Map(),
            };
            this.clients.add(client);
            // Send AUTH challenge if required
            if (this.config.requireAuth) {
                const challenge = generateChallenge();
                client.authChallenge = challenge;
                this.send(client, ["AUTH", challenge]);
            }
            ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(client, message);
                }
                catch (err) {
                    this.send(client, ["NOTICE", "Invalid message format"]);
                }
            });
            ws.on("close", () => {
                this.clients.delete(client);
            });
            ws.on("error", () => {
                this.clients.delete(client);
            });
        });
        console.log(`Relay started on port ${this.config.port}`);
    }
    /**
     * Stop the relay server
     */
    stop() {
        if (this.wss) {
            for (const client of this.clients) {
                client.ws.close();
            }
            this.wss.close();
            this.wss = null;
        }
    }
    /**
     * Handle incoming client message
     */
    handleMessage(client, message) {
        const [type] = message;
        switch (type) {
            case "EVENT":
                this.handleEvent(client, message[1]);
                break;
            case "REQ":
                this.handleReq(client, message[1], message.slice(2));
                break;
            case "CLOSE":
                this.handleClose(client, message[1]);
                break;
            case "AUTH":
                this.handleAuth(client, message[1]);
                break;
            default:
                this.send(client, ["NOTICE", "Unknown message type"]);
        }
    }
    /**
     * Handle EVENT message
     */
    handleEvent(client, event) {
        // Check AUTH if required
        if (this.config.requireAuth && !client.authedPubkey) {
            this.send(client, ["OK", event.id, false, "auth-required: please authenticate"]);
            return;
        }
        // Verify event signature
        if (!verifyEvent(event)) {
            this.send(client, ["OK", event.id, false, "invalid: bad signature"]);
            return;
        }
        // Check event size
        const eventSize = JSON.stringify(event).length;
        if (eventSize > this.config.maxEventSize) {
            this.send(client, ["OK", event.id, false, "invalid: event too large"]);
            return;
        }
        // Handle NIP-29 events
        if (isNip29Event(event.kind)) {
            this.handleNip29Event(client, event);
            return;
        }
        // Handle capability events
        if (event.kind >= 29000 && event.kind <= 29002) {
            this.handleCapabilityEvent(client, event);
            return;
        }
        // Reject other events (this is a NIP-29 only relay)
        this.send(client, ["OK", event.id, false, "blocked: only NIP-29 events accepted"]);
    }
    /**
     * Handle NIP-29 event
     */
    handleNip29Event(client, event) {
        const groupId = getGroupId(event);
        if (!groupId) {
            this.send(client, ["OK", event.id, false, "invalid: missing h tag"]);
            return;
        }
        // Check if group exists
        const group = this.groups.get(groupId);
        if (!group && !this.isGroupCreationEvent(event)) {
            this.send(client, ["OK", event.id, false, "invalid: group not found"]);
            return;
        }
        // Validate NIP-29 event
        const validationOptions = {
            requirePreviousRefs: !isRelayMetadataEvent(event.kind) && !isModerationEvent(event.kind),
            minPreviousRefs: 0, // Relaxed for now
        };
        if (this.config.latePublicationWindow !== undefined) {
            validationOptions.latePublicationWindow = this.config.latePublicationWindow;
        }
        const validation = validateNip29Event(event, validationOptions);
        if (!validation.valid) {
            this.send(client, ["OK", event.id, false, `invalid: ${validation.error}`]);
            return;
        }
        // Check authorization
        if (!this.checkEventAuthorization(client, event, groupId, group)) {
            return; // Authorization check sends its own OK response
        }
        // Handle moderation events
        if (isModerationEvent(event.kind)) {
            this.handleModerationEvent(client, event, groupId);
            return;
        }
        // Handle join/leave requests
        if (event.kind === NIP29_KINDS.JOIN_REQUEST) {
            this.handleJoinRequest(client, event, groupId);
            return;
        }
        if (event.kind === NIP29_KINDS.LEAVE_REQUEST) {
            this.handleLeaveRequest(client, event, groupId);
            return;
        }
        // Store and broadcast the event
        this.eventStore.add(event);
        this.send(client, ["OK", event.id, true, ""]);
        this.broadcastEvent(event, groupId);
    }
    /**
     * Check if an event is a group creation event
     */
    isGroupCreationEvent(event) {
        return event.kind === NIP29_KINDS.MOD_CREATE_GROUP;
    }
    /**
     * Check event authorization
     */
    checkEventAuthorization(client, event, groupId, group) {
        // Skip auth for join requests (anyone can request)
        if (event.kind === NIP29_KINDS.JOIN_REQUEST) {
            return true;
        }
        // Check if user is a member
        const isMember = this.members.get(groupId)?.has(event.pubkey) ?? false;
        // Check capability-based authorization
        const capabilities = this.capabilityStore.getCapabilitiesForHolder(event.pubkey);
        // Determine required capability type
        let requiredCapability = null;
        if (event.kind === NIP29_KINDS.CHAT_MESSAGE || event.kind === NIP29_KINDS.CHAT_REPLY ||
            event.kind === NIP29_KINDS.TEXT_NOTE || event.kind === NIP29_KINDS.TEXT_REPLY) {
            requiredCapability = "write";
        }
        else if (isModerationEvent(event.kind)) {
            requiredCapability = "delete";
        }
        if (requiredCapability) {
            const authResult = checkAuthorization(capabilities, event.pubkey, requiredCapability, {
                eventKind: event.kind,
                eventTags: event.tags,
            });
            if (!authResult.authorized && !isMember) {
                this.send(client, ["OK", event.id, false, "restricted: not authorized"]);
                return false;
            }
        }
        return true;
    }
    /**
     * Handle moderation event
     */
    handleModerationEvent(client, event, groupId) {
        const groupAdmins = this.admins.get(groupId) ?? [];
        // Check if sender is admin with appropriate permission
        if (!canPerformModerationAction(groupAdmins, event.pubkey, event.kind)) {
            this.send(client, ["OK", event.id, false, "restricted: not admin"]);
            return;
        }
        // Process the moderation action
        switch (event.kind) {
            case NIP29_KINDS.MOD_ADD_USER: {
                const targets = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
                const memberSet = this.members.get(groupId) ?? new Set();
                for (const target of targets) {
                    memberSet.add(target);
                }
                this.members.set(groupId, memberSet);
                break;
            }
            case NIP29_KINDS.MOD_REMOVE_USER: {
                const targets = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
                const memberSet = this.members.get(groupId);
                if (memberSet) {
                    for (const target of targets) {
                        memberSet.delete(target);
                    }
                }
                break;
            }
            case NIP29_KINDS.MOD_DELETE_EVENT: {
                const eventIds = event.tags.filter((t) => t[0] === "e").map((t) => t[1]);
                for (const eventId of eventIds) {
                    this.eventStore.delete(eventId);
                }
                break;
            }
        }
        this.eventStore.add(event);
        this.send(client, ["OK", event.id, true, ""]);
        this.broadcastEvent(event, groupId);
    }
    /**
     * Handle join request
     */
    handleJoinRequest(client, event, groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            this.send(client, ["OK", event.id, false, "invalid: group not found"]);
            return;
        }
        // If group is open, auto-add the member
        if (group.access === "open") {
            const memberSet = this.members.get(groupId) ?? new Set();
            memberSet.add(event.pubkey);
            this.members.set(groupId, memberSet);
        }
        this.eventStore.add(event);
        this.send(client, ["OK", event.id, true, ""]);
    }
    /**
     * Handle leave request
     */
    handleLeaveRequest(client, event, groupId) {
        const memberSet = this.members.get(groupId);
        if (memberSet) {
            memberSet.delete(event.pubkey);
        }
        this.eventStore.add(event);
        this.send(client, ["OK", event.id, true, ""]);
    }
    /**
     * Handle capability event
     */
    handleCapabilityEvent(client, event) {
        const groupId = getGroupId(event);
        if (!groupId) {
            this.send(client, ["OK", event.id, false, "invalid: missing h tag"]);
            return;
        }
        const group = this.groups.get(groupId);
        if (!group) {
            this.send(client, ["OK", event.id, false, "invalid: group not found"]);
            return;
        }
        // Capability events must come from group pubkey
        if (event.pubkey !== group.pubkey) {
            this.send(client, ["OK", event.id, false, "restricted: not group key"]);
            return;
        }
        // Add to capability store
        if (event.kind === 29000) {
            const result = this.capabilityStore.addCapability(event, group.pubkey);
            if (!result.valid) {
                this.send(client, ["OK", event.id, false, `invalid: ${result.error}`]);
                return;
            }
        }
        else if (event.kind === 29001) {
            this.capabilityStore.addRevocation(event, group.pubkey);
        }
        this.eventStore.add(event);
        this.send(client, ["OK", event.id, true, ""]);
        this.broadcastEvent(event, groupId);
    }
    /**
     * Handle REQ message
     */
    handleReq(client, subId, filters) {
        // Check subscription limit
        if (client.subscriptions.size >= this.config.maxSubscriptions) {
            this.send(client, ["CLOSED", subId, "error: too many subscriptions"]);
            return;
        }
        // Check AUTH for private groups
        // TODO: Implement private group access control
        // Store subscription
        client.subscriptions.set(subId, filters);
        // Query existing events
        for (const filter of filters) {
            const events = this.eventStore.query(filter);
            for (const event of events) {
                this.send(client, ["EVENT", subId, event]);
            }
        }
        // Send EOSE
        this.send(client, ["EOSE", subId]);
    }
    /**
     * Handle CLOSE message
     */
    handleClose(client, subId) {
        client.subscriptions.delete(subId);
        this.send(client, ["CLOSED", subId, ""]);
    }
    /**
     * Handle AUTH message
     */
    handleAuth(client, event) {
        if (!verifyEvent(event)) {
            this.send(client, ["OK", event.id, false, "invalid: bad signature"]);
            return;
        }
        if (event.kind !== 22242) {
            this.send(client, ["OK", event.id, false, "invalid: wrong event kind"]);
            return;
        }
        // Verify challenge
        const challengeTag = event.tags.find((t) => t[0] === "challenge");
        if (!challengeTag || challengeTag[1] !== client.authChallenge) {
            this.send(client, ["OK", event.id, false, "invalid: wrong challenge"]);
            return;
        }
        client.authedPubkey = event.pubkey;
        this.send(client, ["OK", event.id, true, ""]);
    }
    /**
     * Send message to client
     */
    send(client, message) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
    /**
     * Broadcast event to subscribed clients
     */
    broadcastEvent(event, groupId) {
        for (const client of this.clients) {
            for (const [subId, filters] of client.subscriptions) {
                for (const filter of filters) {
                    const events = this.eventStore.query(filter);
                    if (events.some((e) => e.id === event.id)) {
                        this.send(client, ["EVENT", subId, event]);
                        break;
                    }
                }
            }
        }
    }
    // ============================================================================
    // Group Management API
    // ============================================================================
    /**
     * Create a new group
     */
    createGroup(metadata, admins = []) {
        this.groups.set(metadata.id, metadata);
        this.admins.set(metadata.id, admins);
        this.members.set(metadata.id, new Set());
    }
    /**
     * Get group metadata
     */
    getGroup(groupId) {
        return this.groups.get(groupId);
    }
    /**
     * Get group admins
     */
    getGroupAdmins(groupId) {
        return this.admins.get(groupId) ?? [];
    }
    /**
     * Get group members
     */
    getGroupMembers(groupId) {
        return Array.from(this.members.get(groupId) ?? []);
    }
    /**
     * Add a member to a group
     */
    addMember(groupId, pubkey) {
        const memberSet = this.members.get(groupId) ?? new Set();
        memberSet.add(pubkey);
        this.members.set(groupId, memberSet);
    }
    /**
     * Check if a pubkey is a member of a group
     */
    isMember(groupId, pubkey) {
        return this.members.get(groupId)?.has(pubkey) ?? false;
    }
}
function generateChallenge() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
//# sourceMappingURL=relay.js.map