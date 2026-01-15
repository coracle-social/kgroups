/**
 * @nkg/chat - Type definitions
 */

import type { Event } from "nostr-tools";

// ============================================================================
// State Types
// ============================================================================

/** Application state */
export interface AppState {
  /** Current view */
  view: "login" | "groups" | "chat" | "create-group";
  /** User's secret key (hex) */
  secretKey: string | null;
  /** User's public key (hex) */
  pubkey: string | null;
  /** Connected relay URL */
  relayUrl: string | null;
  /** Whether relay is connected */
  relayConnected: boolean;
  /** List of joined groups */
  groups: GroupInfo[];
  /** Currently selected group */
  currentGroup: string | null;
  /** Messages in current group */
  messages: ChatMessage[];
  /** Active DKG session info */
  dkgSession: DKGSessionInfo | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
}

/** DKG session info for UI */
export interface DKGSessionInfo {
  sessionId: string;
  status: "waiting" | "round1" | "round2" | "complete" | "failed";
  groupName?: string;
  groupPubkey?: string;
  error?: string;
}

/** Group information */
export interface GroupInfo {
  id: string;
  name: string;
  picture?: string;
  about?: string;
  memberCount?: number;
  unreadCount?: number;
}

/** Chat message */
export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  replyTo?: string;
}

// ============================================================================
// Action Types
// ============================================================================

export type Action =
  | { type: "SET_SECRET_KEY"; payload: string }
  | { type: "SET_RELAY_URL"; payload: string }
  | { type: "SET_RELAY_CONNECTED"; payload: boolean }
  | { type: "SET_VIEW"; payload: AppState["view"] }
  | { type: "SET_GROUPS"; payload: GroupInfo[] }
  | { type: "ADD_GROUP"; payload: GroupInfo }
  | { type: "SELECT_GROUP"; payload: string }
  | { type: "SET_MESSAGES"; payload: ChatMessage[] }
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | { type: "SET_DKG_SESSION"; payload: DKGSessionInfo | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "LOGOUT" };
