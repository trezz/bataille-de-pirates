# Bataille de Pirates - Multiplayer Specification

## Overview

This document describes the architecture and API for a multiplayer version of Bataille de Pirates. The server is written in Go with a Protobuf-based API, communicating with clients via WebSocket for real-time gameplay.

## Architecture

```
┌─────────────┐     WebSocket + Protobuf     ┌─────────────────┐
│   Client    │ ◄──────────────────────────► │   Go Server     │
│  (Browser)  │                              │                 │
└─────────────┘                              │  ┌───────────┐  │
                                             │  │ Matchmaker│  │
┌─────────────┐     WebSocket + Protobuf     │  └───────────┘  │
│   Client    │ ◄──────────────────────────► │                 │
│  (Browser)  │                              │  ┌───────────┐  │
└─────────────┘                              │  │Game Engine│  │
                                             │  └───────────┘  │
                                             └─────────────────┘
```

## Core Components

### 1. Matchmaking Service

Handles player queuing and match creation.

**Features:**
- Player queue management
- Auto-matching (FIFO or ELO-based in future)
- Manual opponent selection from available players
- Match accept/reject flow with timeout
- Re-queue on rejection

**States:**
```
IDLE → QUEUED → MATCH_PROPOSED → MATCH_ACCEPTED → IN_GAME
                      ↓
                  REJECTED → QUEUED
```

### 2. Game Session Service

Manages active game sessions.

**Features:**
- Ship placement phase with validation
- Turn-based attack system
- Power execution (Sonar, Triple, Kraken, Instakill)
- Victory detection
- Disconnect handling (timeout, forfeit)

### 3. Player Registry

Tracks connected players and their states.

**Features:**
- Anonymous players (guest mode) with generated names
- Player presence (online/in-game/away)
- Active session tracking

---

## Protobuf API

### Messages

```protobuf
syntax = "proto3";

package pirates.v1;

option go_package = "github.com/trezz/bataille-de-pirates/server/gen/pirates/v1;piratesv1";

// ============================================================================
// Service Definition
// ============================================================================

// PiratesService provides the game API with unary RPCs for actions
// and a server-streaming RPC for real-time events.
service PiratesService {
  // Connection
  rpc Connect(ConnectRequest) returns (ConnectResponse);

  // Matchmaking
  rpc JoinQueue(JoinQueueRequest) returns (QueueStatusUpdate);
  rpc LeaveQueue(LeaveQueueRequest) returns (LeaveQueueResponse);
  rpc ListPlayers(ListPlayersRequest) returns (PlayerListUpdate);
  rpc ChallengePlayer(ChallengePlayerRequest) returns (ChallengePlayerResponse);
  rpc RespondToMatch(RespondToMatchRequest) returns (MatchResult);

  // Game actions
  rpc PlaceShips(PlaceShipsRequest) returns (PlacementResult);
  rpc Attack(AttackRequest) returns (AttackResult);
  rpc UsePower(UsePowerRequest) returns (PowerResult);
  rpc Forfeit(ForfeitRequest) returns (ForfeitResponse);

  // Server-streaming RPC for real-time events (match proposals, turns, opponent actions)
  rpc SubscribeEvents(SubscribeEventsRequest) returns (stream GameEvent);
}

// ============================================================================
// Common Types
// ============================================================================

message Coordinate {
  int32 x = 1;
  int32 y = 2;
}

message Ship {
  string id = 1;
  string name = 2;           // "Galion", "Frégate", "Brick", "Corvette", "Chaloupe"
  int32 size = 3;
  Coordinate start = 4;
  bool horizontal = 5;
}

enum PowerType {
  POWER_TYPE_UNSPECIFIED = 0;
  POWER_TYPE_INSTAKILL = 1;  // Chaloupe (2) - instant sink on hit
  POWER_TYPE_TRIPLE = 2;     // Brick/Corvette (3) - 3 aligned shots
  POWER_TYPE_SONAR = 3;      // Frégate (4) - reveal cross pattern
  POWER_TYPE_KRAKEN = 4;     // Galion (5) - cross attack
}

enum CellState {
  CELL_STATE_UNKNOWN = 0;
  CELL_STATE_EMPTY = 1;
  CELL_STATE_MISS = 2;
  CELL_STATE_HIT = 3;
  CELL_STATE_SUNK = 4;
  CELL_STATE_REVEALED = 5;
}

message Power {
  PowerType type = 1;
  string name = 2;
}

message Player {
  string id = 1;
  string display_name = 2;
  PlayerStatus status = 3;
}

enum PlayerStatus {
  PLAYER_STATUS_UNSPECIFIED = 0;
  PLAYER_STATUS_ONLINE = 1;
  PLAYER_STATUS_IN_QUEUE = 2;
  PLAYER_STATUS_IN_GAME = 3;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

message ClientMessage {
  oneof message {
    // Connection
    ConnectRequest connect = 1;

    // Matchmaking
    JoinQueueRequest join_queue = 2;
    LeaveQueueRequest leave_queue = 3;
    ListPlayersRequest list_players = 4;
    ChallengePlayerRequest challenge_player = 5;
    RespondToMatchRequest respond_to_match = 6;

    // Game
    PlaceShipsRequest place_ships = 10;
    AttackRequest attack = 11;
    UsePowerRequest use_power = 12;
    ForfeitRequest forfeit = 13;
  }
}

message ConnectRequest {
  string display_name = 1;  // Optional, server generates if empty
}

message JoinQueueRequest {}

message LeaveQueueRequest {}

message LeaveQueueResponse {}

message ChallengePlayerResponse {
  string match_id = 1;
}

message ForfeitResponse {}

message SubscribeEventsRequest {
  string session_token = 1;  // Token from ConnectResponse
}

// GameEvent wraps all server-pushed events for the V2 streaming RPC
message GameEvent {
  oneof event {
    QueueStatusUpdate queue_status = 1;
    PlayerListUpdate player_list = 2;
    MatchProposal match_proposal = 3;
    MatchResult match_result = 4;
    GameStarted game_started = 5;
    TurnStarted turn_started = 6;
    OpponentAction opponent_action = 7;
    GameOver game_over = 8;
  }
}

message ListPlayersRequest {}

message ChallengePlayerRequest {
  string target_player_id = 1;
}

message RespondToMatchRequest {
  string match_id = 1;
  bool accepted = 2;
}

message PlaceShipsRequest {
  repeated Ship ships = 1;
}

message AttackRequest {
  Coordinate target = 1;
}

message UsePowerRequest {
  PowerType power = 1;
  Coordinate target = 2;

  // For TRIPLE power only
  bool horizontal = 3;
}

message ForfeitRequest {}

// ============================================================================
// Server → Client Messages
// ============================================================================

message ServerMessage {
  oneof message {
    // Connection
    ConnectResponse connect = 1;
    ErrorResponse error = 2;

    // Matchmaking
    QueueStatusUpdate queue_status = 10;
    PlayerListUpdate player_list = 11;
    MatchProposal match_proposal = 12;
    MatchResult match_result = 13;

    // Game
    GameStarted game_started = 20;
    PlacementResult placement_result = 21;
    TurnStarted turn_started = 22;
    AttackResult attack_result = 23;
    PowerResult power_result = 24;
    OpponentAction opponent_action = 25;
    GameOver game_over = 26;
  }
}

message ConnectResponse {
  Player player = 1;
}

message ErrorResponse {
  string code = 1;
  string message = 2;
}

message QueueStatusUpdate {
  bool in_queue = 1;
  int32 queue_position = 2;
  int32 players_in_queue = 3;
}

message PlayerListUpdate {
  repeated Player available_players = 1;  // Players that can be challenged
}

message MatchProposal {
  string match_id = 1;
  Player opponent = 2;
  bool you_initiated = 3;           // True if you challenged, false if auto-matched
  int32 timeout_seconds = 4;        // Time to accept/reject
}

message MatchResult {
  string match_id = 1;
  bool accepted = 2;
  string rejection_reason = 3;      // "opponent_declined", "timeout", etc.
}

message GameStarted {
  string game_id = 1;
  Player opponent = 2;
  bool your_turn_first = 3;
}

message PlacementResult {
  bool valid = 1;
  string error_message = 2;         // If invalid
  bool waiting_for_opponent = 3;    // True if opponent hasn't placed yet
}

message TurnStarted {
  bool your_turn = 1;
  repeated Power available_powers = 2;
}

message AttackResult {
  Coordinate target = 1;
  bool hit = 2;
  Ship sunk_ship = 3;               // Populated if a ship was sunk
  Power power_gained = 4;           // Power gained by opponent (for UI display)
}

message PowerResult {
  PowerType power_used = 1;
  repeated CellReveal cells_affected = 2;
  repeated Ship sunk_ships = 3;
}

message CellReveal {
  Coordinate position = 1;
  CellState state = 2;
}

message OpponentAction {
  oneof action {
    AttackResult attack = 1;
    PowerResult power = 2;
  }
  // Your grid state after opponent's action
  repeated CellReveal your_grid_updates = 3;
}

message GameOver {
  bool you_won = 1;
  string reason = 2;                // "all_ships_sunk", "opponent_forfeit", "opponent_disconnect"
}
```

---

## Game Flow

### 1. Connection Flow

```
Client                          Server
   │                               │
   │──── ConnectRequest ──────────►│
   │                               │
   │◄─── ConnectResponse ──────────│ (assigns player ID + display name)
   │                               │
```

### 2. Matchmaking Flow (Auto-match)

```
Client A                        Server                        Client B
   │                               │                               │
   │──── JoinQueueRequest ────────►│                               │
   │◄─── QueueStatusUpdate ────────│                               │
   │                               │                               │
   │                               │◄──── JoinQueueRequest ────────│
   │                               │───── QueueStatusUpdate ──────►│
   │                               │                               │
   │◄─── MatchProposal ────────────│────── MatchProposal ─────────►│
   │                               │                               │
   │──── RespondToMatch(yes) ─────►│                               │
   │                               │◄──── RespondToMatch(yes) ─────│
   │                               │                               │
   │◄─── MatchResult(accepted) ────│───── MatchResult(accepted) ──►│
   │◄─── GameStarted ──────────────│────── GameStarted ───────────►│
```

### 3. Matchmaking Flow (Challenge)

```
Client A                        Server                        Client B
   │                               │                               │
   │──── ListPlayersRequest ──────►│                               │
   │◄─── PlayerListUpdate ─────────│                               │
   │                               │                               │
   │── ChallengePlayerRequest ────►│                               │
   │                               │──── MatchProposal ───────────►│
   │◄─── MatchProposal ────────────│     (you_initiated=false)     │
   │     (you_initiated=true)      │                               │
   │                               │                               │
   │                               │◄── RespondToMatch(yes/no) ────│
   │◄─── MatchResult ──────────────│───── MatchResult ────────────►│
```

### 4. Game Flow

```
Client A                        Server                        Client B
   │                               │                               │
   │◄─── GameStarted ──────────────│───── GameStarted ────────────►│
   │     (your_turn_first=false)   │     (your_turn_first=true)    │
   │                               │                               │
   │──── PlaceShipsRequest ───────►│                               │
   │◄─── PlacementResult ──────────│                               │
   │     (waiting=true)            │                               │
   │                               │◄──── PlaceShipsRequest ───────│
   │                               │───── PlacementResult ─────────►│
   │                               │                               │
   │◄─── TurnStarted(false) ───────│───── TurnStarted(true) ──────►│
   │                               │                               │
   │                               │◄──── AttackRequest ───────────│
   │                               │───── AttackResult ───────────►│
   │◄─── OpponentAction ───────────│                               │
   │                               │                               │
   │◄─── TurnStarted(true) ────────│───── TurnStarted(false) ─────►│
   │                               │                               │
   │──── AttackRequest ───────────►│                               │
   │◄─── AttackResult ─────────────│                               │
   │                               │───── OpponentAction ─────────►│
   │                               │                               │
   │         ... continue until victory ...                        │
   │                               │                               │
   │◄─── GameOver ─────────────────│───── GameOver ───────────────►│
```

---

## Server State Management

### Player States

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `CONNECTED` | Player connected, not in queue | `join_queue`, `list_players`, `challenge_player` |
| `IN_QUEUE` | Waiting for match | `leave_queue`, `respond_to_match` |
| `MATCH_PENDING` | Match proposed, awaiting response | `respond_to_match` |
| `PLACING_SHIPS` | In game, placing ships | `place_ships`, `forfeit` |
| `IN_GAME` | Playing | `attack`, `use_power`, `forfeit` |

### Game States

| State | Description |
|-------|-------------|
| `WAITING_FOR_SHIPS` | Both players placing ships |
| `PLAYER1_TURN` | Player 1's turn to attack |
| `PLAYER2_TURN` | Player 2's turn to attack |
| `FINISHED` | Game over |

---

## Configuration

```yaml
server:
  port: 8080
  websocket_path: /ws

matchmaking:
  match_accept_timeout: 30s       # Time to accept/reject a match
  queue_check_interval: 1s        # How often to check for matches

game:
  placement_timeout: 120s         # Time to place ships
  turn_timeout: 60s               # Time per turn (0 = no limit)
  disconnect_grace_period: 30s    # Time before auto-forfeit on disconnect

players:
  name_generator: pirate          # "pirate", "random", "numbered"
  max_concurrent_games: 1
```

---

## Directory Structure

```
server/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── matchmaker/
│   │   ├── matchmaker.go
│   │   ├── queue.go
│   │   └── matchmaker_test.go
│   ├── game/
│   │   ├── session.go
│   │   ├── grid.go
│   │   ├── powers.go
│   │   └── game_test.go
│   ├── player/
│   │   ├── registry.go
│   │   └── player.go
│   └── transport/
│       ├── websocket.go
│       └── handler.go
├── proto/
│   └── pirates/
│       └── v1/
│           └── pirates.proto
├── go.mod
└── go.sum
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_STATE` | Action not allowed in current state |
| `NOT_YOUR_TURN` | Attempted action on opponent's turn |
| `INVALID_TARGET` | Attack coordinates out of bounds or already hit |
| `INVALID_PLACEMENT` | Ship placement invalid (overlap, out of bounds) |
| `POWER_NOT_AVAILABLE` | Trying to use a power you don't have |
| `PLAYER_NOT_FOUND` | Challenge target doesn't exist |
| `PLAYER_NOT_AVAILABLE` | Player is in game or not in queue |
| `MATCH_EXPIRED` | Match proposal timed out |

---

## Deployment (Google Cloud Run)

### Architecture Considerations

Cloud Run is **stateless** and scales to zero, which creates challenges for a real-time game server:

1. **WebSocket/gRPC streams**: Supported, but connections are terminated when instances scale down
2. **In-memory state**: Lost when instances scale, need external state store
3. **Instance affinity**: No guarantee two players in a game hit the same instance

### Architecture

```
┌─────────────┐     gRPC/Connect      ┌─────────────────┐
│   Client    │ ◄───────────────────► │   Cloud Run     │
└─────────────┘                       │   (Stateless)   │
                                      └────────┬────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              │                                 │
                              ▼                                 ▼
                      ┌──────────────┐                 ┌──────────────┐
                      │  Firestore   │                 │   Pub/Sub    │
                      │  (State)     │                 │   (Events)   │
                      └──────────────┘                 └──────────────┘
```

### State Management with Firestore

Firestore collections:

```
/players/{playerId}
  - displayName: string
  - status: "online" | "in_queue" | "in_game"
  - currentGameId: string?
  - connectedAt: timestamp
  - lastSeenAt: timestamp

/queue/{playerId}
  - playerId: string
  - displayName: string
  - joinedAt: timestamp

/games/{gameId}
  - player1Id: string
  - player2Id: string
  - status: "placing_ships" | "player1_turn" | "player2_turn" | "finished"
  - winner: string?
  - createdAt: timestamp

/games/{gameId}/player1
  - grid: array[10][10]
  - ships: array<Ship>
  - powers: array<Power>

/games/{gameId}/player2
  - grid: array[10][10]
  - ships: array<Ship>
  - powers: array<Power>

/matches/{matchId}
  - player1Id: string
  - player2Id: string
  - status: "pending" | "accepted" | "rejected" | "expired"
  - initiatedBy: string
  - expiresAt: timestamp
```

### Real-time Events with Pub/Sub

Topics for cross-instance communication:

```
pirates-events-{playerId}    # Per-player event channel
```

When an action occurs (e.g., opponent attacks), the server:
1. Updates Firestore with new game state
2. Publishes event to opponent's Pub/Sub topic
3. Opponent's Cloud Run instance receives via push subscription
4. Event is forwarded to client via the `SubscribeEvents` stream

### Cloud Run Configuration

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: pirates-server
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "2"
        run.googleapis.com/cpu-throttling: "true"
        run.googleapis.com/sessionAffinity: "true"
    spec:
      containerConcurrency: 100                       # Connections per instance
      timeoutSeconds: 3600
      containers:
        - image: gcr.io/PROJECT/pirates-server
          ports:
            - containerPort: 8080
              name: h2c                               # HTTP/2 cleartext for gRPC
          env:
            - name: GOOGLE_CLOUD_PROJECT
              value: "PROJECT_ID"
          resources:
            limits:
              cpu: "1"
              memory: "512Mi"
```

### Deployment Commands

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/pirates-server ./server

# Deploy
gcloud run deploy pirates-server \
  --image gcr.io/PROJECT_ID/pirates-server \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --use-http2 \
  --session-affinity \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 3600
```

### Dockerfile (Server)

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /pirates-server ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /pirates-server /pirates-server

EXPOSE 8080
CMD ["/pirates-server"]
```

### Client Connection (Browser)

Using **Connect protocol** (works over HTTP/1.1, HTTP/2, and gRPC):

```javascript
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PiratesService } from "./gen/pirates/v1/pirates_connect";

const transport = createConnectTransport({
  baseUrl: "https://pirates-server-xxxxx-uc.a.run.app",
});

const client = createPromiseClient(PiratesService, transport);

// Connect and subscribe to events
const { player } = await client.connect({ displayName: "Pirate42" });

// Start event subscription (runs in background)
const events = client.subscribeEvents({ sessionToken: player.id });
(async () => {
  for await (const event of events) {
    handleServerEvent(event);
  }
})();

// Make RPC calls
await client.joinQueue({});
// ... wait for MatchProposal event ...
await client.respondToMatch({ matchId: "...", accepted: true });
// ... wait for GameStarted event ...
await client.placeShips({ ships: [...] });
// ... wait for TurnStarted event ...
await client.attack({ target: { x: 5, y: 3 } });
```

### Cost Estimation (Low Traffic)

| Resource | Specification | Monthly Cost |
|----------|--------------|--------------|
| Cloud Run | Scale to zero, ~100 req/day | ~$0 (free tier) |
| Firestore | <1GB storage, <50k reads/day | ~$0 (free tier) |
| Pub/Sub | <10k messages/day | ~$0 (free tier) |
| **Total** | | **~$0/month** |

Note: Cloud Run free tier includes 2M requests/month and 360k vCPU-seconds/month.

---

## Future Enhancements (Out of Scope)

- Persistent player accounts and authentication
- ELO ranking system
- Spectator mode
- Replay system
- Chat functionality
- Tournament mode
