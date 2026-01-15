/**
 * @nkg/chat - Relay connection management
 * 
 * Handles WebSocket connection to NIP-29 relay, subscriptions, and event publishing.
 */

import {
  finalizeEvent,
  verifyEvent,
  type Event,
  type Filter,
} from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import m from "mithril";
import { store } from "./state.js";
import type { ChatMessage, GroupInfo } from "./types.js";

// NIP-29 event kinds
const KIND_CHAT_MESSAGE = 9;
const KIND_GROUP_METADATA = 39000;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MEMBERS = 39002;

// ============================================================================
// Relay Connection Manager
// ============================================================================

export class RelayConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private subscriptions: Map<string, { filters: Filter[]; callback: (event: Event) => void }> = new Map();
  private pendingPublish: Map<string, { resolve: (v: boolean) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private pendingMessages: string[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private authChallenge: string | null = null;
  private connected = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to the relay
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log(`[Relay] Connected to ${this.url}`);
          this.connected = true;
          this.reconnectAttempts = 0;
          store.dispatch({ type: "SET_RELAY_CONNECTED", payload: true });
          
          // Send pending messages
          for (const msg of this.pendingMessages) {
            this.ws?.send(msg);
          }
          this.pendingMessages = [];
          
          // Resubscribe to existing subscriptions
          for (const [id, sub] of this.subscriptions) {
            this.sendSubscribe(id, sub.filters);
          }
          
          resolve();
        };

        this.ws.onclose = () => {
          console.log(`[Relay] Disconnected from ${this.url}`);
          this.connected = false;
          store.dispatch({ type: "SET_RELAY_CONNECTED", payload: false });
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error(`[Relay] Error:`, error);
          store.dispatch({ type: "SET_ERROR", payload: "Relay connection error" });
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    store.dispatch({ type: "SET_RELAY_CONNECTED", payload: false });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to events
   */
  subscribe(
    id: string,
    filters: Filter[],
    callback: (event: Event) => void
  ): () => void {
    this.subscriptions.set(id, { filters, callback });
    
    if (this.isConnected()) {
      this.sendSubscribe(id, filters);
    }

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
      if (this.isConnected()) {
        this.send(["CLOSE", id]);
      }
    };
  }

  /**
   * Publish an event
   */
  async publish(event: Event): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        this.pendingMessages.push(JSON.stringify(["EVENT", event]));
        // Optimistically resolve
        resolve(true);
        return;
      }

      // Set up timeout for OK response
      const timeout = setTimeout(() => {
        this.pendingPublish.delete(event.id);
        reject(new Error("Publish timeout"));
      }, 5000);

      // Store callback for when OK arrives
      this.pendingPublish.set(event.id, { resolve, reject, timeout });

      this.send(["EVENT", event]);
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private sendSubscribe(id: string, filters: Filter[]): void {
    this.send(["REQ", id, ...filters]);
  }

  private send(message: unknown[]): void {
    const json = JSON.stringify(message);
    
    if (this.isConnected()) {
      this.ws!.send(json);
    } else {
      this.pendingMessages.push(json);
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const [type, ...args] = message;

      switch (type) {
        case "EVENT":
          this.handleEvent(args[0] as string, args[1] as Event);
          break;

        case "EOSE":
          console.log(`[Relay] End of stored events for subscription ${args[0]}`);
          break;

        case "OK":
          this.handleOk(args[0] as string, args[1] as boolean, args[2] as string | undefined);
          break;

        case "AUTH":
          this.handleAuth(args[0] as string);
          break;

        case "NOTICE":
          console.log(`[Relay] Notice: ${args[0]}`);
          break;

        case "CLOSED":
          console.log(`[Relay] Subscription ${args[0]} closed: ${args[1]}`);
          break;

        default:
          console.log(`[Relay] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error("[Relay] Failed to parse message:", error);
    }
  }

  private handleEvent(subscriptionId: string, event: Event): void {
    // Verify event signature
    if (!verifyEvent(event)) {
      console.warn("[Relay] Invalid event signature:", event.id);
      return;
    }

    // Find subscription and call callback
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.callback(event);
      m.redraw(); // Trigger Mithril redraw
    }
  }

  private handleOk(eventId: string, success: boolean, message?: string): void {
    console.log(`[Relay] Event ${eventId} ${success ? "accepted" : "rejected"}: ${message || ""}`);
    
    const pending = this.pendingPublish.get(eventId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingPublish.delete(eventId);
      
      if (success) {
        pending.resolve(true);
      } else {
        pending.reject(new Error(message || "Event rejected"));
      }
    }
  }

  private handleAuth(challenge: string): void {
    this.authChallenge = challenge;
    console.log("[Relay] Auth challenge received");
    
    // Auto-respond to auth if we have a secret key
    const state = store.getState();
    if (state.secretKey) {
      this.sendAuth(state.secretKey);
    }
  }

  private sendAuth(secretKey: string): void {
    if (!this.authChallenge) return;

    const authEvent = finalizeEvent({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["relay", this.url],
        ["challenge", this.authChallenge],
      ],
      content: "",
    }, hexToBytes(secretKey));

    this.send(["AUTH", authEvent]);
    this.authChallenge = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[Relay] Max reconnect attempts reached");
      store.dispatch({ type: "SET_ERROR", payload: "Unable to connect to relay" });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[Relay] Reconnecting in ${delay}ms...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(() => {
        // Error handled in connect()
      });
    }, delay);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let relayInstance: RelayConnection | null = null;

export function getRelay(): RelayConnection | null {
  return relayInstance;
}

export function initRelay(url: string): RelayConnection {
  if (relayInstance) {
    relayInstance.disconnect();
  }
  relayInstance = new RelayConnection(url);
  return relayInstance;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Subscribe to chat messages for a group
 */
export function subscribeToGroupMessages(
  groupId: string,
  callback: (message: ChatMessage) => void
): () => void {
  const relay = getRelay();
  if (!relay) {
    console.error("[Relay] Not initialized");
    return () => {};
  }

  // Subscribe to recent messages (last 24 hours) and new ones
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;

  console.log(`[Relay] Subscribing to group messages for group: ${groupId}`);

  return relay.subscribe(
    `group-messages-${groupId}`,
    [{ kinds: [KIND_CHAT_MESSAGE], "#h": [groupId], since: oneDayAgo, limit: 100 }],
    (event) => {
      console.log(`[Relay] Received message event for group ${groupId}:`, event);
      const message: ChatMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        replyTo: event.tags.find((t) => t[0] === "e")?.[1],
      };
      callback(message);
    }
  );
}

/**
 * Subscribe to group metadata
 */
export function subscribeToGroups(
  callback: (group: GroupInfo) => void
): () => void {
  const relay = getRelay();
  if (!relay) {
    console.error("[Relay] Not initialized");
    return () => {};
  }

  return relay.subscribe(
    "groups",
    [{ kinds: [KIND_GROUP_METADATA] }],
    (event) => {
      // Parse group metadata from tags
      const dTag = event.tags.find((t) => t[0] === "d")?.[1];
      const name = event.tags.find((t) => t[0] === "name")?.[1];
      const picture = event.tags.find((t) => t[0] === "picture")?.[1];
      const about = event.tags.find((t) => t[0] === "about")?.[1];

      if (dTag) {
        const group: GroupInfo = {
          id: dTag,
          name: name || `Group ${dTag.slice(0, 8)}...`,
          picture,
          about,
        };
        callback(group);
      }
    }
  );
}

/**
 * Send a chat message to a group
 */
export async function sendChatMessage(
  groupId: string,
  content: string,
  secretKey: string,
  replyTo?: string
): Promise<ChatMessage | null> {
  const relay = getRelay();
  if (!relay) {
    console.error("[Relay] Not initialized");
    return null;
  }

  const tags: string[][] = [["h", groupId]];
  
  // Add previous tag (NIP-29 requires referencing the previous message)
  const state = store.getState();
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage) {
    tags.push(["previous", lastMessage.id]);
  }

  if (replyTo) {
    tags.push(["e", replyTo, "", "reply"]);
  }

  const event = finalizeEvent({
    kind: KIND_CHAT_MESSAGE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  }, hexToBytes(secretKey));

  console.log(`[Relay] Publishing message to group ${groupId}:`, event);

  try {
    await relay.publish(event);
    
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      replyTo,
    };
  } catch (error) {
    console.error("[Relay] Failed to send message:", error);
    store.dispatch({ type: "SET_ERROR", payload: `Failed to send message: ${error}` });
    return null;
  }
}

/**
 * Send a join request to a group
 */
export async function sendJoinRequest(
  groupId: string,
  secretKey: string
): Promise<boolean> {
  const relay = getRelay();
  if (!relay) {
    console.error("[Relay] Not initialized");
    return false;
  }

  const event = finalizeEvent({
    kind: 9021, // NIP-29 join request
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", groupId]],
    content: "",
  }, hexToBytes(secretKey));

  try {
    await relay.publish(event);
    return true;
  } catch (error) {
    console.error("[Relay] Failed to send join request:", error);
    return false;
  }
}

/**
 * Send a leave request to a group
 */
export async function sendLeaveRequest(
  groupId: string,
  secretKey: string
): Promise<boolean> {
  const relay = getRelay();
  if (!relay) {
    console.error("[Relay] Not initialized");
    return false;
  }

  const event = finalizeEvent({
    kind: 9022, // NIP-29 leave request
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", groupId]],
    content: "",
  }, hexToBytes(secretKey));

  try {
    await relay.publish(event);
    return true;
  } catch (error) {
    console.error("[Relay] Failed to send leave request:", error);
    return false;
  }
}
