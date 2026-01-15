// @nkg/cap - Capability issuance and validation
// Types
export * from "./types.js";
// Capability creation and parsing
export { createCapabilityGrantEvent, createCapabilityRevocationEvent, createCapabilityDelegationEvent, parseCapabilityGrantEvent, parseRevocationEvent, parseDelegationEvent, capabilityAllowsAction, isCapabilityExpired, eventMatchesRequiredTags, eventHasExcludedTags, } from "./capability.js";
// Validation
export { validateCapabilityEvent, validateDelegatedCapability, checkAuthorization, CapabilityStore, } from "./validation.js";
//# sourceMappingURL=index.js.map