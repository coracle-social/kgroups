import { describe, it, expect, beforeEach } from "vitest";
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import {
  isNip29Event,
  isModerationEvent,
  isRelayMetadataEvent,
  getGroupId,
  getPreviousRefs,
  validateNip29Event,
  parseGroupMetadataEvent,
  canPerformModerationAction,
  NIP29_KINDS,
  type GroupAdmin,
} from "../src/index.js";

describe("NIP-29 Event Handling", () => {
  let userSecretKey: Uint8Array;
  let userPubkey: string;

  beforeEach(() => {
    userSecretKey = generateSecretKey();
    userPubkey = getPublicKey(userSecretKey);
  });

  describe("isNip29Event", () => {
    it("should identify chat messages", () => {
      expect(isNip29Event(NIP29_KINDS.CHAT_MESSAGE)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.CHAT_REPLY)).toBe(true);
    });

    it("should identify text notes", () => {
      expect(isNip29Event(NIP29_KINDS.TEXT_NOTE)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.TEXT_REPLY)).toBe(true);
    });

    it("should identify moderation events", () => {
      expect(isNip29Event(NIP29_KINDS.MOD_ADD_USER)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.MOD_REMOVE_USER)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.MOD_DELETE_EVENT)).toBe(true);
    });

    it("should identify metadata events", () => {
      expect(isNip29Event(NIP29_KINDS.GROUP_METADATA)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.GROUP_ADMINS)).toBe(true);
      expect(isNip29Event(NIP29_KINDS.GROUP_MEMBERS)).toBe(true);
    });

    it("should reject non-NIP-29 events", () => {
      expect(isNip29Event(1)).toBe(false);
      expect(isNip29Event(0)).toBe(false);
      expect(isNip29Event(4)).toBe(false);
    });
  });

  describe("isModerationEvent", () => {
    it("should identify moderation events", () => {
      expect(isModerationEvent(9000)).toBe(true);
      expect(isModerationEvent(9001)).toBe(true);
      expect(isModerationEvent(9020)).toBe(true);
    });

    it("should reject non-moderation events", () => {
      expect(isModerationEvent(9)).toBe(false);
      expect(isModerationEvent(9021)).toBe(false);
      expect(isModerationEvent(39000)).toBe(false);
    });
  });

  describe("isRelayMetadataEvent", () => {
    it("should identify relay metadata events", () => {
      expect(isRelayMetadataEvent(39000)).toBe(true);
      expect(isRelayMetadataEvent(39001)).toBe(true);
      expect(isRelayMetadataEvent(39002)).toBe(true);
      expect(isRelayMetadataEvent(39003)).toBe(true);
    });

    it("should reject non-metadata events", () => {
      expect(isRelayMetadataEvent(9)).toBe(false);
      expect(isRelayMetadataEvent(9000)).toBe(false);
    });
  });

  describe("getGroupId", () => {
    it("should extract group ID from h tag", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["h", "test-group-123"]],
          content: "Hello",
        },
        userSecretKey
      );

      expect(getGroupId(event)).toBe("test-group-123");
    });

    it("should return null if no h tag", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: "Hello",
        },
        userSecretKey
      );

      expect(getGroupId(event)).toBeNull();
    });
  });

  describe("getPreviousRefs", () => {
    it("should extract previous references", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["h", "test-group"],
            ["previous", "abcd1234", "efgh5678", "ijkl9012"],
          ],
          content: "Hello",
        },
        userSecretKey
      );

      expect(getPreviousRefs(event)).toEqual(["abcd1234", "efgh5678", "ijkl9012"]);
    });

    it("should filter out invalid length refs", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["h", "test-group"],
            ["previous", "abcd1234", "toolong123", "short"],
          ],
          content: "Hello",
        },
        userSecretKey
      );

      expect(getPreviousRefs(event)).toEqual(["abcd1234"]);
    });
  });

  describe("validateNip29Event", () => {
    it("should validate a properly formed event", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["h", "test-group"]],
          content: "Hello",
        },
        userSecretKey
      );

      const result = validateNip29Event(event);
      expect(result.valid).toBe(true);
    });

    it("should reject event without h tag", () => {
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: "Hello",
        },
        userSecretKey
      );

      const result = validateNip29Event(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("h tag");
    });

    it("should reject late publication", () => {
      const oldTime = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const event = finalizeEvent(
        {
          kind: NIP29_KINDS.CHAT_MESSAGE,
          pubkey: userPubkey,
          created_at: oldTime,
          tags: [["h", "test-group"]],
          content: "Hello",
        },
        userSecretKey
      );

      const result = validateNip29Event(event, {
        latePublicationWindow: 3600, // 1 hour
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Late publication");
    });
  });

  describe("canPerformModerationAction", () => {
    const admins: GroupAdmin[] = [
      {
        pubkey: "admin1",
        label: "Admin 1",
        permissions: ["add-user", "remove-user", "delete-event"],
      },
      {
        pubkey: "admin2",
        label: "Admin 2",
        permissions: ["edit-metadata"],
      },
    ];

    it("should allow admin with correct permission", () => {
      expect(
        canPerformModerationAction(admins, "admin1", NIP29_KINDS.MOD_ADD_USER)
      ).toBe(true);
      expect(
        canPerformModerationAction(admins, "admin1", NIP29_KINDS.MOD_REMOVE_USER)
      ).toBe(true);
      expect(
        canPerformModerationAction(admins, "admin1", NIP29_KINDS.MOD_DELETE_EVENT)
      ).toBe(true);
    });

    it("should reject admin without correct permission", () => {
      expect(
        canPerformModerationAction(admins, "admin2", NIP29_KINDS.MOD_ADD_USER)
      ).toBe(false);
      expect(
        canPerformModerationAction(admins, "admin1", NIP29_KINDS.MOD_EDIT_METADATA)
      ).toBe(false);
    });

    it("should reject non-admin", () => {
      expect(
        canPerformModerationAction(admins, "not-admin", NIP29_KINDS.MOD_ADD_USER)
      ).toBe(false);
    });
  });
});
