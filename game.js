// Import logic from gameLogic.js (loaded via script tag in browser)
// In browser context, these are global variables from gameLogic.js

let gameState = null;
let isOnlineMode = false;
let multiplayerClient = null;
let currentMatchId = null;
let matchTimeoutInterval = null;
let opponentInfo = null;
let pendingGameOver = null;

function initGame() {
    gameState = createInitialGameState();
    showScreen('welcome-screen');
}

// =============================================================================
// DOM Utilities
// =============================================================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function $(id) {
    return document.getElementById(id);
}

// =============================================================================
// Event Listeners Setup
// =============================================================================

function setupEventListeners() {
    $('start-local').addEventListener('click', startLocalGame);
    $('start-online').addEventListener('click', showOnlineScreen);
    $('rotate-btn').addEventListener('click', rotateShip);
    $('random-placement').addEventListener('click', randomPlacement);
    $('reset-placement').addEventListener('click', resetPlacement);
    $('confirm-placement').addEventListener('click', confirmPlacement);
    $('ready-btn').addEventListener('click', handleReadyClick);
    $('continue-btn').addEventListener('click', handleContinue);
    $('new-game-btn').addEventListener('click', () => {
        if (multiplayerClient) {
            multiplayerClient.disconnect();
        }
        location.reload();
    });

    // Online mode listeners
    $('back-to-menu').addEventListener('click', backToMenu);
    $('connect-btn').addEventListener('click', connectToServer);
    $('join-queue-btn').addEventListener('click', joinMatchmaking);
    $('leave-queue-btn').addEventListener('click', leaveMatchmaking);
    $('disconnect-btn').addEventListener('click', disconnectFromServer);
    $('accept-match-btn').addEventListener('click', () => respondToMatch(true));
    $('reject-match-btn').addEventListener('click', () => respondToMatch(false));

    document.querySelectorAll('.ship-to-place').forEach(ship => {
        ship.addEventListener('click', () => selectShip(ship));
    });
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

async function connectToServer() {
    const playerName = $('player-name').value.trim();
    const serverUrl = $('server-url').value.trim();

    if (!playerName) {
        alert('Veuillez entrer votre nom de pirate');
        return;
    }

    if (!serverUrl) {
        alert('Veuillez entrer l\'URL du serveur');
        return;
    }

    $('connection-form').classList.add('hidden');
    $('connection-status').classList.remove('hidden');
    $('status-message').textContent = 'Connexion...';

    try {
        multiplayerClient = new window.MultiplayerClient();
        const player = await multiplayerClient.connect(serverUrl, playerName);

        setupMultiplayerEventHandlers();

        $('my-player-name').textContent = player.displayName;
        showScreen('lobby-screen');

        refreshPlayerList();
        // Auto-refresh player list every 3 seconds
        setInterval(refreshPlayerList, 3000);
    } catch (error) {
        console.error('Connection error:', error);
        $('status-message').textContent = 'Erreur de connexion: ' + error.message;
        setTimeout(() => {
            $('connection-form').classList.remove('hidden');
            $('connection-status').classList.add('hidden');
        }, 2000);
    }
}

function setupMultiplayerEventHandlers() {
    multiplayerClient.on('queueStatus', (status) => {
        if (status.inQueue) {
            $('queue-message').textContent = `En attente... (${status.playersInQueue} joueur(s) dans la file)`;
        }
    });

    multiplayerClient.on('playerList', (update) => {
        renderPlayerList(update.availablePlayers);
    });

    multiplayerClient.on('matchProposal', (proposal) => {
        showMatchProposal(proposal);
    });

    multiplayerClient.on('matchResult', (result) => {
        handleMatchResult(result);
    });

    multiplayerClient.on('gameStarted', (game) => {
        startOnlineGame(game);
    });

    multiplayerClient.on('placementUpdate', (result) => {
        if (result.waitingForOpponent) {
            $('waiting-message').textContent = 'Votre adversaire place ses navires...';
            showScreen('waiting-opponent-screen');
        }
    });

    multiplayerClient.on('turnStarted', (turn) => {
        handleTurnStarted(turn);
    });

    multiplayerClient.on('opponentAction', (action) => {
        handleOpponentAction(action);
    });

    multiplayerClient.on('gameOver', (result) => {
        pendingGameOver = result;
    });

    multiplayerClient.on('error', (error) => {
        console.error('Multiplayer error:', error);
        alert('Erreur de connexion. Retour au menu.');
        disconnectFromServer();
    });
}

async function refreshPlayerList() {
    try {
        const result = await multiplayerClient.listPlayers();
        renderPlayerList(result.availablePlayers);
    } catch (error) {
        console.error('Failed to refresh player list:', error);
    }
}

function renderPlayerList(players) {
    const container = $('players-list');
    container.innerHTML = '';

    const otherPlayers = players.filter(p => p.id !== multiplayerClient.player.id);

    if (otherPlayers.length === 0) {
        container.innerHTML = '<p class="no-players">Aucun joueur disponible</p>';
        return;
    }

    otherPlayers.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <span class="player-name"><span class="online-indicator"></span>${player.displayName}</span>
            <button class="pirate-btn small challenge-btn" data-player-id="${player.id}">⚔️ Défier</button>
        `;
        item.querySelector('.challenge-btn').addEventListener('click', () => challengePlayer(player.id));
        container.appendChild(item);
    });
}

async function challengePlayer(playerId) {
    try {
        await multiplayerClient.challengePlayer(playerId);
    } catch (error) {
        console.error('Failed to challenge player:', error);
        alert('Impossible de défier ce joueur');
    }
}

async function joinMatchmaking() {
    try {
        await multiplayerClient.joinQueue();
        $('join-queue-btn').classList.add('hidden');
        $('leave-queue-btn').classList.remove('hidden');
        $('queue-status').classList.remove('hidden');
    } catch (error) {
        console.error('Failed to join queue:', error);
    }
}

async function leaveMatchmaking() {
    try {
        await multiplayerClient.leaveQueue();
        $('join-queue-btn').classList.remove('hidden');
        $('leave-queue-btn').classList.add('hidden');
        $('queue-status').classList.add('hidden');
    } catch (error) {
        console.error('Failed to leave queue:', error);
    }
}

function showMatchProposal(proposal) {
    currentMatchId = proposal.matchId;
    opponentInfo = proposal.opponent;

    if (proposal.youInitiated) {
        $('match-proposal-message').textContent = 'En attente de la réponse de...';
    } else {
        $('match-proposal-message').textContent = 'Un adversaire vous défie!';
    }

    $('match-opponent-name').textContent = proposal.opponent.displayName;

    let timeLeft = proposal.timeoutSeconds;
    $('match-timeout').textContent = `${timeLeft}s`;

    if (matchTimeoutInterval) clearInterval(matchTimeoutInterval);
    matchTimeoutInterval = setInterval(() => {
        timeLeft--;
        $('match-timeout').textContent = `${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(matchTimeoutInterval);
        }
    }, 1000);

    showScreen('match-proposal-screen');
}

async function respondToMatch(accepted) {
    if (matchTimeoutInterval) {
        clearInterval(matchTimeoutInterval);
        matchTimeoutInterval = null;
    }

    try {
        await multiplayerClient.respondToMatch(currentMatchId, accepted);
    } catch (error) {
        console.error('Failed to respond to match:', error);
    }
}

function handleMatchResult(result) {
    if (matchTimeoutInterval) {
        clearInterval(matchTimeoutInterval);
        matchTimeoutInterval = null;
    }

    if (!result.accepted) {
        alert(result.rejectionReason || 'Match refusé');
        showScreen('lobby-screen');
    }
}

function startOnlineGame(game) {
    isOnlineMode = true;
    opponentInfo = game.opponent;

    gameState = createInitialGameState();
    gameState.phase = 'placement';
    gameState.currentPlayer = 1;
    gameState.onlineGameId = game.gameId;
    gameState.myTurnFirst = game.yourTurnFirst;
    gameState.opponentGrid = createEmptyGrid();

    resetPlacementUI();
    $('placement-player').textContent = multiplayerClient.player.displayName;
    showScreen('placement-screen');
    renderPlacementGrid();
}

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

// =============================================================================
// Placement Phase
// =============================================================================

function startPlacement() {
    gameState.phase = 'placement';
    gameState.currentPlayer = 1;
    resetPlacementUI();
    showScreen('placement-screen');
    renderPlacementGrid();
}

function resetPlacementUI() {
    $('placement-player').textContent = gameState.currentPlayer;
    document.querySelectorAll('.ship-to-place').forEach(ship => {
        ship.classList.remove('placed', 'selected');
    });
    gameState.selectedShip = null;
    gameState.isHorizontal = true;
    $('confirm-placement').disabled = true;
}

function selectShip(shipElement) {
    if (shipElement.classList.contains('placed')) return;

    const size = parseInt(shipElement.dataset.size);
    const name = shipElement.dataset.name;
    const currentShips = gameState.players[gameState.currentPlayer].ships;

    if (isShipAlreadyPlaced(currentShips, name)) {
        shipElement.classList.add('placed');
        return;
    }

    document.querySelectorAll('.ship-to-place').forEach(s => s.classList.remove('selected'));
    shipElement.classList.add('selected');

    const shipTemplate = SHIPS.find(s => s.size === size && s.name === name);
    gameState.selectedShip = { ...shipTemplate };
}

function rotateShip() {
    gameState.isHorizontal = !gameState.isHorizontal;
    clearPreview();
}

function resetPlacement() {
    gameState.players[gameState.currentPlayer].grid = createEmptyGrid();
    gameState.players[gameState.currentPlayer].ships = [];
    resetPlacementUI();
    renderPlacementGrid();
}

function randomPlacement() {
    const player = gameState.currentPlayer;
    placeShipsRandomly(gameState.players[player].grid, gameState.players[player].ships);
    document.querySelectorAll('.ship-to-place').forEach(el => {
        el.classList.add('placed');
        el.classList.remove('selected');
    });
    gameState.selectedShip = null;
    renderPlacementGrid();
    checkPlacementComplete();
}

function renderPlacementGrid() {
    const gridElement = $('placement-grid');
    gridElement.innerHTML = '';

    const grid = gameState.players[gameState.currentPlayer].grid;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;

            if (grid[y][x]) {
                cell.classList.add('ship');
            }

            cell.addEventListener('mouseenter', () => showPreview(x, y));
            cell.addEventListener('mouseleave', clearPreview);
            cell.addEventListener('click', () => handlePlaceShip(x, y));
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                showPreview(x, y);
            });
            cell.addEventListener('touchend', (e) => {
                e.preventDefault();
                handlePlaceShip(x, y);
                clearPreview();
            });

            gridElement.appendChild(cell);
        }
    }
}

function showPreview(startX, startY) {
    if (!gameState.selectedShip) return;

    clearPreview();

    const grid = gameState.players[gameState.currentPlayer].grid;
    const cells = getShipCells(startX, startY, gameState.selectedShip.size, gameState.isHorizontal);
    const isValid = canPlaceShip(grid, startX, startY, gameState.selectedShip.size, gameState.isHorizontal);

    cells.forEach(({ x, y }) => {
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
            const cell = document.querySelector(`#placement-grid .cell[data-x="${x}"][data-y="${y}"]`);
            if (cell && !cell.classList.contains('ship')) {
                cell.classList.add('preview');
                if (!isValid) cell.classList.add('invalid');
            }
        }
    });
}

function clearPreview() {
    document.querySelectorAll('#placement-grid .cell.preview').forEach(cell => {
        cell.classList.remove('preview', 'invalid');
    });
}

function handlePlaceShip(startX, startY) {
    if (!gameState.selectedShip) return;

    const grid = gameState.players[gameState.currentPlayer].grid;
    const ships = gameState.players[gameState.currentPlayer].ships;

    const newShip = placeShipOnGrid(grid, ships, gameState.selectedShip, startX, startY, gameState.isHorizontal);

    if (!newShip) return;

    const shipElement = document.querySelector(
        `.ship-to-place[data-size="${gameState.selectedShip.size}"][data-name="${gameState.selectedShip.name}"]`
    );
    shipElement.classList.add('placed');
    shipElement.classList.remove('selected');

    gameState.selectedShip = null;
    renderPlacementGrid();
    checkPlacementComplete();
}

function checkPlacementComplete() {
    const ships = gameState.players[gameState.currentPlayer].ships;
    $('confirm-placement').disabled = !isPlacementComplete(ships);
}

async function confirmPlacement() {
    if (isOnlineMode) {
        const ships = gameState.players[1].ships;
        try {
            const result = await multiplayerClient.placeShips(ships);
            if (!result.valid) {
                alert('Placement invalide: ' + result.errorMessage);
                return;
            }
            if (result.waitingForOpponent) {
                $('waiting-message').textContent = 'Votre adversaire place ses navires...';
                showScreen('waiting-opponent-screen');
            }
        } catch (error) {
            console.error('Failed to place ships:', error);
            alert('Erreur lors du placement');
        }
    } else {
        if (gameState.currentPlayer === 1) {
            gameState.currentPlayer = 2;
            resetPlacementUI();
            showTransition('Passez le téléphone au Capitaine 2', () => {
                showScreen('placement-screen');
                renderPlacementGrid();
            });
        } else {
            gameState.phase = 'battle';
            gameState.currentPlayer = 1;
            showTransition('Capitaine 1, préparez vos canons!', startBattle);
        }
    }
}

// =============================================================================
// Transition Screen
// =============================================================================

function showTransition(message, callback) {
    $('transition-message').textContent = message;
    showScreen('transition-screen');
    gameState.transitionCallback = callback;
}

function handleReadyClick() {
    if (gameState.transitionCallback) {
        gameState.transitionCallback();
    }
}

// =============================================================================
// Battle Phase
// =============================================================================

function startBattle() {
    showScreen('game-screen');
    renderBattleUI();
}

function renderBattleUI() {
    $('current-player').textContent = gameState.currentPlayer;

    const opponent = getOpponent(gameState.currentPlayer);
    const opponentGrid = gameState.players[opponent].grid;
    const myGrid = gameState.players[gameState.currentPlayer].grid;

    renderAttackGrid(opponentGrid);
    renderMyFleetPreview(myGrid);
    renderPowers();
    updateGameInstruction();
}

function renderAttackGrid(opponentGrid) {
    const gridElement = $('attack-grid');
    gridElement.innerHTML = '';

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;

            const cellData = opponentGrid[y][x];
            if (cellData && cellData.hit) {
                cell.classList.add(cellData.sunk ? 'sunk' : 'hit');
            } else if (cellData === 'miss') {
                cell.classList.add('miss');
            } else if (cellData && cellData.revealed) {
                cell.classList.add('revealed');
            }

            cell.addEventListener('click', () => handleAttack(x, y));
            cell.addEventListener('mouseenter', () => showPowerPreview(x, y));
            cell.addEventListener('mouseleave', clearPowerPreview);

            gridElement.appendChild(cell);
        }
    }
}

function renderMyFleetPreview(myGrid) {
    const gridElement = $('my-grid-small');
    gridElement.innerHTML = '';

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';

            const cellData = myGrid[y][x];
            if (cellData && cellData.shipId) {
                if (cellData.sunk) {
                    cell.classList.add('sunk');
                } else if (cellData.hit) {
                    cell.classList.add('hit');
                } else {
                    cell.classList.add('ship');
                }
            } else if (cellData === 'miss') {
                cell.classList.add('miss');
            }

            gridElement.appendChild(cell);
        }
    }
}

// =============================================================================
// Powers Management
// =============================================================================

function renderPowers() {
    const powersList = $('powers-list');
    powersList.innerHTML = '';

    const powers = gameState.players[gameState.currentPlayer].powers;

    if (powers.length === 0) {
        powersList.innerHTML = '<span style="color: var(--sand); font-size: 0.9rem;">Aucun pouvoir - Coulez des navires ennemis!</span>';
        return;
    }

    powers.forEach((power) => {
        const btn = document.createElement('button');
        btn.className = 'pirate-btn power';
        btn.innerHTML = `${POWER_ICONS[power.type]} ${power.name}`;

        if (gameState.activePower === power.type) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => togglePower(power.type));
        powersList.appendChild(btn);
    });
}

function togglePower(powerType) {
    if (gameState.activePower === powerType) {
        gameState.activePower = null;
        gameState.tripleDirection = null;
    } else {
        gameState.activePower = powerType;
        if (powerType === 'triple') {
            gameState.tripleDirection = 'horizontal';
        }
    }
    renderPowers();
    updateGameInstruction();
    clearPowerPreview();
}

function updateGameInstruction() {
    const instruction = $('game-instruction');

    if (gameState.activePower) {
        const powerInfo = SHIPS.find(s => s.power === gameState.activePower);
        if (gameState.activePower === 'triple') {
            const dirIcon = gameState.tripleDirection === 'horizontal' ? '↔️ Horizontal' : '↕️ Vertical';
            instruction.innerHTML = `<strong>${POWER_ICONS[gameState.activePower]} ${powerInfo.powerName}</strong> - Cliquez sur une case pour tirer (${dirIcon})<br><button class="pirate-btn small" onclick="toggleTripleDirection()">Changer direction</button>`;
        } else {
            instruction.innerHTML = `<strong>${POWER_ICONS[gameState.activePower]} ${powerInfo.powerName}</strong> - ${powerInfo.powerDesc}`;
        }
    } else {
        instruction.textContent = 'Choisissez où tirer!';
    }
}

function toggleTripleDirection() {
    gameState.tripleDirection = gameState.tripleDirection === 'horizontal' ? 'vertical' : 'horizontal';
    updateGameInstruction();
    clearPowerPreview();
}

function showPowerPreview(x, y) {
    if (!gameState.activePower) return;

    clearPowerPreview();
    const cells = getPowerTargetCells(x, y, gameState.activePower, gameState.tripleDirection);

    cells.forEach(({ x: cx, y: cy }) => {
        const cell = document.querySelector(`#attack-grid .cell[data-x="${cx}"][data-y="${cy}"]`);
        if (cell) {
            cell.classList.add('power-target');
        }
    });
}

function clearPowerPreview() {
    document.querySelectorAll('#attack-grid .cell.power-target').forEach(cell => {
        cell.classList.remove('power-target');
    });
}

// =============================================================================
// Attack Handling
// =============================================================================

async function handleAttack(x, y) {
    if (isOnlineMode) {
        await handleOnlineAttack(x, y);
    } else {
        const opponent = getOpponent(gameState.currentPlayer);
        if (gameState.activePower) {
            executePowerAttackAndShow(x, y, opponent);
        } else {
            executeNormalAttackAndShow(x, y, opponent);
        }
    }
}

async function handleOnlineAttack(x, y) {
    try {
        if (gameState.activePower) {
            const horizontal = gameState.tripleDirection === 'horizontal';
            const result = await multiplayerClient.usePower(gameState.activePower, x, y, horizontal);
            showOnlinePowerResult(result);
            gameState.activePower = null;
        } else {
            const result = await multiplayerClient.attack(x, y);
            showOnlineAttackResult(result);
        }
    } catch (error) {
        console.error('Attack error:', error);
        alert('Erreur lors de l\'attaque');
    }
}

function showOnlineAttackResult(result) {
    const resultIcon = $('result-icon');
    const resultTitle = $('result-title');
    const resultMessage = $('result-message');
    const powerGained = $('power-gained');

    if (result.sunkShip) {
        resultIcon.textContent = '☠️';
        resultTitle.textContent = 'Coulé!';
        resultMessage.textContent = `Le ${result.sunkShip.name} ennemi rejoint les abysses!`;

        if (result.powerGained) {
            powerGained.classList.remove('hidden');
            $('power-gained-name').textContent = result.powerGained.name;
            $('power-description').textContent = `L'adversaire obtient ce pouvoir!`;
        } else {
            powerGained.classList.add('hidden');
        }
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

function showOnlinePowerResult(result) {
    const resultIcon = $('result-icon');
    const resultTitle = $('result-title');
    const resultMessage = $('result-message');
    const powerGained = $('power-gained');

    const powerIcons = {
        1: '💀', // INSTAKILL
        2: '🎯', // TRIPLE
        3: '📡', // SONAR
        4: '🐙', // KRAKEN
    };

    resultIcon.textContent = powerIcons[result.powerUsed] || '⚡';
    resultTitle.textContent = result.message || 'Pouvoir utilisé!';
    resultMessage.textContent = '';

    if (result.sunkShips && result.sunkShips.length > 0) {
        resultIcon.textContent = '☠️';
        resultTitle.textContent = 'Coulé!';
        powerGained.classList.remove('hidden');
        $('power-gained-name').textContent = result.sunkShips[0].name + ' coulé!';
        $('power-description').textContent = `L'adversaire obtient un pouvoir!`;
    } else {
        powerGained.classList.add('hidden');
    }

    result.cellsAffected.forEach(cell => {
        const isHit = cell.state === 3 || cell.state === 4; // HIT or SUNK
        const isSunk = cell.state === 4;
        const isRevealed = cell.state === 5; // REVEALED (sonar)
        const sunkShip = isSunk && result.sunkShips ? result.sunkShips.find(s => true) : null;
        updateOnlineAttackGrid(cell.position, isHit, sunkShip, isRevealed);
    });

    showScreen('result-screen');
}

function updateOnlineAttackGrid(coord, hit, sunkShip, revealed) {
    if (sunkShip) {
        gameState.opponentGrid[coord.y][coord.x] = { hit: true, sunk: true, shipId: sunkShip.name };
    } else if (hit) {
        gameState.opponentGrid[coord.y][coord.x] = { hit: true, shipId: 'unknown' };
    } else if (revealed) {
        gameState.opponentGrid[coord.y][coord.x] = { revealed: true };
    } else {
        gameState.opponentGrid[coord.y][coord.x] = 'miss';
    }

    const cell = document.querySelector(`#attack-grid .cell[data-x="${coord.x}"][data-y="${coord.y}"]`);
    if (cell) {
        if (sunkShip) {
            cell.classList.add('sunk');
        } else if (hit) {
            cell.classList.add('hit');
        } else if (revealed) {
            cell.classList.add('revealed');
        } else {
            cell.classList.add('miss');
        }
    }
}

function handleTurnStarted(turn) {
    console.log('handleTurnStarted called:', turn);
    console.log('gameState before:', gameState);
    
    gameState.phase = 'battle';
    gameState.isMyTurn = turn.yourTurn;
    gameState.availablePowers = turn.availablePowers;

    if (turn.yourTurn) {
        console.log('My turn - showing game-screen');
        showScreen('game-screen');
        renderOnlineBattleUI();
        renderOnlineGrids();
    } else {
        console.log('Opponent turn - showing waiting screen');
        $('waiting-message').textContent = 'Tour de l\'adversaire...';
        showScreen('waiting-opponent-screen');
    }
}

function handleOpponentAction(action) {
    action.yourGridUpdates.forEach(update => {
        const cell = gameState.players[1].grid[update.position.y][update.position.x];
        if (cell && cell.shipId) {
            cell.hit = true;
            if (update.state === 4) { // SUNK
                cell.sunk = true;
            }
        } else {
            gameState.players[1].grid[update.position.y][update.position.x] = 'miss';
        }
    });
}

function handleOnlineGameOver(result) {
    const victoryContent = document.querySelector('.victory-content');
    const trophy = victoryContent.querySelector('.trophy');
    const title = victoryContent.querySelector('h1');
    
    if (result.youWon) {
        trophy.textContent = '🏆';
        title.textContent = 'Victoire!';
        $('winner').textContent = multiplayerClient.player.displayName;
    } else {
        trophy.textContent = '💀';
        title.textContent = 'Défaite...';
        $('winner').textContent = opponentInfo ? opponentInfo.displayName : 'Adversaire';
    }
    showScreen('victory-screen');
}

function renderOnlineBattleUI() {
    $('current-player').textContent = multiplayerClient.player.displayName;
    renderOnlinePowers();
    updateGameInstruction();
}

function renderOnlineGrids() {
    renderAttackGrid(gameState.opponentGrid);
    renderMyFleetPreview(gameState.players[1].grid);
}

function renderOnlinePowers() {
    const powersList = $('powers-list');
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

function executeNormalAttackAndShow(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const opponentShips = gameState.players[opponent].ships;
    const opponentPowers = gameState.players[opponent].powers;

    const result = executeNormalAttack(opponentGrid, opponentShips, opponentPowers, x, y);

    if (result) {
        showAttackResult(result);
    }
}

function executePowerAttackAndShow(x, y, opponent) {
    const power = gameState.activePower;
    const currentPowers = gameState.players[gameState.currentPlayer].powers;

    if (!removePower(currentPowers, power)) return;

    const opponentGrid = gameState.players[opponent].grid;
    const opponentShips = gameState.players[opponent].ships;
    const opponentPowers = gameState.players[opponent].powers;

    let result;

    switch (power) {
        case 'instakill':
            result = executeInstakill(opponentGrid, opponentShips, opponentPowers, x, y);
            break;
        case 'triple':
            result = executeTriple(opponentGrid, opponentShips, opponentPowers, x, y, gameState.tripleDirection);
            break;
        case 'sonar':
            result = executeSonar(opponentGrid, x, y);
            break;
        case 'kraken':
            result = executeKraken(opponentGrid, opponentShips, opponentPowers, x, y);
            break;
    }

    gameState.activePower = null;
    showAttackResult(result);
}

// =============================================================================
// Result Display
// =============================================================================

function showAttackResult(result) {
    const resultIcon = $('result-icon');
    const resultTitle = $('result-title');
    const resultMessage = $('result-message');
    const powerGained = $('power-gained');
    const powerGainedName = $('power-gained-name');
    const powerDescription = $('power-description');

    if (result.powerUsed) {
        resultIcon.textContent = POWER_ICONS[result.powerUsed];
        resultTitle.textContent = result.message;
        resultMessage.textContent = '';
    } else if (result.sunk) {
        resultIcon.textContent = '☠️';
        resultTitle.textContent = 'Coulé!';
        resultMessage.textContent = `Le ${result.sunk.name} ennemi rejoint les abysses!`;
    } else if (result.hit) {
        resultIcon.textContent = '💥';
        resultTitle.textContent = 'Touché!';
        resultMessage.textContent = 'Bien visé, Capitaine!';
    } else {
        resultIcon.textContent = '💨';
        resultTitle.textContent = 'À l\'eau!';
        resultMessage.textContent = 'Le boulet s\'enfonce dans les vagues...';
    }

    if (result.sunk || (result.allSunks && result.allSunks.length > 0)) {
        powerGained.classList.remove('hidden');
        const ship = result.sunk || result.allSunks[0];
        powerGainedName.textContent = `${POWER_ICONS[ship.power]} ${ship.powerName}`;
        powerDescription.textContent = `L'adversaire obtient ce pouvoir en compensation!`;
    } else {
        powerGained.classList.add('hidden');
    }

    showScreen('result-screen');
}

// =============================================================================
// Game Flow
// =============================================================================

function handleContinue() {
    if (isOnlineMode) {
        if (pendingGameOver) {
            handleOnlineGameOver(pendingGameOver);
            pendingGameOver = null;
            return;
        }
        $('waiting-message').textContent = 'Tour de l\'adversaire...';
        showScreen('waiting-opponent-screen');
        return;
    }

    const opponent = getOpponent(gameState.currentPlayer);

    if (checkVictory(gameState.players[opponent].ships)) {
        showVictory(gameState.currentPlayer);
        return;
    }

    gameState.currentPlayer = opponent;
    showTransition(`Passez le téléphone au Capitaine ${opponent}`, startBattle);
}

function showVictory(winner) {
    $('winner').textContent = winner;
    showScreen('victory-screen');
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initGame();
});
