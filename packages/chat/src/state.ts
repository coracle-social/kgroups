/**
 * @nkg/chat - Application state management
 */

import { getPublicKey } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import type { AppState, Action, ChatMessage, GroupInfo } from "./types.js";

// ============================================================================
// Initial State
// ============================================================================

export const initialState: AppState = {
  view: "login",
  secretKey: null,
  pubkey: null,
  relayUrl: null,
  relayConnected: false,
  groups: [],
  currentGroup: null,
  messages: [],
  dkgSession: null,
  loading: false,
  error: null,
};

// ============================================================================
// Reducer
// ============================================================================

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_SECRET_KEY": {
      const secretKey = action.payload;
      const pubkey = getPublicKey(hexToBytes(secretKey));
      return {
        ...state,
        secretKey,
        pubkey,
        view: "groups",
      };
    }

    case "SET_RELAY_URL":
      return { ...state, relayUrl: action.payload };

    case "SET_RELAY_CONNECTED":
      return { ...state, relayConnected: action.payload };

    case "SET_VIEW":
      return { ...state, view: action.payload };

    case "SET_GROUPS":
      return { ...state, groups: action.payload };

    case "ADD_GROUP": {
      // Add group if not already present
      const exists = state.groups.some((g) => g.id === action.payload.id);
      if (exists) {
        // Update existing group
        return {
          ...state,
          groups: state.groups.map((g) =>
            g.id === action.payload.id ? { ...g, ...action.payload } : g
          ),
        };
      }
      return { ...state, groups: [...state.groups, action.payload] };
    }

    case "SELECT_GROUP":
      return {
        ...state,
        currentGroup: action.payload,
        view: "chat",
        messages: [],
      };

    case "SET_MESSAGES":
      return { ...state, messages: action.payload };

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload].sort(
          (a, b) => a.createdAt - b.createdAt
        ),
      };

    case "SET_DKG_SESSION":
      return { ...state, dkgSession: action.payload };

    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "LOGOUT":
      return initialState;

    default:
      return state;
  }
}

// ============================================================================
// State Store (Simple)
// ============================================================================

export class Store {
  private state: AppState;
  private listeners: Set<() => void> = new Set();

  constructor(initialState: AppState) {
    this.state = initialState;
  }

  getState(): AppState {
    return this.state;
  }

  dispatch(action: Action): void {
    this.state = reducer(this.state, action);
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Singleton store instance
export const store = new Store(initialState);
