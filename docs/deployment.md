# Deployment

The game is deployed to Google Cloud Run automatically when pushing to the GitHub repository.

## Architecture

The Dockerfile builds a single container that runs:
- **nginx** (port 8080) - serves static frontend files and proxies API requests
- **Go server** (port 8081) - handles multiplayer game logic via Connect RPC

## TODO

- [ ] **[High]** Test combined Dockerfile deployment on Cloud Run
- [ ] **[Medium]** Add persistent storage (Firestore/Redis) for game state - Cloud Run instances are stateless, so in-memory state will be lost on restart or inconsistent with multiple instances

## Known Limitations

- **Stateless instances**: Cloud Run instances are stateless. The current in-memory game state will be lost if the instance restarts, and will be inconsistent if multiple instances are running.
