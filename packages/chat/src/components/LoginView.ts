/**
 * @nkg/chat - Login view component
 */

import m from "mithril";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { store } from "../state.js";
import { initRelay } from "../relay.js";
import { initDKGSubscription } from "../dkg.js";

interface LoginState {
  secretKeyInput: string;
  relayUrlInput: string;
  error: string | null;
  connecting: boolean;
}

export function LoginView(): m.Component {
  const state: LoginState = {
    secretKeyInput: "",
    relayUrlInput: "wss://bucket.coracle.social/",
    error: null,
    connecting: false,
  };

  return {
    view() {

    return m("div.login-view", [
      m("h1", "NKG Chat"),
      m("p", "Nostr Key Groups - NIP-29 Chat Demo"),

      m("div.login-form", [
        m("div.form-group", [
          m("label", "Relay URL"),
          m("input[type=text]", {
            value: state.relayUrlInput,
            disabled: state.connecting,
            oninput: (e: Event) => {
              state.relayUrlInput = (e.target as HTMLInputElement).value;
            },
            placeholder: "wss://bucket.coracle.social/",
          }),
        ]),

        m("div.form-group", [
          m("label", "Secret Key (hex) or leave empty to generate"),
          m("input[type=password]", {
            value: state.secretKeyInput,
            disabled: state.connecting,
            oninput: (e: Event) => {
              state.secretKeyInput = (e.target as HTMLInputElement).value;
            },
            placeholder: "Enter existing key or leave empty",
          }),
        ]),

        state.error && m("div.error", state.error),

        m("div.buttons", [
          m(
            "button.primary",
            {
              disabled: state.connecting,
              onclick: async () => {
                try {
                  state.error = null;
                  let secretKey = state.secretKeyInput;
                  
                  if (!secretKey) {
                    // Generate new key
                    secretKey = bytesToHex(generateSecretKey());
                  }

                  // Validate key
                  if (secretKey.length !== 64 || !/^[0-9a-f]+$/i.test(secretKey)) {
                    state.error = "Invalid secret key format (must be 64 hex characters)";
                    return;
                  }

                  // Try to derive pubkey to validate
                  getPublicKey(hexToBytes(secretKey));

                  // Initialize and connect to relay
                  state.connecting = true;
                  m.redraw();

                  const relay = initRelay(state.relayUrlInput);
                  
                  try {
                    await relay.connect();
                    
                    store.dispatch({ type: "SET_RELAY_URL", payload: state.relayUrlInput });
                    store.dispatch({ type: "SET_SECRET_KEY", payload: secretKey });
                    
                    // Initialize DKG event subscription so we can receive session invites
                    initDKGSubscription();
                  } catch (err) {
                    state.error = `Failed to connect to relay: ${err}`;
                    state.connecting = false;
                    m.redraw();
                  }
                } catch (err) {
                  state.error = "Invalid secret key";
                  state.connecting = false;
                }
              },
            },
            state.connecting 
              ? "Connecting..." 
              : (state.secretKeyInput ? "Login" : "Generate Key & Login")
          ),
        ]),
      ]),

      m("div.info", [
        m("h3", "About"),
        m("p", [
          "This is a proof-of-concept chat application using ",
          m("a[href=https://github.com/nostr-protocol/nips/blob/master/29.md][target=_blank]", "NIP-29"),
          " relay-based groups with capability-based authorization.",
        ]),
      ]),
    ]);
    },
  };
}
