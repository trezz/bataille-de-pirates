/**
 * @jest-environment jsdom
 */

const {
    GRID_SIZE,
    SHIPS,
    POWER_ICONS,
    createEmptyGrid,
    createInitialGameState,
    getShipCells,
    canPlaceShip,
    placeShipOnGrid,
    isShipAlreadyPlaced,
    isPlacementComplete,
    getOpponent,
    getPowerTargetCells,
    markShipAsSunk,
    executeNormalAttack,
    executeInstakill,
    executeTriple,
    executeSonar,
    executeKraken,
    removePower,
    checkVictory
} = require('./gameLogic');

describe('Game UI', () => {
    let isOnlineMode;
    let multiplayerClient;
    let currentMatchId;
    let matchTimeoutInterval;
    let opponentInfo;
    let gameState;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="game-container">
                <div id="welcome-screen" class="screen active"></div>
                <div id="online-screen" class="screen"></div>
                <div id="lobby-screen" class="screen"></div>
                <div id="match-proposal-screen" class="screen"></div>
                <div id="waiting-opponent-screen" class="screen">
                    <p id="waiting-message"></p>
                </div>
                <div id="placement-screen" class="screen">
                    <span id="placement-player"></span>
                    <div id="placement-grid" class="grid"></div>
                    <button id="confirm-placement" disabled></button>
                    <div class="ship-to-place" data-size="5" data-name="Galion"></div>
                </div>
                <div id="transition-screen" class="screen">
                    <h2 id="transition-message"></h2>
                </div>
                <div id="game-screen" class="screen">
                    <span id="current-player"></span>
                    <div id="attack-grid" class="grid"></div>
                    <div id="my-grid-small" class="grid small"></div>
                    <div id="powers-list"></div>
                    <p id="game-instruction"></p>
                    <div id="power-indicator" class="hidden">
                        <span id="power-name"></span>
                    </div>
                </div>
                <div id="result-screen" class="screen">
                    <div id="result-icon"></div>
                    <h2 id="result-title"></h2>
                    <p id="result-message"></p>
                    <div id="power-gained" class="hidden">
                        <span id="power-gained-name"></span>
                        <p id="power-description"></p>
                    </div>
                </div>
                <div id="victory-screen" class="screen">
                    <span id="winner"></span>
                </div>
                <div id="connection-form"></div>
                <div id="connection-status" class="hidden">
                    <p id="status-message"></p>
                </div>
                <input id="player-name" value="TestPirate">
                <input id="server-url" value="http://localhost:8080">
                <span id="my-player-name"></span>
                <button id="start-local"></button>
                <button id="start-online"></button>
                <button id="back-to-menu"></button>
                <button id="connect-btn"></button>
                <button id="join-queue-btn"></button>
                <button id="leave-queue-btn" class="hidden"></button>
                <button id="disconnect-btn"></button>
                <button id="accept-match-btn"></button>
                <button id="reject-match-btn"></button>
                <button id="rotate-btn"></button>
                <button id="reset-placement"></button>
                <button id="ready-btn"></button>
                <button id="continue-btn"></button>
                <button id="new-game-btn"></button>
                <div id="queue-status" class="hidden">
                    <p id="queue-message"></p>
                </div>
                <div id="players-list-container">
                    <div id="players-list"></div>
                </div>
                <p id="match-proposal-message"></p>
                <p id="match-opponent-name"></p>
                <p id="match-timeout"></p>
            </div>
        `;

        isOnlineMode = false;
        multiplayerClient = null;
        currentMatchId = null;
        matchTimeoutInterval = null;
        opponentInfo = null;
        gameState = null;
    });

    afterEach(() => {
        if (matchTimeoutInterval) {
            clearInterval(matchTimeoutInterval);
            matchTimeoutInterval = null;
        }
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    describe('showScreen', () => {
        test('affiche le bon écran', () => {
            showScreen('placement-screen');
            expect(document.getElementById('placement-screen').classList.contains('active')).toBe(true);
            expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(false);
        });

        test('un seul écran est actif à la fois', () => {
            showScreen('game-screen');
            const activeScreens = document.querySelectorAll('.screen.active');
            expect(activeScreens.length).toBe(1);
            expect(activeScreens[0].id).toBe('game-screen');
        });
    });

    describe('Mode selection', () => {
        function startPlacement() {
            gameState = createInitialGameState();
            gameState.phase = 'placement';
            gameState.currentPlayer = 1;
            showScreen('placement-screen');
        }

        function startLocalGame() {
            isOnlineMode = false;
            startPlacement();
        }

        function showOnlineScreen() {
            showScreen('online-screen');
        }

        function backToMenu() {
            showScreen('welcome-screen');
        }

        test('startLocalGame passe en mode local', () => {
            startLocalGame();
            expect(isOnlineMode).toBe(false);
            expect(gameState.phase).toBe('placement');
        });

        test('showOnlineScreen affiche l\'écran de connexion', () => {
            showOnlineScreen();
            expect(document.getElementById('online-screen').classList.contains('active')).toBe(true);
        });

        test('backToMenu retourne à l\'accueil', () => {
            showOnlineScreen();
            backToMenu();
            expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(true);
        });
    });

    describe('Multiplayer client mock', () => {
        let mockClient;

        beforeEach(() => {
            mockClient = {
                player: { id: 'player-1', displayName: 'TestPirate' },
                sessionToken: 'token-123',
                connect: jest.fn().mockResolvedValue({ id: 'player-1', displayName: 'TestPirate' }),
                disconnect: jest.fn(),
                on: jest.fn(),
            };
            multiplayerClient = mockClient;
        });

        function renderPlayerList(players) {
            const container = document.getElementById('players-list');
            container.innerHTML = '';

            const otherPlayers = players.filter(p => p.id !== multiplayerClient.player.id);

            if (otherPlayers.length === 0) {
                container.innerHTML = '<p class="no-players">Aucun joueur disponible</p>';
                return;
            }

            otherPlayers.forEach(player => {
                const item = document.createElement('div');
                item.className = 'player-item';
                item.dataset.playerId = player.id;
                item.innerHTML = `<span class="player-name">${player.displayName}</span>`;
                container.appendChild(item);
            });
        }

        test('renderPlayerList affiche les joueurs disponibles', () => {
            renderPlayerList([
                { id: 'player-2', displayName: 'Pirate2' },
                { id: 'player-3', displayName: 'Pirate3' }
            ]);

            const items = document.querySelectorAll('.player-item');
            expect(items.length).toBe(2);
        });

        test('renderPlayerList affiche message si aucun joueur', () => {
            renderPlayerList([]);

            expect(document.getElementById('players-list').innerHTML).toContain('Aucun joueur disponible');
        });

        test('renderPlayerList exclut le joueur courant', () => {
            renderPlayerList([
                { id: 'player-1', displayName: 'TestPirate' },
                { id: 'player-2', displayName: 'Pirate2' }
            ]);

            const items = document.querySelectorAll('.player-item');
            expect(items.length).toBe(1);
            expect(items[0].dataset.playerId).toBe('player-2');
        });
    });

    describe('Match proposal', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        function showMatchProposal(proposal) {
            currentMatchId = proposal.matchId;
            opponentInfo = proposal.opponent;

            if (proposal.youInitiated) {
                document.getElementById('match-proposal-message').textContent = 'En attente de la réponse de...';
            } else {
                document.getElementById('match-proposal-message').textContent = 'Un adversaire vous défie!';
            }

            document.getElementById('match-opponent-name').textContent = proposal.opponent.displayName;

            let timeLeft = proposal.timeoutSeconds;
            document.getElementById('match-timeout').textContent = `${timeLeft}s`;

            if (matchTimeoutInterval) clearInterval(matchTimeoutInterval);
            matchTimeoutInterval = setInterval(() => {
                timeLeft--;
                document.getElementById('match-timeout').textContent = `${timeLeft}s`;
                if (timeLeft <= 0) {
                    clearInterval(matchTimeoutInterval);
                }
            }, 1000);

            showScreen('match-proposal-screen');
        }

        test('affiche la proposition de match avec le nom de l\'adversaire', () => {
            showMatchProposal({
                matchId: 'match-123',
                opponent: { id: 'player-2', displayName: 'CaptainHook' },
                youInitiated: false,
                timeoutSeconds: 30
            });

            expect(document.getElementById('match-opponent-name').textContent).toBe('CaptainHook');
            expect(document.getElementById('match-proposal-message').textContent).toBe('Un adversaire vous défie!');
            expect(currentMatchId).toBe('match-123');
        });

        test('affiche message différent si vous avez initié', () => {
            showMatchProposal({
                matchId: 'match-123',
                opponent: { id: 'player-2', displayName: 'CaptainHook' },
                youInitiated: true,
                timeoutSeconds: 30
            });

            expect(document.getElementById('match-proposal-message').textContent).toBe('En attente de la réponse de...');
        });

        test('décompte le timeout', () => {
            showMatchProposal({
                matchId: 'match-123',
                opponent: { id: 'player-2', displayName: 'CaptainHook' },
                youInitiated: false,
                timeoutSeconds: 30
            });

            expect(document.getElementById('match-timeout').textContent).toBe('30s');

            jest.advanceTimersByTime(5000);

            expect(document.getElementById('match-timeout').textContent).toBe('25s');
        });
    });

    describe('Online game start', () => {
        beforeEach(() => {
            multiplayerClient = {
                player: { id: 'player-1', displayName: 'TestPirate' }
            };
        });

        function resetPlacementUI() {
            document.getElementById('placement-player').textContent = gameState.currentPlayer;
            document.getElementById('confirm-placement').disabled = true;
        }

        function startOnlineGame(game) {
            isOnlineMode = true;
            opponentInfo = game.opponent;

            gameState = createInitialGameState();
            gameState.phase = 'placement';
            gameState.currentPlayer = 1;
            gameState.onlineGameId = game.gameId;
            gameState.myTurnFirst = game.yourTurnFirst;

            resetPlacementUI();
            document.getElementById('placement-player').textContent = multiplayerClient.player.displayName;
            showScreen('placement-screen');
        }

        test('démarre une partie en ligne', () => {
            startOnlineGame({
                gameId: 'game-123',
                opponent: { id: 'player-2', displayName: 'Adversaire' },
                yourTurnFirst: true
            });

            expect(isOnlineMode).toBe(true);
            expect(gameState.onlineGameId).toBe('game-123');
            expect(gameState.myTurnFirst).toBe(true);
            expect(opponentInfo.displayName).toBe('Adversaire');
        });

        test('affiche le nom du joueur dans le placement', () => {
            startOnlineGame({
                gameId: 'game-123',
                opponent: { id: 'player-2', displayName: 'Adversaire' },
                yourTurnFirst: false
            });

            expect(document.getElementById('placement-player').textContent).toBe('TestPirate');
        });
    });

    describe('handleTurnStarted', () => {
        beforeEach(() => {
            gameState = createInitialGameState();
        });

        const renderOnlineBattleUI = jest.fn();

        function handleTurnStarted(turn) {
            gameState.isMyTurn = turn.yourTurn;
            gameState.availablePowers = turn.availablePowers;

            if (turn.yourTurn) {
                showScreen('game-screen');
                renderOnlineBattleUI();
            } else {
                document.getElementById('waiting-message').textContent = 'Tour de l\'adversaire...';
                showScreen('waiting-opponent-screen');
            }
        }

        test('affiche l\'écran de jeu si c\'est mon tour', () => {
            handleTurnStarted({ yourTurn: true, availablePowers: [] });

            expect(document.getElementById('game-screen').classList.contains('active')).toBe(true);
            expect(gameState.isMyTurn).toBe(true);
        });

        test('affiche l\'écran d\'attente si c\'est le tour de l\'adversaire', () => {
            handleTurnStarted({ yourTurn: false, availablePowers: [] });

            expect(document.getElementById('waiting-opponent-screen').classList.contains('active')).toBe(true);
            expect(document.getElementById('waiting-message').textContent).toBe('Tour de l\'adversaire...');
        });

        test('stocke les pouvoirs disponibles', () => {
            const powers = [{ type: 1, name: 'Coup Fatal' }, { type: 2, name: 'Tir Triple' }];
            handleTurnStarted({ yourTurn: true, availablePowers: powers });

            expect(gameState.availablePowers).toEqual(powers);
        });
    });

    describe('handleOnlineGameOver', () => {
        beforeEach(() => {
            multiplayerClient = {
                player: { id: 'player-1', displayName: 'TestPirate' }
            };
            opponentInfo = { id: 'player-2', displayName: 'Adversaire' };
        });

        function handleOnlineGameOver(result) {
            if (result.youWon) {
                document.getElementById('winner').textContent = multiplayerClient.player.displayName;
            } else {
                document.getElementById('winner').textContent = opponentInfo ? opponentInfo.displayName : 'Adversaire';
            }
            showScreen('victory-screen');
        }

        test('affiche le gagnant si victoire', () => {
            handleOnlineGameOver({ youWon: true, reason: 'all_ships_sunk' });

            expect(document.getElementById('winner').textContent).toBe('TestPirate');
            expect(document.getElementById('victory-screen').classList.contains('active')).toBe(true);
        });

        test('affiche l\'adversaire si défaite', () => {
            handleOnlineGameOver({ youWon: false, reason: 'all_ships_sunk' });

            expect(document.getElementById('winner').textContent).toBe('Adversaire');
        });
    });

    describe('Online attack results', () => {
        const updateOnlineAttackGrid = jest.fn();

        function showOnlineAttackResult(result) {
            const resultIcon = document.getElementById('result-icon');
            const resultTitle = document.getElementById('result-title');
            const resultMessage = document.getElementById('result-message');
            const powerGained = document.getElementById('power-gained');

            if (result.sunkShip) {
                resultIcon.textContent = '☠️';
                resultTitle.textContent = 'Coulé!';
                resultMessage.textContent = `Le ${result.sunkShip.name} ennemi rejoint les abysses!`;
                powerGained.classList.add('hidden');
            } else if (result.hit) {
                resultIcon.textContent = '💥';
                resultTitle.textContent = 'Touché!';
                resultMessage.textContent = 'Bien visé, Capitaine!';
                powerGained.classList.add('hidden');
            } else {
                resultIcon.textContent = '💨';
                resultTitle.textContent = 'À l\'eau!';
                resultMessage.textContent = 'Le boulet s\'enfonce dans les vagues...';
                powerGained.classList.add('hidden');
            }

            updateOnlineAttackGrid(result.target, result.hit, result.sunkShip);
            showScreen('result-screen');
        }

        test('affiche touché', () => {
            showOnlineAttackResult({
                target: { x: 5, y: 5 },
                hit: true,
                sunkShip: null
            });

            expect(document.getElementById('result-title').textContent).toBe('Touché!');
            expect(document.getElementById('result-icon').textContent).toBe('💥');
        });

        test('affiche raté', () => {
            showOnlineAttackResult({
                target: { x: 5, y: 5 },
                hit: false,
                sunkShip: null
            });

            expect(document.getElementById('result-title').textContent).toBe('À l\'eau!');
            expect(document.getElementById('result-icon').textContent).toBe('💨');
        });

        test('affiche coulé', () => {
            showOnlineAttackResult({
                target: { x: 5, y: 5 },
                hit: true,
                sunkShip: { name: 'Galion', size: 5 }
            });

            expect(document.getElementById('result-title').textContent).toBe('Coulé!');
            expect(document.getElementById('result-icon').textContent).toBe('☠️');
            expect(document.getElementById('result-message').textContent).toContain('Galion');
        });
    });

    describe('Disconnect', () => {
        function disconnectFromServer() {
            if (multiplayerClient) {
                multiplayerClient.disconnect();
                multiplayerClient = null;
            }
            isOnlineMode = false;
            currentMatchId = null;
            opponentInfo = null;
            showScreen('welcome-screen');
        }

        test('déconnecte et retourne au menu', () => {
            const mockDisconnect = jest.fn();
            multiplayerClient = { disconnect: mockDisconnect };
            isOnlineMode = true;
            currentMatchId = 'match-123';
            opponentInfo = { displayName: 'Test' };

            disconnectFromServer();

            expect(mockDisconnect).toHaveBeenCalled();
            expect(multiplayerClient).toBeNull();
            expect(isOnlineMode).toBe(false);
            expect(currentMatchId).toBeNull();
            expect(opponentInfo).toBeNull();
            expect(document.getElementById('welcome-screen').classList.contains('active')).toBe(true);
        });
    });

    describe('handleContinue in online mode', () => {
        function handleContinue() {
            if (isOnlineMode) {
                document.getElementById('waiting-message').textContent = 'Tour de l\'adversaire...';
                showScreen('waiting-opponent-screen');
                return;
            }
        }

        test('affiche l\'écran d\'attente en mode online', () => {
            isOnlineMode = true;

            handleContinue();

            expect(document.getElementById('waiting-opponent-screen').classList.contains('active')).toBe(true);
            expect(document.getElementById('waiting-message').textContent).toBe('Tour de l\'adversaire...');
        });
    });

    describe('renderOnlinePowers', () => {
        beforeEach(() => {
            gameState = createInitialGameState();
            gameState.activePower = null;
            gameState.availablePowers = [];
        });

        const togglePower = jest.fn();

        function renderOnlinePowers() {
            const powersList = document.getElementById('powers-list');
            powersList.innerHTML = '';

            const powers = gameState.availablePowers || [];

            if (powers.length === 0) {
                powersList.innerHTML = '<span style="color: var(--sand); font-size: 0.9rem;">Aucun pouvoir</span>';
                return;
            }

            const powerIcons = {
                1: '💀',
                2: '🎯',
                3: '📡',
                4: '🐙',
            };

            const powerNames = {
                1: 'instakill',
                2: 'triple',
                3: 'sonar',
                4: 'kraken',
            };

            powers.forEach((power) => {
                const btn = document.createElement('button');
                btn.className = 'pirate-btn power';
                btn.innerHTML = `${powerIcons[power.type] || '⚡'} ${power.name}`;

                const localPowerName = powerNames[power.type];
                if (gameState.activePower === localPowerName) {
                    btn.classList.add('active');
                }

                btn.addEventListener('click', () => togglePower(localPowerName));
                powersList.appendChild(btn);
            });
        }

        test('affiche message si aucun pouvoir', () => {
            gameState.availablePowers = [];

            renderOnlinePowers();

            expect(document.getElementById('powers-list').innerHTML).toContain('Aucun pouvoir');
        });

        test('affiche les boutons de pouvoir', () => {
            gameState.availablePowers = [
                { type: 1, name: 'Coup Fatal' },
                { type: 4, name: 'Kraken' }
            ];

            renderOnlinePowers();

            const buttons = document.querySelectorAll('#powers-list button');
            expect(buttons.length).toBe(2);
            expect(buttons[0].innerHTML).toContain('💀');
            expect(buttons[1].innerHTML).toContain('🐙');
        });

        test('marque le pouvoir actif', () => {
            gameState.availablePowers = [{ type: 2, name: 'Tir Triple' }];
            gameState.activePower = 'triple';

            renderOnlinePowers();

            const buttons = document.querySelectorAll('#powers-list button');
            expect(buttons[0].classList.contains('active')).toBe(true);
        });
    });

    describe('updateOnlineAttackGrid', () => {
        beforeEach(() => {
            const attackGrid = document.getElementById('attack-grid');
            attackGrid.innerHTML = '';
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 10; x++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.x = x;
                    cell.dataset.y = y;
                    attackGrid.appendChild(cell);
                }
            }
        });

        function updateOnlineAttackGrid(coord, hit, sunkShip) {
            const cell = document.querySelector(`#attack-grid .cell[data-x="${coord.x}"][data-y="${coord.y}"]`);
            if (cell) {
                if (sunkShip) {
                    cell.classList.add('sunk');
                } else if (hit) {
                    cell.classList.add('hit');
                } else {
                    cell.classList.add('miss');
                }
            }
        }

        test('marque une cellule comme touchée', () => {
            updateOnlineAttackGrid({ x: 3, y: 4 }, true, null);

            const cell = document.querySelector('#attack-grid .cell[data-x="3"][data-y="4"]');
            expect(cell.classList.contains('hit')).toBe(true);
        });

        test('marque une cellule comme ratée', () => {
            updateOnlineAttackGrid({ x: 5, y: 5 }, false, null);

            const cell = document.querySelector('#attack-grid .cell[data-x="5"][data-y="5"]');
            expect(cell.classList.contains('miss')).toBe(true);
        });

        test('marque une cellule comme coulée', () => {
            updateOnlineAttackGrid({ x: 0, y: 0 }, true, { name: 'Galion' });

            const cell = document.querySelector('#attack-grid .cell[data-x="0"][data-y="0"]');
            expect(cell.classList.contains('sunk')).toBe(true);
        });
    });

    describe('handleOpponentAction', () => {
        beforeEach(() => {
            gameState = createInitialGameState();
            const grid = gameState.players[1].grid;
            grid[3][2] = { shipId: 'ship-1', hit: false };
            grid[3][3] = { shipId: 'ship-1', hit: false };
        });

        function handleOpponentAction(action) {
            action.yourGridUpdates.forEach(update => {
                const cell = gameState.players[1].grid[update.position.y][update.position.x];
                if (cell && cell.shipId) {
                    cell.hit = true;
                    if (update.state === 4) {
                        cell.sunk = true;
                    }
                }
            });
        }

        test('met à jour la grille après une attaque adverse', () => {
            handleOpponentAction({
                yourGridUpdates: [
                    { position: { x: 2, y: 3 }, state: 3 }
                ]
            });

            expect(gameState.players[1].grid[3][2].hit).toBe(true);
        });

        test('marque le bateau comme coulé', () => {
            handleOpponentAction({
                yourGridUpdates: [
                    { position: { x: 2, y: 3 }, state: 4 },
                    { position: { x: 3, y: 3 }, state: 4 }
                ]
            });

            expect(gameState.players[1].grid[3][2].sunk).toBe(true);
            expect(gameState.players[1].grid[3][3].sunk).toBe(true);
        });
    });
});
