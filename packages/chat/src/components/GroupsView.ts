/**
 * @nkg/chat - Groups list view component
 */

import m from "mithril";
import { store } from "../state.js";
import { subscribeToGroups, sendJoinRequest, getRelay, initRelay } from "../relay.js";
import type { GroupInfo } from "../types.js";

interface GroupsState {
  unsubscribe: (() => void) | null;
  joining: boolean;
  showSettings: boolean;
  relayUrlInput: string;
  reconnecting: boolean;
}

export function GroupsView(): m.Component {
  const appState = store.getState();
  const state: GroupsState = {
    unsubscribe: null,
    joining: false,
    showSettings: false,
    relayUrlInput: appState.relayUrl || "ws://localhost:8080",
    reconnecting: false,
  };

  return {
    oninit() {
      // Subscribe to group metadata
      state.unsubscribe = subscribeToGroups((group) => {
        store.dispatch({ type: "ADD_GROUP", payload: group });
      });
    },

    onremove() {
      if (state.unsubscribe) {
        state.unsubscribe();
        state.unsubscribe = null;
      }
    },

    view() {
      const appState = store.getState();

      return m("div.groups-view", [
        m("header", [
          m("h1", "Groups"),
          m("div.user-info", [
            m("div.connection-status", {
              class: appState.relayConnected ? "connected" : "disconnected",
              title: appState.relayConnected ? `Connected to ${appState.relayUrl}` : "Disconnected",
              onclick: () => {
                state.showSettings = !state.showSettings;
                state.relayUrlInput = appState.relayUrl || "ws://localhost:8080";
              },
              style: "cursor: pointer;",
            }),
            m("span.pubkey", {
              title: appState.pubkey,
              style: "cursor: pointer;",
              onclick: () => {
                if (appState.pubkey) {
                  navigator.clipboard.writeText(appState.pubkey).then(() => {
                    // Optional: Could add a toast notification here
                    console.log("Pubkey copied to clipboard");
                  }).catch((err) => {
                    console.error("Failed to copy pubkey:", err);
                  });
                }
              },
            }, `${appState.pubkey?.slice(0, 8)}...`),
            m(
              "button.logout",
              {
                onclick: () => {
                  getRelay()?.disconnect();
                  store.dispatch({ type: "LOGOUT" });
                },
              },
              "Logout"
            ),
          ]),
        ]),

        // Settings panel
        state.showSettings && m("div.settings-panel", [
          m("div.settings-header", [
            m("h3", "Settings"),
            m("button.close", {
              onclick: () => { state.showSettings = false; },
            }, "x"),
          ]),
          m("div.form-group", [
            m("label", "Relay URL"),
            m("input[type=text]", {
              value: state.relayUrlInput,
              disabled: state.reconnecting,
              oninput: (e: Event) => {
                state.relayUrlInput = (e.target as HTMLInputElement).value;
              },
              onkeydown: (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  changeRelay(state, appState.relayUrl || "");
                }
              },
            }),
          ]),
          m("div.settings-actions", [
            m("button.secondary", {
              disabled: state.reconnecting,
              onclick: () => { state.showSettings = false; },
            }, "Cancel"),
            m("button.primary", {
              disabled: state.reconnecting || state.relayUrlInput === appState.relayUrl,
              onclick: () => changeRelay(state, appState.relayUrl || ""),
            }, state.reconnecting ? "Connecting..." : "Change Relay"),
          ]),
        ]),

      m("div.groups-list", [
        appState.groups.length === 0
          ? m("div.empty", [
              m("p", appState.relayConnected ? "No groups found." : "Connecting to relay..."),
              appState.relayConnected && m("p", "Join a group or create one to get started."),
            ])
          : appState.groups.map((group) =>
              m(GroupCard, { key: group.id, group })
            ),
      ]),

      m("div.actions", [
        m(
          "button.primary",
          {
            disabled: !appState.relayConnected,
            onclick: () => {
              store.dispatch({ type: "SET_VIEW", payload: "create-group" });
            },
          },
          "Create Group"
        ),
        m(
          "button.secondary",
          {
            disabled: !appState.relayConnected || state.joining,
            onclick: async () => {
              const groupId = prompt("Enter group ID:");
              if (groupId && appState.secretKey) {
                state.joining = true;
                m.redraw();
                
                try {
                  const success = await sendJoinRequest(groupId, appState.secretKey);
                  if (success) {
                    // Add placeholder group while waiting for metadata
                    store.dispatch({
                      type: "ADD_GROUP",
                      payload: { id: groupId, name: `Group ${groupId.slice(0, 8)}...` },
                    });
                  }
                } finally {
                  state.joining = false;
                  m.redraw();
                }
              }
            },
          },
          state.joining ? "Joining..." : "Join Group"
        ),
      ]),
    ]);
    },
  };
}

const GroupCard: m.Component<{ group: GroupInfo }> = {
  view(vnode) {
    const { group } = vnode.attrs;

    return m(
      "div.group-card",
      {
        onclick: () => store.dispatch({ type: "SELECT_GROUP", payload: group.id }),
      },
      [
        group.picture
          ? m("img.group-picture", { src: group.picture, alt: group.name })
          : m("div.group-picture.placeholder", group.name[0]?.toUpperCase() ?? "?"),
        m("div.group-info", [
          m("h3", group.name),
          group.about && m("p.about", group.about),
          m("div.meta", [
            group.memberCount !== undefined &&
              m("span.members", `${group.memberCount} members`),
            group.unreadCount !== undefined &&
              group.unreadCount > 0 &&
              m("span.unread", group.unreadCount),
          ]),
        ]),
      ]
    );
  },
};

async function changeRelay(state: GroupsState, currentUrl: string): Promise<void> {
  const newUrl = state.relayUrlInput.trim();
  if (!newUrl || newUrl === currentUrl) return;

  state.reconnecting = true;
  m.redraw();

  try {
    // Disconnect from current relay
    getRelay()?.disconnect();

    // Clear groups since they're relay-specific
    store.dispatch({ type: "SET_GROUPS", payload: [] });

    // Connect to new relay
    const relay = initRelay(newUrl);
    await relay.connect();

    // Update state
    store.dispatch({ type: "SET_RELAY_URL", payload: newUrl });
    state.showSettings = false;
  } catch (error) {
    store.dispatch({ type: "SET_ERROR", payload: `Failed to connect to ${newUrl}: ${error}` });
    
    // Try to reconnect to original relay
    if (currentUrl) {
      try {
        const relay = initRelay(currentUrl);
        await relay.connect();
      } catch {
        // If reconnect fails, stay disconnected
      }
    }
  } finally {
    state.reconnecting = false;
    m.redraw();
  }
}
