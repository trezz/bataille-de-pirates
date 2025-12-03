import { createClient } from "@connectrpc/connect";
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
        const initialClient = createClient(PiratesService, initialTransport);

        const request = new ConnectRequest({ displayName });
        const response = await initialClient.connect(request);

        this.player = response.player;
        this.sessionToken = response.sessionToken;

        this.transport = createConnectTransport({
            baseUrl: serverUrl,
        });
        this.client = createClient(PiratesService, this.transport);

        this.startEventSubscription().catch(err => {
            console.error('Failed to start event subscription:', err);
        });

        return this.player;
    }

    async startEventSubscription() {
        this.abortController = new AbortController();
        const request = new SubscribeEventsRequest({ sessionToken: this.sessionToken });

        console.log('Starting event subscription with token:', this.sessionToken);
        try {
            this.eventStream = this.client.subscribeEvents(request, {
                signal: this.abortController.signal,
            });

            console.log('Event stream created, waiting for events...');
            for await (const event of this.eventStream) {
                console.log('Received event:', event);
                this.handleEvent(event);
            }
            console.log('Event stream ended');
        } catch (err) {
            console.error('Event stream error:', err);
            if (err.name !== 'AbortError') {
                this.emit('error', err);
            }
        }
    }

    handleEvent(event) {
        const e = event.event;
        if (!e) return;
        
        switch (e.case) {
            case 'queueStatus':
                this.emit('queueStatus', e.value);
                break;
            case 'playerList':
                this.emit('playerList', e.value);
                break;
            case 'matchProposal':
                this.emit('matchProposal', e.value);
                break;
            case 'matchResult':
                this.emit('matchResult', e.value);
                break;
            case 'gameStarted':
                this.emit('gameStarted', e.value);
                break;
            case 'turnStarted':
                this.emit('turnStarted', e.value);
                break;
            case 'opponentAction':
                this.emit('opponentAction', e.value);
                break;
            case 'gameOver':
                this.emit('gameOver', e.value);
                break;
            case 'placementUpdate':
                this.emit('placementUpdate', e.value);
                break;
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
        const request = new JoinQueueRequest({ sessionToken: this.sessionToken });
        return await this.client.joinQueue(request);
    }

    async leaveQueue() {
        const request = new LeaveQueueRequest({ sessionToken: this.sessionToken });
        return await this.client.leaveQueue(request);
    }

    async listPlayers() {
        const request = new ListPlayersRequest({ sessionToken: this.sessionToken });
        return await this.client.listPlayers(request);
    }

    async challengePlayer(targetPlayerId) {
        const request = new ChallengePlayerRequest({ sessionToken: this.sessionToken, targetPlayerId });
        return await this.client.challengePlayer(request);
    }

    async respondToMatch(matchId, accepted) {
        const request = new RespondToMatchRequest({ sessionToken: this.sessionToken, matchId, accepted });
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

        const request = new PlaceShipsRequest({ sessionToken: this.sessionToken, ships: protoShips });
        return await this.client.placeShips(request);
    }

    async attack(x, y) {
        const request = new AttackRequest({
            sessionToken: this.sessionToken,
            target: new Coordinate({ x, y }),
        });
        return await this.client.attack(request);
    }

    async usePower(powerType, x, y, horizontal = true) {
        const protoType = this.mapPowerType(powerType);
        const request = new UsePowerRequest({
            sessionToken: this.sessionToken,
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
        const request = new ForfeitRequest({ sessionToken: this.sessionToken });
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
