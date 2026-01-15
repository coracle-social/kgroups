/**
 * @nkg/relay - Type definitions for NIP-29 relay
 */

import type { Event } from "nostr-tools";

// ============================================================================
// Core Types
// ============================================================================

/** Hex-encoded string */
export type Hex = string;

/** Nostr pubkey (32-byte hex) */
export type Pubkey = string;

/** Nostr event ID (32-byte hex) */
export type EventId = string;

/** Unix timestamp in seconds */
export type Timestamp = number;

/** Group identifier (random string) */
export type GroupId = string;

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
} as const;

/** NIP-29 group visibility */
export type GroupVisibility = "public" | "private";

/** NIP-29 group access */
export type GroupAccess = "open" | "closed";

// ============================================================================
// Group Types
// ============================================================================

/** Group metadata */
export interface GroupMetadata {
  /** Group identifier */
  id: GroupId;
  /** Group name */
  name: string;
  /** Group picture URL */
  picture?: string;
  /** Group description */
  about?: string;
  /** Whether group is publicly readable */
  visibility: GroupVisibility;
  /** Whether group is open to join */
  access: GroupAccess;
  /** Group pubkey (from DKG) */
  pubkey: Pubkey;
  /** Relays for capability storage */
  capabilityRelays?: string[];
  /** Relays for gated content */
  contentRelays?: string[];
  /** Relays for public content */
  publicRelays?: string[];
}

/** Group admin with permissions */
export interface GroupAdmin {
  /** Admin pubkey */
  pubkey: Pubkey;
  /** Admin label (for display) */
  label: string;
  /** Admin permissions */
  permissions: AdminPermission[];
}

/** Admin permissions */
export type AdminPermission =
  | "add-user"
  | "edit-metadata"
  | "delete-event"
  | "remove-user"
  | "add-permission"
  | "remove-permission"
  | "edit-group-status"
  | "delete-group";

/** Group member */
export interface GroupMember {
  /** Member pubkey */
  pubkey: Pubkey;
  /** When they joined */
  joinedAt: Timestamp;
}

// ============================================================================
// Relay Message Types
// ============================================================================

/** Client-to-relay message types */
export type ClientMessage =
  | ["EVENT", Event]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string]
  | ["AUTH", Event];

/** Relay-to-client message types */
export type RelayMessage =
  | ["EVENT", string, Event]
  | ["OK", EventId, boolean, string]
  | ["EOSE", string]
  | ["CLOSED", string, string]
  | ["NOTICE", string]
  | ["AUTH", string];

/** Nostr filter */
export interface NostrFilter {
  ids?: EventId[];
  authors?: Pubkey[];
  kinds?: number[];
  "#e"?: EventId[];
  "#p"?: Pubkey[];
  "#h"?: GroupId[];
  since?: Timestamp;
  until?: Timestamp;
  limit?: number;
  [key: `#${string}`]: string[] | undefined;
}

// ============================================================================
// Relay Configuration
// ============================================================================

/** Relay configuration */
export interface RelayConfig {
  /** WebSocket port */
  port: number;
  /** Relay name */
  name?: string;
  /** Relay description */
  description?: string;
  /** Relay pubkey (for signing metadata events) */
  relayPubkey?: Pubkey;
  /** Relay secret key (for signing) */
  relaySecretKey?: Hex;
  /** Maximum event size in bytes */
  maxEventSize?: number;
  /** Maximum subscriptions per connection */
  maxSubscriptions?: number;
  /** Enable NIP-42 AUTH */
  requireAuth?: boolean;
  /** Late publication window (seconds) */
  latePublicationWindow?: number;
}

// ============================================================================
// Event Storage Types
// ============================================================================

/** Event with group context */
export interface GroupEvent {
  /** The nostr event */
  event: Event;
  /** The group ID (from h tag) */
  groupId: GroupId;
  /** Previous event references */
  previousRefs: EventId[];
}

/** Event query options */
export interface EventQueryOptions {
  /** Group ID filter */
  groupId?: GroupId;
  /** Event kinds filter */
  kinds?: number[];
  /** Author filter */
  authors?: Pubkey[];
  /** Since timestamp */
  since?: Timestamp;
  /** Until timestamp */
  until?: Timestamp;
  /** Maximum results */
  limit?: number;
}
