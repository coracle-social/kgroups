// @nkg/chat - Proof of concept chat app
import m from "mithril";
import { App } from "./App.js";

// Mount the application
const root = document.getElementById("app");
if (root) {
  m.mount(root, App);
} else {
  // Create root element if it doesn't exist
  const appRoot = document.createElement("div");
  appRoot.id = "app";
  document.body.appendChild(appRoot);
  m.mount(appRoot, App);
}
