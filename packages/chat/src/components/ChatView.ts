/**
 * @nkg/chat - Chat view component
 */

import m from "mithril";
import { store } from "../state.js";
import { subscribeToGroupMessages, sendChatMessage } from "../relay.js";
import type { ChatMessage } from "../types.js";

interface ChatState {
  messageInput: string;
  unsubscribe: (() => void) | null;
  sending: boolean;
}

export function ChatView(): m.Component {
  const state: ChatState = {
    messageInput: "",
    unsubscribe: null,
    sending: false,
  };

  return {
    oninit() {
      // Subscribe to messages for current group
      const appState = store.getState();
      if (appState.currentGroup) {
        // Clear existing messages
        store.dispatch({ type: "SET_MESSAGES", payload: [] });
        
        console.log(`[ChatView] Subscribing to messages for group: ${appState.currentGroup}`);
        state.unsubscribe = subscribeToGroupMessages(appState.currentGroup, (message) => {
          console.log(`[ChatView] Received message:`, message);
          // Check if message already exists (dedup)
          const current = store.getState();
          if (!current.messages.some((m) => m.id === message.id)) {
            store.dispatch({ type: "ADD_MESSAGE", payload: message });
          }
        });
      }
    },

    onremove() {
      // Cleanup subscription when leaving chat view
      if (state.unsubscribe) {
        state.unsubscribe();
        state.unsubscribe = null;
      }
    },

    view() {
      const appState = store.getState();
      const currentGroup = appState.groups.find((g) => g.id === appState.currentGroup);

    return m("div.chat-view", [
      m("header", [
        m(
          "button.back",
          {
            onclick: () => store.dispatch({ type: "SET_VIEW", payload: "groups" }),
          },
          "< Back"
        ),
        m("div.header-info", [
          m("h2", currentGroup?.name ?? "Unknown Group"),
          m("div.group-id", appState.currentGroup?.slice(0, 12) + "..."),
        ]),
        m("div.connection-status", {
          class: appState.relayConnected ? "connected" : "disconnected",
          title: appState.relayConnected ? "Connected to relay" : "Disconnected from relay",
        }),
      ]),

      m(
        "div.messages",
        {
          oncreate: (vnode) => {
            // Scroll to bottom on create
            const el = vnode.dom as HTMLElement;
            el.scrollTop = el.scrollHeight;
          },
          onupdate: (vnode) => {
            // Scroll to bottom on new messages
            const el = vnode.dom as HTMLElement;
            el.scrollTop = el.scrollHeight;
          },
        },
        [
          appState.messages.length === 0
            ? m("div.empty", "No messages yet. Say hello!")
            : appState.messages.map((msg) =>
                m(MessageBubble, { key: msg.id, message: msg, isOwn: msg.pubkey === appState.pubkey })
              ),
        ]
      ),

      m("div.message-input", [
        m("input[type=text]", {
          value: state.messageInput,
          placeholder: appState.relayConnected ? "Type a message..." : "Connecting...",
          disabled: !appState.relayConnected || state.sending,
          oninput: (e: Event) => {
            state.messageInput = (e.target as HTMLInputElement).value;
          },
          onkeydown: async (e: KeyboardEvent) => {
            if (e.key === "Enter" && state.messageInput.trim() && !state.sending) {
              await sendMessage(state, appState.currentGroup!, appState.secretKey!);
            }
          },
        }),
        m(
          "button.send",
          {
            disabled: !state.messageInput.trim() || !appState.relayConnected || state.sending,
            onclick: async () => {
              if (state.messageInput.trim() && !state.sending) {
                await sendMessage(state, appState.currentGroup!, appState.secretKey!);
              }
            },
          },
          state.sending ? "..." : "Send"
        ),
      ]),
    ]);
    },
  };
}

const MessageBubble: m.Component<{ message: ChatMessage; isOwn: boolean }> = {
  view(vnode) {
    const { message, isOwn } = vnode.attrs;
    const time = new Date(message.createdAt * 1000).toLocaleTimeString();

    return m(
      "div.message-bubble",
      { class: isOwn ? "own" : "other" },
      [
        !isOwn && m("div.sender", message.pubkey.slice(0, 8) + "..."),
        m("div.content", message.content),
        m("div.time", time),
      ]
    );
  },
};

async function sendMessage(chatState: ChatState, groupId: string, secretKey: string): Promise<void> {
  const content = chatState.messageInput.trim();
  if (!content) return;

  chatState.sending = true;
  chatState.messageInput = "";
  m.redraw();

  try {
    const message = await sendChatMessage(groupId, content, secretKey);
    
    if (message) {
      // Add message to local state (will also come from relay, but this is faster)
      const current = store.getState();
      if (!current.messages.some((m) => m.id === message.id)) {
        store.dispatch({ type: "ADD_MESSAGE", payload: message });
      }
    }
  } catch (error) {
    console.error("Failed to send message:", error);
    // Restore message input on failure
    chatState.messageInput = content;
  } finally {
    chatState.sending = false;
    m.redraw();
  }
}
