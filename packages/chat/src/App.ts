/**
 * @nkg/chat - Main application component
 */

import m from "mithril";
import { store } from "./state.js";
import { LoginView } from "./components/LoginView.js";
import { GroupsView } from "./components/GroupsView.js";
import { ChatView } from "./components/ChatView.js";
import { CreateGroupView } from "./components/CreateGroupView.js";

// Create component instances once (closure components need stable references)
let loginView: m.Component | null = null;
let groupsView: m.Component | null = null;
let chatView: m.Component | null = null;
let createGroupView: m.Component | null = null;

// Track current view to reset components when switching
let lastView: string | null = null;

export const App: m.Component = {
  oninit() {
    // Subscribe to state changes and trigger redraws
    store.subscribe(() => m.redraw());
  },

  view() {
    const state = store.getState();

    // Reset component instances when view changes to get fresh state
    if (lastView !== state.view) {
      lastView = state.view;
      if (state.view === "login") loginView = LoginView();
      if (state.view === "groups") groupsView = GroupsView();
      if (state.view === "chat") chatView = ChatView();
      if (state.view === "create-group") createGroupView = CreateGroupView();
    }

    return m("div.app", [
      state.error && m("div.global-error", [
        m("span", state.error),
        m("button", { onclick: () => store.dispatch({ type: "SET_ERROR", payload: null }) }, "x"),
      ]),

      state.loading && m("div.loading-overlay", m("div.spinner")),

      // Route to appropriate view
      state.view === "login" && loginView && m(loginView),
      state.view === "groups" && groupsView && m(groupsView),
      state.view === "chat" && chatView && m(chatView),
      state.view === "create-group" && createGroupView && m(createGroupView),
    ]);
  },
};
