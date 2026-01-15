/**
 * @nkg/relay - WebSocket relay server implementation
 */
import { type RelayConfig, type GroupId, type GroupMetadata, type GroupAdmin, type Pubkey } from "./types.js";
/**
 * NIP-29 Relay Server with capability-based authorization
 */
export declare class Relay {
    private config;
    private wss;
    private clients;
    private eventStore;
    private capabilityStore;
    private groups;
    private admins;
    private members;
    constructor(config: RelayConfig);
    /**
     * Start the relay server
     */
    start(): void;
    /**
     * Stop the relay server
     */
    stop(): void;
    /**
     * Handle incoming client message
     */
    private handleMessage;
    /**
     * Handle EVENT message
     */
    private handleEvent;
    /**
     * Handle NIP-29 event
     */
    private handleNip29Event;
    /**
     * Check if an event is a group creation event
     */
    private isGroupCreationEvent;
    /**
     * Check event authorization
     */
    private checkEventAuthorization;
    /**
     * Handle moderation event
     */
    private handleModerationEvent;
    /**
     * Handle join request
     */
    private handleJoinRequest;
    /**
     * Handle leave request
     */
    private handleLeaveRequest;
    /**
     * Handle capability event
     */
    private handleCapabilityEvent;
    /**
     * Handle REQ message
     */
    private handleReq;
    /**
     * Handle CLOSE message
     */
    private handleClose;
    /**
     * Handle AUTH message
     */
    private handleAuth;
    /**
     * Send message to client
     */
    private send;
    /**
     * Broadcast event to subscribed clients
     */
    private broadcastEvent;
    /**
     * Create a new group
     */
    createGroup(metadata: GroupMetadata, admins?: GroupAdmin[]): void;
    /**
     * Get group metadata
     */
    getGroup(groupId: GroupId): GroupMetadata | undefined;
    /**
     * Get group admins
     */
    getGroupAdmins(groupId: GroupId): GroupAdmin[];
    /**
     * Get group members
     */
    getGroupMembers(groupId: GroupId): Pubkey[];
    /**
     * Add a member to a group
     */
    addMember(groupId: GroupId, pubkey: Pubkey): void;
    /**
     * Check if a pubkey is a member of a group
     */
    isMember(groupId: GroupId, pubkey: Pubkey): boolean;
}
//# sourceMappingURL=relay.d.ts.map