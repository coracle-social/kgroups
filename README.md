This is a project which uses nostr keys as the root identity of an online community.

These keys MUST be generated using a distributed key generation (DKG) process based on Secure Multi-Party Computation (MPC) so that no single member sees the full key at any time. These keys must then be stored as key shares, each of which is custodied by a member of the group. Admins may be rotated out by reconstructing the key using MPC and re-creating shares for the new admins.

The community key has certain responsibilities:

- Issuing and revoking capabilities
- Selecting relays for storing capabilities
- Selecting relays for storing gated community content
- Selecting relays for storing publicly visible community content

Capabilities are a way of assigning the following abilities to other nostr pubkeys:

- `read` - the pubkey can read group content
- `write` - the pubkey can write group content
- `publish` - the pubkey can publish content on behalf of the community
- `delete` - the pubkey can delete group content
- `delegate` - the pubkey can create chained capabilities

Each capability can be qualified with additional parameters, such as what event kinds are in scope, or whether events need to have (or not have certain) tags.

To participate in a community, members must publish content to the relays selected by the root key. Content not served by those relays must not be considered part of the group.

Members may publish content on behalf of the group by publishing to the group's public content relays. Members must have the `publish` capability for the event in question.

## Repo structure

This is a typescript/pnpm monorepo. Packages:

- `@nkg/signer` - utilities related to MPC/DKG key generation and signing
- `@nkg/cap` - utilities related to capability issuance and validation
- `@nkg/relay` - a relay implementation that supports nip 29 and capability authorization
- `@nkg/chat` - a proof of concept chat app with nip 29 support

## Implementation notes

Technologies used:

- pnpm/typescript
- Graphical user interfaces are written using mithriljs
- Nostr code uses [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- FROST implementation uses [@cmdcode/frost](https://github.com/cmdruid/frost)

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start the chat app (development)
cd packages/chat && pnpm dev

# Start the relay
cd packages/relay && pnpm start
```

## Todo

### Phase 0: Project Setup
- [x] Initialize pnpm workspace with `pnpm-workspace.yaml`
- [x] Create root `package.json` with workspace configuration
- [x] Create root `tsconfig.json` with project references
- [x] Set up shared TypeScript configuration (`tsconfig.base.json`)
- [x] Create the 4 package directories under `packages/`

### Phase 1: `@nkg/signer` - MPC/DKG Key Management
- [x] Set up package structure with `package.json` and `tsconfig.json`
- [x] Implement DKG session types and interfaces (participant IDs, round states)
- [x] Implement DKG Round 1: Generate and broadcast commitments via nostr events
- [x] Implement DKG Round 2: Process received commitments and generate shares
- [x] Implement DKG Round 3: Finalize key shares and derive group public key
- [x] Implement key share serialization/deserialization for secure storage
- [x] Implement threshold signing Round 1: Generate and broadcast nonces
- [x] Implement threshold signing Round 2: Generate signature shares
- [x] Implement signature aggregation and verification
- [x] Implement key share refresh (admin rotation without changing pubkey)
- [x] Define nostr event kinds for DKG/signing protocol messages
- [x] Write tests for full DKG flow with configurable t-of-n threshold
- [x] Write tests for threshold signing flow

### Phase 2: `@nkg/cap` - Capability System
- [x] Set up package structure with `package.json` and `tsconfig.json`
- [x] Define capability event schema (kind, tags for permissions, expiry, etc.)
- [x] Implement capability types: `read`, `write`, `publish`, `delete`, `delegate`
- [x] Implement capability qualifiers (event kinds, tag filters)
- [x] Implement capability issuance (create and sign via signer package)
- [x] Implement capability revocation (nostr event referencing original)
- [x] Implement chained capabilities (delegation chains with proof of authority)
- [x] Implement capability validation (signature verification, expiry, chain validation)
- [x] Implement capability query utilities (filter by pubkey, permission type)
- [x] Write tests for issuance, validation, and revocation

### Phase 3: `@nkg/relay` - NIP-29 Relay with Capability Auth
- [x] Set up package structure with `package.json` and `tsconfig.json`
- [x] Implement WebSocket server for nostr relay protocol
- [x] Implement NIP-29 event kinds (9, 10, 11, 12 for chat/notes)
- [x] Implement NIP-29 group metadata events (39000, 39001, 39002)
- [x] Implement NIP-29 moderation events (9000-9020)
- [x] Implement NIP-29 join/leave requests (9021, 9022)
- [x] Implement `h` tag validation for group membership
- [x] Implement `previous` tag validation for timeline references
- [x] Implement late publication prevention
- [x] Integrate capability validation for all write operations
- [x] Implement relay-signed group metadata generation
- [x] Implement event storage (in-memory or SQLite for PoC)
- [x] Implement REQ/EVENT/CLOSE protocol handlers with AUTH
- [x] Write tests for NIP-29 compliance
- [ ] Write tests for capability-gated access

### Phase 4: `@nkg/chat` - Proof of Concept Chat App
- [x] Set up package structure with `package.json` and `tsconfig.json`
- [x] Set up mithriljs with TypeScript and build tooling (esbuild/vite)
- [x] Implement relay connection management (using nostr-tools)
- [x] Implement login/key management UI (import key share or participate in DKG)
- [x] Implement group list view (show joined groups from kind 10009)
- [x] Implement group creation UI (initiate DKG with other admins)
- [x] Implement chat view with kind 9 messages
- [ ] Implement threaded replies with kind 10
- [x] Implement join/leave group functionality
- [ ] Implement capability display (show what the user can do)
- [ ] Implement moderation UI for admins (if user has delete capability)
- [x] Basic styling and UX polish

### Phase 5: Integration & Documentation
- [ ] Integration tests across all packages
- [x] Update README.md with setup instructions
- [ ] Document the capability event schema
- [ ] Document the DKG nostr event protocol

## Technical Decisions

| Decision | Choice |
|----------|--------|
| DKG Communication | Nostr events (ephemeral or stored) |
| Capability Format | Nostr events signed by group key |
| Threshold Config | Configurable t-of-n |
| Relay Type | Standalone with full NIP-29 support |
| FROST Library | `@cmdcode/frost` |
| Nostr Library | `nostr-tools` |
| UI Framework | mithriljs |
