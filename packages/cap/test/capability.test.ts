import { describe, it, expect, beforeEach } from "vitest";
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import {
  createCapabilityGrantEvent,
  createCapabilityRevocationEvent,
  parseCapabilityGrantEvent,
  parseRevocationEvent,
  validateCapabilityEvent,
  checkAuthorization,
  isCapabilityExpired,
  CapabilityStore,
  CAPABILITY_EVENT_KINDS,
  type Capability,
  type ValidationContext,
} from "../src/index.js";

describe("Capability System", () => {
  let groupSecretKey: Uint8Array;
  let groupPubkey: string;
  let userPubkey: string;

  beforeEach(() => {
    groupSecretKey = generateSecretKey();
    groupPubkey = getPublicKey(groupSecretKey);
    userPubkey = getPublicKey(generateSecretKey());
  });

  describe("createCapabilityGrantEvent", () => {
    it("should create a basic capability grant event", () => {
      const event = createCapabilityGrantEvent(userPubkey, "read", groupPubkey);

      expect(event.kind).toBe(CAPABILITY_EVENT_KINDS.GRANT);
      expect(event.pubkey).toBe(groupPubkey);
      expect(event.tags).toContainEqual(["p", userPubkey]);
      expect(event.tags).toContainEqual(["capability", "read"]);
    });

    it("should create a capability with expiration", () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const event = createCapabilityGrantEvent(userPubkey, "write", groupPubkey, {
        expiresAt,
      });

      expect(event.tags).toContainEqual(["expiration", String(expiresAt)]);
    });

    it("should create a capability with kind qualifiers", () => {
      const event = createCapabilityGrantEvent(userPubkey, "write", groupPubkey, {
        qualifiers: {
          kinds: [1, 9, 10],
        },
      });

      expect(event.tags).toContainEqual(["kinds", "1", "9", "10"]);
    });

    it("should create a capability with rate limit", () => {
      const event = createCapabilityGrantEvent(userPubkey, "write", groupPubkey, {
        qualifiers: {
          rateLimit: { count: 10, periodSeconds: 60 },
        },
      });

      expect(event.tags).toContainEqual(["rate-limit", "10", "60"]);
    });
  });

  describe("parseCapabilityGrantEvent", () => {
    it("should parse a signed capability event", () => {
      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "read",
        groupPubkey,
        {
          qualifiers: { kinds: [1, 9] },
        }
      );
      const signedEvent = finalizeEvent(unsignedEvent, groupSecretKey);

      const result = parseCapabilityGrantEvent(signedEvent);

      expect(result).not.toBeNull();
      expect(result!.capability.type).toBe("read");
      expect(result!.capability.holder).toBe(userPubkey);
      expect(result!.capability.issuer).toBe(groupPubkey);
      expect(result!.capability.qualifiers?.kinds).toEqual([1, 9]);
    });

    it("should return null for invalid event kind", () => {
      const event = {
        id: "test",
        pubkey: groupPubkey,
        kind: 1, // Wrong kind
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", userPubkey], ["capability", "read"]],
        content: "",
        sig: "test",
      };

      const result = parseCapabilityGrantEvent(event);
      expect(result).toBeNull();
    });
  });

  describe("validateCapabilityEvent", () => {
    it("should validate a correctly signed capability", () => {
      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "write",
        groupPubkey
      );
      const signedEvent = finalizeEvent(unsignedEvent, groupSecretKey);

      const context: ValidationContext = {
        currentTime: Math.floor(Date.now() / 1000),
        revokedEventIds: new Set(),
      };

      const result = validateCapabilityEvent(signedEvent, groupPubkey, context);

      expect(result.valid).toBe(true);
      expect(result.capability).toBeDefined();
      expect(result.capability!.type).toBe("write");
    });

    it("should reject capability from wrong issuer", () => {
      const otherSecretKey = generateSecretKey();
      const otherPubkey = getPublicKey(otherSecretKey);

      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "write",
        otherPubkey
      );
      const signedEvent = finalizeEvent(unsignedEvent, otherSecretKey);

      const context: ValidationContext = {
        currentTime: Math.floor(Date.now() / 1000),
        revokedEventIds: new Set(),
      };

      const result = validateCapabilityEvent(signedEvent, groupPubkey, context);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not issued by expected group");
    });

    it("should reject revoked capability", () => {
      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "write",
        groupPubkey
      );
      const signedEvent = finalizeEvent(unsignedEvent, groupSecretKey);

      const context: ValidationContext = {
        currentTime: Math.floor(Date.now() / 1000),
        revokedEventIds: new Set([signedEvent.id]),
      };

      const result = validateCapabilityEvent(signedEvent, groupPubkey, context);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("revoked");
    });

    it("should reject expired capability", () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "write",
        groupPubkey,
        { expiresAt: pastTime }
      );
      const signedEvent = finalizeEvent(unsignedEvent, groupSecretKey);

      const context: ValidationContext = {
        currentTime: Math.floor(Date.now() / 1000),
        revokedEventIds: new Set(),
      };

      const result = validateCapabilityEvent(signedEvent, groupPubkey, context);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });
  });

  describe("checkAuthorization", () => {
    it("should authorize holder with matching capability", () => {
      const capability: Capability = {
        type: "write",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000),
      };

      const result = checkAuthorization([capability], userPubkey, "write");

      expect(result.authorized).toBe(true);
      expect(result.capability).toEqual(capability);
    });

    it("should reject holder without capability", () => {
      const capability: Capability = {
        type: "read",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000),
      };

      const result = checkAuthorization([capability], userPubkey, "write");

      expect(result.authorized).toBe(false);
    });

    it("should respect kind qualifiers", () => {
      const capability: Capability = {
        type: "write",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000),
        qualifiers: { kinds: [1, 9] },
      };

      // Allowed kind
      const result1 = checkAuthorization([capability], userPubkey, "write", {
        eventKind: 1,
      });
      expect(result1.authorized).toBe(true);

      // Disallowed kind
      const result2 = checkAuthorization([capability], userPubkey, "write", {
        eventKind: 42,
      });
      expect(result2.authorized).toBe(false);
    });
  });

  describe("isCapabilityExpired", () => {
    it("should return false for capability without expiration", () => {
      const capability: Capability = {
        type: "read",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000),
      };

      expect(isCapabilityExpired(capability)).toBe(false);
    });

    it("should return false for non-expired capability", () => {
      const capability: Capability = {
        type: "read",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(isCapabilityExpired(capability)).toBe(false);
    });

    it("should return true for expired capability", () => {
      const capability: Capability = {
        type: "read",
        holder: userPubkey,
        issuer: groupPubkey,
        issuedAt: Math.floor(Date.now() / 1000) - 7200,
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
      };

      expect(isCapabilityExpired(capability)).toBe(true);
    });
  });

  describe("CapabilityStore", () => {
    let store: CapabilityStore;

    beforeEach(() => {
      store = new CapabilityStore();
    });

    it("should add and retrieve capabilities", () => {
      const unsignedEvent = createCapabilityGrantEvent(
        userPubkey,
        "read",
        groupPubkey
      );
      const signedEvent = finalizeEvent(unsignedEvent, groupSecretKey);

      const result = store.addCapability(signedEvent, groupPubkey);
      expect(result.valid).toBe(true);

      const capabilities = store.getCapabilitiesForHolder(userPubkey);
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]!.type).toBe("read");
    });

    it("should handle revocations", () => {
      // Add capability
      const capEvent = finalizeEvent(
        createCapabilityGrantEvent(userPubkey, "write", groupPubkey),
        groupSecretKey
      );
      store.addCapability(capEvent, groupPubkey);

      // Verify it exists
      expect(store.getCapabilitiesForHolder(userPubkey)).toHaveLength(1);

      // Revoke it
      const revokeEvent = finalizeEvent(
        createCapabilityRevocationEvent(capEvent.id, groupPubkey),
        groupSecretKey
      );
      const revokeResult = store.addRevocation(revokeEvent, groupPubkey);

      expect(revokeResult).toBe(true);
      expect(store.isRevoked(capEvent.id)).toBe(true);
      expect(store.getCapabilitiesForHolder(userPubkey)).toHaveLength(0);
    });

    it("should check authorization correctly", () => {
      const capEvent = finalizeEvent(
        createCapabilityGrantEvent(userPubkey, "write", groupPubkey, {
          qualifiers: { kinds: [9, 10] },
        }),
        groupSecretKey
      );
      store.addCapability(capEvent, groupPubkey);

      // Should authorize for allowed kind
      const result1 = store.checkAuthorization(userPubkey, "write", {
        eventKind: 9,
      });
      expect(result1.authorized).toBe(true);

      // Should reject for disallowed kind
      const result2 = store.checkAuthorization(userPubkey, "write", {
        eventKind: 1,
      });
      expect(result2.authorized).toBe(false);

      // Should reject for different action
      const result3 = store.checkAuthorization(userPubkey, "delete");
      expect(result3.authorized).toBe(false);
    });
  });
});
