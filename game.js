// Import logic from gameLogic.js (loaded via script tag in browser)
// In browser context, these are global variables from gameLogic.js

let gameState = null;

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
    $('start-game').addEventListener('click', startPlacement);
    $('rotate-btn').addEventListener('click', rotateShip);
    $('reset-placement').addEventListener('click', resetPlacement);
    $('confirm-placement').addEventListener('click', confirmPlacement);
    $('ready-btn').addEventListener('click', handleReadyClick);
    $('continue-btn').addEventListener('click', handleContinue);
    $('new-game-btn').addEventListener('click', () => location.reload());

    document.querySelectorAll('.ship-to-place').forEach(ship => {
        ship.addEventListener('click', () => selectShip(ship));
    });
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

function confirmPlacement() {
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

function handleAttack(x, y) {
    const opponent = getOpponent(gameState.currentPlayer);

    if (gameState.activePower) {
        executePowerAttackAndShow(x, y, opponent);
    } else {
        executeNormalAttackAndShow(x, y, opponent);
    }
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
