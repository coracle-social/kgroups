/**
 * @nkg/chat - Create Group view component
 * 
 * UI for creating a new group via DKG.
 */

import m from "mithril";
import { store } from "../state.js";
import { initiateDKG, startRound1, cleanupSession } from "../dkg.js";

interface CreateGroupState {
  groupName: string;
  threshold: number;
  participantsInput: string;
  creating: boolean;
  error: string | null;
}

// Use closure-based state to avoid vnode.state assignment issues
function createState(): CreateGroupState {
  const appState = store.getState();
  return {
    groupName: "",
    threshold: 2,
    participantsInput: appState.pubkey || "",
    creating: false,
    error: null,
  };
}

export function CreateGroupView(): m.Component<{}, CreateGroupState> {
  const state = createState();

  return {
    view() {
      const appState = store.getState();
      const dkgSession = appState.dkgSession;

    // If DKG is in progress, show progress UI
    if (dkgSession) {
      return m("div.create-group-view", [
        m("header", [
          m("h1", "Creating Group"),
        ]),

        m("div.dkg-progress", [
          m("h2", dkgSession.groupName || "New Group"),
          
          // Show Session ID for reference
          m("div.session-id-section", [
            m("p.session-label", "DKG Session ID:"),
            m("div.session-id-box", {
              style: "cursor: pointer;",
              title: "Click to copy",
              onclick: () => {
                if (dkgSession.sessionId) {
                  navigator.clipboard.writeText(dkgSession.sessionId).then(() => {
                    console.log("Session ID copied to clipboard");
                  }).catch((err) => {
                    console.error("Failed to copy Session ID:", err);
                  });
                }
              },
            }, [
              m("code", dkgSession.sessionId),
            ]),
            m("p.help-text", "All participants will automatically join this session via the relay."),
          ]),

          m("div.progress-steps", [
            m("div.step", { class: getStepClass("waiting", dkgSession.status) }, [
              m("div.step-icon", "1"),
              m("div.step-label", "Waiting for participants"),
            ]),
            m("div.step", { class: getStepClass("round1", dkgSession.status) }, [
              m("div.step-icon", "2"),
              m("div.step-label", "Exchanging commitments"),
            ]),
            m("div.step", { class: getStepClass("round2", dkgSession.status) }, [
              m("div.step-icon", "3"),
              m("div.step-label", "Distributing shares"),
            ]),
            m("div.step", { class: getStepClass("complete", dkgSession.status) }, [
              m("div.step-icon", "4"),
              m("div.step-label", "Complete"),
            ]),
          ]),

          dkgSession.status === "complete" && m("div.success", [
            m("p", "Group created successfully!"),
            dkgSession.groupPubkey && m("div.completion-info", [
              m("p.success-text", "The group key has been generated!"),
              m("div.group-id-section", [
                m("p", "Group ID (for joining the group):"),
                m("div.group-id-box", {
                  style: "cursor: pointer;",
                  title: "Click to copy",
                  onclick: () => {
                    if (dkgSession.groupPubkey) {
                      navigator.clipboard.writeText(dkgSession.groupPubkey).then(() => {
                        console.log("Group ID copied to clipboard");
                      }).catch((err) => {
                        console.error("Failed to copy Group ID:", err);
                      });
                    }
                  },
                }, [
                  m("code", dkgSession.groupPubkey),
                ]),
              ]),
            ]),
            m("button.primary", {
              onclick: () => {
                cleanupSession(dkgSession.sessionId);
                store.dispatch({ type: "SET_DKG_SESSION", payload: null });
                store.dispatch({ type: "SET_VIEW", payload: "groups" });
              },
            }, "Go to Groups"),
          ]),

          dkgSession.status === "failed" && m("div.error-box", [
            m("p", "Group creation failed"),
            dkgSession.error && m("p.error-detail", dkgSession.error),
            m("button.secondary", {
              onclick: () => {
                cleanupSession(dkgSession.sessionId);
                store.dispatch({ type: "SET_DKG_SESSION", payload: null });
              },
            }, "Try Again"),
          ]),

          (dkgSession.status === "waiting" || dkgSession.status === "round1" || dkgSession.status === "round2") && 
            m("div.waiting", [
              m("div.spinner-small"),
              m("p", getStatusMessage(dkgSession.status)),
            ]),
        ]),

        m("div.actions", [
          m("button.secondary", {
            onclick: () => {
              cleanupSession(dkgSession.sessionId);
              store.dispatch({ type: "SET_DKG_SESSION", payload: null });
            },
          }, "Cancel"),
        ]),
      ]);
    }

    // Otherwise show the form
    return m("div.create-group-view", [
      m("header", [
        m("button.back", {
          onclick: () => store.dispatch({ type: "SET_VIEW", payload: "groups" }),
        }, "< Back"),
        m("h1", "Create Group"),
      ]),

      m("div.create-form", [
        m("div.form-group", [
          m("label", "Group Name"),
          m("input[type=text]", {
            value: state.groupName,
            placeholder: "My Awesome Group",
            disabled: state.creating,
            oninput: (e: Event) => {
              state.groupName = (e.target as HTMLInputElement).value;
            },
          }),
        ]),

        m("div.form-group", [
          m("label", "Signing Threshold"),
          m("div.threshold-input", [
            m("input[type=number]", {
              value: state.threshold,
              min: 2,
              max: 10,
              disabled: state.creating,
              oninput: (e: Event) => {
                state.threshold = parseInt((e.target as HTMLInputElement).value) || 2;
              },
            }),
            m("span.help-text", `${state.threshold} of N admins required to sign`),
          ]),
        ]),

        m("div.form-group", [
          m("label", "Admin Pubkeys (one per line, including yours)"),
          m("textarea", {
            value: state.participantsInput,
            placeholder: "npub1...\nnpub2...\nnpub3...",
            rows: 5,
            disabled: state.creating,
            oninput: (e: Event) => {
              state.participantsInput = (e.target as HTMLTextAreaElement).value;
            },
          }),
          m("p.help-text", "Enter the hex pubkeys of all admins who will hold key shares"),
        ]),

        state.error && m("div.error", state.error),

        m("div.info-box", [
          m("h4", "How it works"),
          m("p", [
            "Creating a group uses ",
            m("strong", "Distributed Key Generation (DKG)"),
            " so no single admin ever sees the full group key.",
          ]),
          m("p", "All admins must be online simultaneously to complete the process."),
        ]),
      ]),

      m("div.actions", [
        m("button.primary", {
          disabled: state.creating || !state.groupName.trim() || !appState.relayConnected,
          onclick: () => startGroupCreation(state, appState.secretKey!, appState.pubkey!),
        }, state.creating ? "Starting..." : "Start DKG"),
      ]),
    ]);
    },
  };
}

function startGroupCreation(state: CreateGroupState, secretKey: string, myPubkey: string): void {
  state.error = null;

  // Parse participants
  const participants = state.participantsInput
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Validate
  if (participants.length < 2) {
    state.error = "At least 2 participants required";
    return;
  }

  if (state.threshold > participants.length) {
    state.error = `Threshold cannot exceed number of participants (${participants.length})`;
    return;
  }

  if (state.threshold < 2) {
    state.error = "Threshold must be at least 2";
    return;
  }

  // Validate pubkey format (64 hex chars)
  for (const p of participants) {
    if (p.length !== 64 || !/^[0-9a-f]+$/i.test(p)) {
      state.error = `Invalid pubkey format: ${p.slice(0, 20)}...`;
      return;
    }
  }

  // Check if my pubkey is included
  if (!participants.includes(myPubkey)) {
    state.error = "Your pubkey must be included in the participants list";
    return;
  }

  state.creating = true;

  try {
    const dkgState = initiateDKG(
      state.groupName,
      state.threshold,
      participants,
      secretKey,
      myPubkey
    );

    // Update app state
    store.dispatch({
      type: "SET_DKG_SESSION",
      payload: {
        sessionId: dkgState.sessionId,
        status: dkgState.status,
        groupName: state.groupName,
      },
    });

    // Start Round 1
    startRound1(dkgState.sessionId, secretKey);

  } catch (error) {
    state.error = `Failed to start DKG: ${error}`;
    state.creating = false;
  }
}

function getStepClass(step: string, currentStatus: string): string {
  const steps = ["waiting", "round1", "round2", "complete"];
  const stepIndex = steps.indexOf(step);
  const currentIndex = steps.indexOf(currentStatus);

  if (currentStatus === "failed") {
    return stepIndex <= currentIndex ? "failed" : "";
  }

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "active";
  return "";
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "waiting":
      return "Waiting for other participants to join...";
    case "round1":
      return "Exchanging commitments with other participants...";
    case "round2":
      return "Distributing key shares securely...";
    default:
      return "Processing...";
  }
}
