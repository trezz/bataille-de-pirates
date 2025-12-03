import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PiratesService } from "./gen/pirates/v1/pirates_connect.js";
import {
    ConnectRequest,
    JoinQueueRequest,
    LeaveQueueRequest,
    ListPlayersRequest,
    ChallengePlayerRequest,
    RespondToMatchRequest,
    PlaceShipsRequest,
    AttackRequest,
    UsePowerRequest,
    ForfeitRequest,
    SubscribeEventsRequest,
    Ship,
    Coordinate,
    PowerType,
} from "./gen/pirates/v1/pirates_pb.js";

class MultiplayerClient {
    constructor() {
        this.client = null;
        this.transport = null;
        this.player = null;
        this.sessionToken = null;
        this.eventStream = null;
        this.eventHandlers = {};
        this.abortController = null;
    }

    async connect(serverUrl, displayName) {
        this.serverUrl = serverUrl;
        
        const initialTransport = createConnectTransport({
            baseUrl: serverUrl,
        });
        const initialClient = createPromiseClient(PiratesService, initialTransport);

        const request = new ConnectRequest({ displayName });
        const response = await initialClient.connect(request);

        this.player = response.player;
        this.sessionToken = response.sessionToken;

        const self = this;
        this.transport = createConnectTransport({
            baseUrl: serverUrl,
            interceptors: [
                (next) => async (req) => {
                    req.header.set("Authorization", self.sessionToken);
                    return next(req);
                },
            ],
        });
        this.client = createPromiseClient(PiratesService, this.transport);

        this.startEventSubscription();

        return this.player;
    }

    async startEventSubscription() {
        this.abortController = new AbortController();
        const request = new SubscribeEventsRequest({ sessionToken: this.sessionToken });

        try {
            this.eventStream = this.client.subscribeEvents(request, {
                signal: this.abortController.signal,
            });

            for await (const event of this.eventStream) {
                this.handleEvent(event);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Event stream error:', err);
                this.emit('error', err);
            }
        }
    }

    handleEvent(event) {
        if (event.queueStatus) {
            this.emit('queueStatus', event.queueStatus);
        } else if (event.playerList) {
            this.emit('playerList', event.playerList);
        } else if (event.matchProposal) {
            this.emit('matchProposal', event.matchProposal);
        } else if (event.matchResult) {
            this.emit('matchResult', event.matchResult);
        } else if (event.gameStarted) {
            this.emit('gameStarted', event.gameStarted);
        } else if (event.turnStarted) {
            this.emit('turnStarted', event.turnStarted);
        } else if (event.opponentAction) {
            this.emit('opponentAction', event.opponentAction);
        } else if (event.gameOver) {
            this.emit('gameOver', event.gameOver);
        } else if (event.placementUpdate) {
            this.emit('placementUpdate', event.placementUpdate);
        }
    }

    on(eventName, handler) {
        if (!this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = [];
        }
        this.eventHandlers[eventName].push(handler);
    }

    off(eventName, handler) {
        if (this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = this.eventHandlers[eventName].filter(h => h !== handler);
        }
    }

    emit(eventName, data) {
        if (this.eventHandlers[eventName]) {
            this.eventHandlers[eventName].forEach(handler => handler(data));
        }
    }

    async joinQueue() {
        const request = new JoinQueueRequest();
        return await this.client.joinQueue(request);
    }

    async leaveQueue() {
        const request = new LeaveQueueRequest();
        return await this.client.leaveQueue(request);
    }

    async listPlayers() {
        const request = new ListPlayersRequest();
        return await this.client.listPlayers(request);
    }

    async challengePlayer(targetPlayerId) {
        const request = new ChallengePlayerRequest({ targetPlayerId });
        return await this.client.challengePlayer(request);
    }

    async respondToMatch(matchId, accepted) {
        const request = new RespondToMatchRequest({ matchId, accepted });
        return await this.client.respondToMatch(request);
    }

    async placeShips(ships) {
        const protoShips = ships.map(ship => new Ship({
            id: String(ship.id),
            name: ship.name,
            size: ship.size,
            start: new Coordinate({ x: ship.cells[0].x, y: ship.cells[0].y }),
            horizontal: ship.cells.length > 1 ? ship.cells[1].x !== ship.cells[0].x : true,
        }));

        const request = new PlaceShipsRequest({ ships: protoShips });
        return await this.client.placeShips(request);
    }

    async attack(x, y) {
        const request = new AttackRequest({
            target: new Coordinate({ x, y }),
        });
        return await this.client.attack(request);
    }

    async usePower(powerType, x, y, horizontal = true) {
        const protoType = this.mapPowerType(powerType);
        const request = new UsePowerRequest({
            power: protoType,
            target: new Coordinate({ x, y }),
            horizontal,
        });
        return await this.client.usePower(request);
    }

    mapPowerType(localPower) {
        const mapping = {
            'instakill': PowerType.INSTAKILL,
            'triple': PowerType.TRIPLE,
            'sonar': PowerType.SONAR,
            'kraken': PowerType.KRAKEN,
        };
        return mapping[localPower] || PowerType.UNSPECIFIED;
    }

    mapPowerTypeReverse(protoType) {
        const mapping = {
            [PowerType.INSTAKILL]: 'instakill',
            [PowerType.TRIPLE]: 'triple',
            [PowerType.SONAR]: 'sonar',
            [PowerType.KRAKEN]: 'kraken',
        };
        return mapping[protoType] || null;
    }

    async forfeit() {
        const request = new ForfeitRequest();
        return await this.client.forfeit(request);
    }

    disconnect() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.client = null;
        this.player = null;
        this.sessionToken = null;
        this.eventHandlers = {};
    }
}

window.MultiplayerClient = MultiplayerClient;
window.PowerType = PowerType;

export { MultiplayerClient, PowerType };
