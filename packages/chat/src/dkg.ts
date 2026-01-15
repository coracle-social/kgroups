/**
 * @nkg/chat - DKG coordination via nostr events
 * 
 * Manages distributed key generation sessions for creating groups.
 * Participants communicate via ephemeral nostr events.
 */

import {
  createDKGSession,
  generateSessionId,
  generateRound1Package,
  processRound1Package,
  generateRound2Packages,
  processRound2Package,
  finalizeDKG,
  DKG_EVENT_KINDS,
  PROTOCOL_TAGS,
  type DKGSession,
  type DKGConfig,
  type DKGRound1Package,
  type DKGRound2Package,
  type KeyPackage,
} from "@nkg/signer";
import { finalizeEvent, type Event } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import m from "mithril";
import { getRelay } from "./relay.js";
import { store } from "./state.js";

// ============================================================================
// DKG Session Manager
// ============================================================================

export interface DKGSessionState {
  sessionId: string;
  groupName: string;
  threshold: number;
  participants: string[];
  myIndex: number;
  session: DKGSession | null;
  status: "waiting" | "round1" | "round2" | "complete" | "failed";
  error: string | null;
  keyPackage: KeyPackage | null;
}

// Active DKG sessions
const activeSessions: Map<string, DKGSessionState> = new Map();
let unsubscribe: (() => void) | null = null;

/**
 * Initialize a new DKG session as the coordinator
 */
export function initiateDKG(
  groupName: string,
  threshold: number,
  participantPubkeys: string[],
  mySecretKey: string,
  myPubkey: string
): DKGSessionState {
  const sessionId = generateSessionId();
  
  // Find my index (1-based)
  const sortedParticipants = [...participantPubkeys].sort();
  const myIndex = sortedParticipants.indexOf(myPubkey) + 1;
  
  if (myIndex === 0) {
    throw new Error("My pubkey not found in participants");
  }

  const config: DKGConfig = {
    sessionId,
    threshold,
    maxSigners: participantPubkeys.length,
    participants: sortedParticipants,
    myIndex,
    mySecretKey,
  };

  const session = createDKGSession(config);

  const state: DKGSessionState = {
    sessionId,
    groupName,
    threshold,
    participants: sortedParticipants,
    myIndex,
    session,
    status: "waiting",
    error: null,
    keyPackage: null,
  };

  activeSessions.set(sessionId, state);

  // Broadcast session initiation
  broadcastSessionInit(state, mySecretKey);

  // Subscribe to DKG events if not already
  subscribeToSessionEvents();

  return state;
}

/**
 * Join an existing DKG session
 */
export function joinDKG(
  sessionId: string,
  groupName: string,
  threshold: number,
  participantPubkeys: string[],
  mySecretKey: string,
  myPubkey: string
): DKGSessionState {
  const sortedParticipants = [...participantPubkeys].sort();
  const myIndex = sortedParticipants.indexOf(myPubkey) + 1;
  
  if (myIndex === 0) {
    throw new Error("My pubkey not found in participants");
  }

  const config: DKGConfig = {
    sessionId,
    threshold,
    maxSigners: participantPubkeys.length,
    participants: sortedParticipants,
    myIndex,
    mySecretKey,
  };

  const session = createDKGSession(config);

  const state: DKGSessionState = {
    sessionId,
    groupName,
    threshold,
    participants: sortedParticipants,
    myIndex,
    session,
    status: "waiting",
    error: null,
    keyPackage: null,
  };

  activeSessions.set(sessionId, state);
  subscribeToSessionEvents();

  return state;
}

/**
 * Start Round 1 for a session
 */
export function startRound1(sessionId: string, mySecretKey: string): void {
  const state = activeSessions.get(sessionId);
  if (!state || !state.session) {
    console.error("[DKG] Session not found:", sessionId);
    return;
  }

  try {
    const { package: round1Pkg, session: updatedSession } = generateRound1Package(state.session);
    state.session = updatedSession;
    state.status = "round1";

    // Broadcast Round 1 package
    broadcastRound1Package(state, round1Pkg, mySecretKey);
    
    m.redraw();
  } catch (error) {
    state.error = `Round 1 failed: ${error}`;
    state.status = "failed";
    m.redraw();
  }
}

/**
 * Get active session by ID
 */
export function getSession(sessionId: string): DKGSessionState | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): DKGSessionState[] {
  return Array.from(activeSessions.values());
}

/**
 * Clean up a session
 */
export function cleanupSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

// ============================================================================
// Event Broadcasting
// ============================================================================

function broadcastSessionInit(state: DKGSessionState, secretKey: string): void {
  const relay = getRelay();
  if (!relay) return;

  const event = finalizeEvent({
    kind: DKG_EVENT_KINDS.SESSION_INIT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      [PROTOCOL_TAGS.SESSION, state.sessionId],
      ["name", state.groupName],
      ["threshold", state.threshold.toString()],
      ["max_signers", state.participants.length.toString()],
      ...state.participants.map((p) => ["p", p]),
    ],
    content: "",
  }, hexToBytes(secretKey));

  relay.publish(event).catch(console.error);
}

function broadcastRound1Package(
  state: DKGSessionState,
  pkg: DKGRound1Package,
  secretKey: string
): void {
  const relay = getRelay();
  if (!relay) return;

  const event = finalizeEvent({
    kind: DKG_EVENT_KINDS.ROUND1_PACKAGE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      [PROTOCOL_TAGS.SESSION, state.sessionId],
      [PROTOCOL_TAGS.INDEX, pkg.idx.toString()],
      [PROTOCOL_TAGS.ROUND, "1"],
    ],
    content: JSON.stringify({
      idx: pkg.idx,
      vssCommitments: pkg.vssCommitments,
    }),
  }, hexToBytes(secretKey));

  relay.publish(event).catch(console.error);
}

function broadcastRound2Package(
  state: DKGSessionState,
  pkg: DKGRound2Package,
  recipientPubkey: string,
  secretKey: string
): void {
  const relay = getRelay();
  if (!relay) return;

  const event = finalizeEvent({
    kind: DKG_EVENT_KINDS.ROUND2_PACKAGE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      [PROTOCOL_TAGS.SESSION, state.sessionId],
      [PROTOCOL_TAGS.INDEX, pkg.fromIdx.toString()],
      [PROTOCOL_TAGS.ROUND, "2"],
      [PROTOCOL_TAGS.RECIPIENT, recipientPubkey],
    ],
    content: JSON.stringify({
      fromIdx: pkg.fromIdx,
      toIdx: pkg.toIdx,
      encryptedShare: pkg.encryptedShare,
    }),
  }, hexToBytes(secretKey));

  relay.publish(event).catch(console.error);
}

function broadcastCompletion(
  state: DKGSessionState,
  groupPubkey: string,
  secretKey: string
): void {
  const relay = getRelay();
  if (!relay) return;

  const event = finalizeEvent({
    kind: DKG_EVENT_KINDS.COMPLETION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      [PROTOCOL_TAGS.SESSION, state.sessionId],
      ["group_pubkey", groupPubkey],
    ],
    content: "",
  }, hexToBytes(secretKey));

  relay.publish(event).catch(console.error);
}

// ============================================================================
// Event Subscription & Processing
// ============================================================================

function subscribeToSessionEvents(): void {
  if (unsubscribe) return;

  const relay = getRelay();
  if (!relay) return;

  // Subscribe to DKG events from the last 5 minutes to catch recent session initiations
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

  unsubscribe = relay.subscribe(
    "dkg-events",
    [
      { 
        kinds: [DKG_EVENT_KINDS.SESSION_INIT, DKG_EVENT_KINDS.ROUND1_PACKAGE, DKG_EVENT_KINDS.ROUND2_PACKAGE, DKG_EVENT_KINDS.COMPLETION],
        since: fiveMinutesAgo,
      },
    ],
    handleDKGEvent
  );
}

/**
 * Initialize DKG event subscription (call this on login)
 */
export function initDKGSubscription(): void {
  subscribeToSessionEvents();
}

function handleDKGEvent(event: Event): void {
  const sessionId = event.tags.find((t) => t[0] === PROTOCOL_TAGS.SESSION)?.[1];
  if (!sessionId) return;

  const state = activeSessions.get(sessionId);
  if (!state) {
    // Check if this is a session init we should join
    if (event.kind === DKG_EVENT_KINDS.SESSION_INIT) {
      handleSessionInit(event);
    }
    return;
  }

  const appState = store.getState();
  if (!appState.secretKey) return;

  switch (event.kind) {
    case DKG_EVENT_KINDS.ROUND1_PACKAGE:
      handleRound1Package(state, event, appState.secretKey);
      break;
    case DKG_EVENT_KINDS.ROUND2_PACKAGE:
      handleRound2Package(state, event, appState.secretKey);
      break;
    case DKG_EVENT_KINDS.COMPLETION:
      handleCompletion(state, event);
      break;
  }
}

function handleSessionInit(event: Event): void {
  const appState = store.getState();
  if (!appState.pubkey || !appState.secretKey) return;

  // Check if we're a participant
  const participants = event.tags.filter((t) => t[0] === "p").map((t) => t[1]!);
  if (!participants.includes(appState.pubkey)) return;

  const sessionId = event.tags.find((t) => t[0] === PROTOCOL_TAGS.SESSION)?.[1];
  const name = event.tags.find((t) => t[0] === "name")?.[1] || "Unknown Group";
  const threshold = parseInt(event.tags.find((t) => t[0] === "threshold")?.[1] || "2");

  if (sessionId && !activeSessions.has(sessionId)) {
    // Auto-join the session
    const state = joinDKG(
      sessionId,
      name,
      threshold,
      participants,
      appState.secretKey,
      appState.pubkey
    );

    // Auto-start Round 1
    startRound1(sessionId, appState.secretKey);

    // Notify UI
    store.dispatch({
      type: "SET_DKG_SESSION",
      payload: { sessionId, status: "round1", groupName: name },
    });
  }
}

function handleRound1Package(state: DKGSessionState, event: Event, secretKey: string): void {
  if (!state.session) return;

  try {
    const pkg: DKGRound1Package = JSON.parse(event.content);
    
    // Don't process our own package
    if (pkg.idx === state.myIndex) return;

    state.session = processRound1Package(state.session, pkg);

    // Check if we have all Round 1 packages
    if (state.session.state === "round1_complete") {
      // Generate and broadcast Round 2 packages
      const { packages, session: updatedSession } = generateRound2Packages(state.session);
      state.session = updatedSession;
      state.status = "round2";

      // Send each Round 2 package to the appropriate recipient
      for (const pkg of packages) {
        const recipientPubkey = state.participants[pkg.toIdx - 1];
        if (recipientPubkey) {
          broadcastRound2Package(state, pkg, recipientPubkey, secretKey);
        }
      }

      m.redraw();
    }
  } catch (error) {
    console.error("[DKG] Failed to process Round 1 package:", error);
  }
}

function handleRound2Package(state: DKGSessionState, event: Event, secretKey: string): void {
  if (!state.session) return;

  // Check if this package is for us
  const recipientTag = event.tags.find((t) => t[0] === PROTOCOL_TAGS.RECIPIENT);
  const appState = store.getState();
  if (recipientTag?.[1] !== appState.pubkey) return;

  try {
    const pkg: DKGRound2Package = JSON.parse(event.content);
    
    // Don't process our own package
    if (pkg.fromIdx === state.myIndex) return;

    state.session = processRound2Package(state.session, pkg);

    // Check if we have all Round 2 packages
    if (state.session.state === "round2_complete") {
      // Finalize DKG
      const { keyPackage, session: finalSession } = finalizeDKG(state.session);
      state.session = finalSession;
      state.keyPackage = keyPackage;
      state.status = "complete";

      // Broadcast completion
      broadcastCompletion(state, keyPackage.groupPubkey, secretKey);

      // Notify UI
      store.dispatch({
        type: "SET_DKG_SESSION",
        payload: { sessionId: state.sessionId, status: "complete", groupPubkey: keyPackage.groupPubkey },
      });

      // Add the new group
      store.dispatch({
        type: "ADD_GROUP",
        payload: {
          id: keyPackage.groupPubkey,
          name: state.groupName,
        },
      });

      m.redraw();
    }
  } catch (error) {
    console.error("[DKG] Failed to process Round 2 package:", error);
    state.error = `Round 2 failed: ${error}`;
    state.status = "failed";
    m.redraw();
  }
}

function handleCompletion(state: DKGSessionState, event: Event): void {
  const groupPubkey = event.tags.find((t) => t[0] === "group_pubkey")?.[1];
  if (groupPubkey) {
    console.log(`[DKG] Session ${state.sessionId} completed with group pubkey: ${groupPubkey}`);
  }
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanupAllSessions(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  activeSessions.clear();
}
