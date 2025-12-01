const GRID_SIZE = 10;
const SHIPS = [
    { size: 5, name: 'Galion', power: 'kraken', powerName: 'Kraken', powerDesc: 'Tire en croix (3 coups vertical + 3 coups horizontal)' },
    { size: 4, name: 'Frégate', power: 'sonar', powerName: 'Sonar', powerDesc: 'Révèle une zone en croix autour du tir' },
    { size: 3, name: 'Brick', power: 'triple', powerName: 'Tir Triple', powerDesc: 'Tire 3 coups alignés (vertical ou horizontal)' },
    { size: 3, name: 'Corvette', power: 'triple', powerName: 'Tir Triple', powerDesc: 'Tire 3 coups alignés (vertical ou horizontal)' },
    { size: 2, name: 'Chaloupe', power: 'instakill', powerName: 'Coup Fatal', powerDesc: 'Un tir qui touche coule immédiatement le bateau' }
];

const POWER_ICONS = {
    kraken: '🐙',
    sonar: '📡',
    triple: '🎯',
    instakill: '💀'
};

let gameState = {
    currentPlayer: 1,
    phase: 'welcome',
    players: {
        1: { grid: [], ships: [], powers: [] },
        2: { grid: [], ships: [], powers: [] }
    },
    selectedShip: null,
    isHorizontal: true,
    activePower: null,
    tripleDirection: null
};

function initGame() {
    gameState = {
        currentPlayer: 1,
        phase: 'welcome',
        players: {
            1: { grid: createEmptyGrid(), ships: [], powers: [] },
            2: { grid: createEmptyGrid(), ships: [], powers: [] }
        },
        selectedShip: null,
        isHorizontal: true,
        activePower: null,
        tripleDirection: null
    };
    showScreen('welcome-screen');
}

function createEmptyGrid() {
    return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function setupEventListeners() {
    document.getElementById('start-game').addEventListener('click', startPlacement);
    document.getElementById('rotate-btn').addEventListener('click', rotateShip);
    document.getElementById('reset-placement').addEventListener('click', resetPlacement);
    document.getElementById('confirm-placement').addEventListener('click', confirmPlacement);
    document.getElementById('ready-btn').addEventListener('click', handleReadyClick);
    document.getElementById('continue-btn').addEventListener('click', handleContinue);
    document.getElementById('new-game-btn').addEventListener('click', () => location.reload());

    document.querySelectorAll('.ship-to-place').forEach(ship => {
        ship.addEventListener('click', () => selectShip(ship));
    });
}

function startPlacement() {
    gameState.phase = 'placement';
    gameState.currentPlayer = 1;
    resetPlacementUI();
    showScreen('placement-screen');
    renderPlacementGrid();
}

function resetPlacementUI() {
    document.getElementById('placement-player').textContent = gameState.currentPlayer;
    document.querySelectorAll('.ship-to-place').forEach(ship => {
        ship.classList.remove('placed', 'selected');
    });
    gameState.selectedShip = null;
    gameState.isHorizontal = true;
    document.getElementById('confirm-placement').disabled = true;
}

function selectShip(shipElement) {
    if (shipElement.classList.contains('placed')) return;
    
    document.querySelectorAll('.ship-to-place').forEach(s => s.classList.remove('selected'));
    shipElement.classList.add('selected');
    
    const size = parseInt(shipElement.dataset.size);
    const name = shipElement.dataset.name;
    gameState.selectedShip = SHIPS.find(s => s.size === size && s.name === name);
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
    const gridElement = document.getElementById('placement-grid');
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
            cell.addEventListener('click', () => placeShip(x, y));
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                showPreview(x, y);
            });
            cell.addEventListener('touchend', (e) => {
                e.preventDefault();
                placeShip(x, y);
                clearPreview();
            });
            
            gridElement.appendChild(cell);
        }
    }
}

function showPreview(startX, startY) {
    if (!gameState.selectedShip) return;
    
    clearPreview();
    
    const cells = getShipCells(startX, startY, gameState.selectedShip.size, gameState.isHorizontal);
    const isValid = canPlaceShip(startX, startY, gameState.selectedShip.size, gameState.isHorizontal);
    
    cells.forEach(({x, y}) => {
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

function getShipCells(startX, startY, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
        cells.push({
            x: horizontal ? startX + i : startX,
            y: horizontal ? startY : startY + i
        });
    }
    return cells;
}

function canPlaceShip(startX, startY, size, horizontal) {
    const cells = getShipCells(startX, startY, size, horizontal);
    const grid = gameState.players[gameState.currentPlayer].grid;
    
    return cells.every(({x, y}) => 
        x >= 0 && x < GRID_SIZE && 
        y >= 0 && y < GRID_SIZE && 
        !grid[y][x]
    );
}

function placeShip(startX, startY) {
    if (!gameState.selectedShip) return;
    if (!canPlaceShip(startX, startY, gameState.selectedShip.size, gameState.isHorizontal)) return;
    
    const cells = getShipCells(startX, startY, gameState.selectedShip.size, gameState.isHorizontal);
    const grid = gameState.players[gameState.currentPlayer].grid;
    const shipId = Date.now();
    
    cells.forEach(({x, y}) => {
        grid[y][x] = { shipId, hit: false };
    });
    
    gameState.players[gameState.currentPlayer].ships.push({
        id: shipId,
        ...gameState.selectedShip,
        cells: cells,
        hits: 0
    });
    
    const shipElement = document.querySelector(`.ship-to-place[data-size="${gameState.selectedShip.size}"]`);
    shipElement.classList.add('placed');
    shipElement.classList.remove('selected');
    
    gameState.selectedShip = null;
    renderPlacementGrid();
    
    checkPlacementComplete();
}

function checkPlacementComplete() {
    const placedCount = gameState.players[gameState.currentPlayer].ships.length;
    document.getElementById('confirm-placement').disabled = placedCount < SHIPS.length;
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

function showTransition(message, callback) {
    document.getElementById('transition-message').textContent = message;
    showScreen('transition-screen');
    gameState.transitionCallback = callback;
}

function handleReadyClick() {
    if (gameState.transitionCallback) {
        gameState.transitionCallback();
    }
}

function startBattle() {
    showScreen('game-screen');
    renderBattleUI();
}

function renderBattleUI() {
    document.getElementById('current-player').textContent = gameState.currentPlayer;
    
    const opponent = gameState.currentPlayer === 1 ? 2 : 1;
    const opponentGrid = gameState.players[opponent].grid;
    const myGrid = gameState.players[gameState.currentPlayer].grid;
    
    renderAttackGrid(opponentGrid);
    renderMyFleetPreview(myGrid);
    renderPowers();
    updateGameInstruction();
}

function renderAttackGrid(opponentGrid) {
    const gridElement = document.getElementById('attack-grid');
    gridElement.innerHTML = '';
    
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            
            const cellData = opponentGrid[y][x];
            if (cellData && cellData.hit) {
                if (cellData.sunk) {
                    cell.classList.add('sunk');
                } else {
                    cell.classList.add('hit');
                }
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
    const gridElement = document.getElementById('my-grid-small');
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

function renderPowers() {
    const powersList = document.getElementById('powers-list');
    powersList.innerHTML = '';
    
    const powers = gameState.players[gameState.currentPlayer].powers;
    
    if (powers.length === 0) {
        powersList.innerHTML = '<span style="color: var(--sand); font-size: 0.9rem;">Aucun pouvoir - Coulez des navires ennemis!</span>';
        return;
    }
    
    powers.forEach((power, index) => {
        const btn = document.createElement('button');
        btn.className = 'pirate-btn power';
        btn.innerHTML = `${POWER_ICONS[power.type]} ${power.name}`;
        
        if (gameState.activePower === power.type) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', () => togglePower(power.type, index));
        powersList.appendChild(btn);
    });
}

function togglePower(powerType, index) {
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
    const instruction = document.getElementById('game-instruction');
    
    if (gameState.activePower) {
        const powerInfo = SHIPS.find(s => s.power === gameState.activePower);
        if (gameState.activePower === 'triple') {
            instruction.innerHTML = `<strong>${POWER_ICONS[gameState.activePower]} ${powerInfo.powerName}</strong> - Cliquez sur une case pour tirer (${gameState.tripleDirection === 'horizontal' ? '↔️ Horizontal' : '↕️ Vertical'})<br><button class="pirate-btn small" onclick="toggleTripleDirection()">Changer direction</button>`;
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
    const cells = getPowerTargetCells(x, y, gameState.activePower);
    
    cells.forEach(({x: cx, y: cy}) => {
        if (cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE) {
            const cell = document.querySelector(`#attack-grid .cell[data-x="${cx}"][data-y="${cy}"]`);
            if (cell) {
                cell.classList.add('power-target');
            }
        }
    });
}

function clearPowerPreview() {
    document.querySelectorAll('#attack-grid .cell.power-target').forEach(cell => {
        cell.classList.remove('power-target');
    });
}

function getPowerTargetCells(x, y, power) {
    const cells = [{x, y}];
    
    switch(power) {
        case 'triple':
            if (gameState.tripleDirection === 'horizontal') {
                cells.push({x: x-1, y}, {x: x+1, y});
            } else {
                cells.push({x, y: y-1}, {x, y: y+1});
            }
            break;
        case 'sonar':
            cells.push(
                {x: x-1, y}, {x: x+1, y},
                {x, y: y-1}, {x, y: y+1}
            );
            break;
        case 'kraken':
            cells.push(
                {x: x-1, y}, {x: x+1, y},
                {x, y: y-1}, {x, y: y+1}
            );
            break;
    }
    
    return cells.filter(c => c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE);
}

function handleAttack(x, y) {
    const opponent = gameState.currentPlayer === 1 ? 2 : 1;
    const opponentGrid = gameState.players[opponent].grid;
    
    if (gameState.activePower) {
        executePowerAttack(x, y, opponent);
    } else {
        executeNormalAttack(x, y, opponent);
    }
}

function executeNormalAttack(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const cell = opponentGrid[y][x];
    
    if (cell && (cell.hit || cell === 'miss' || cell.revealed)) {
        return;
    }
    
    let result = { hit: false, sunk: null, message: '' };
    
    if (cell && cell.shipId) {
        cell.hit = true;
        result.hit = true;
        
        const ship = gameState.players[opponent].ships.find(s => s.id === cell.shipId);
        ship.hits++;
        
        if (ship.hits >= ship.size) {
            result.sunk = ship;
            markShipAsSunk(opponent, ship);
            gameState.players[opponent].powers.push({
                type: ship.power,
                name: ship.powerName
            });
        }
    } else {
        opponentGrid[y][x] = 'miss';
    }
    
    showAttackResult(result);
}

function executePowerAttack(x, y, opponent) {
    const power = gameState.activePower;
    const opponentGrid = gameState.players[opponent].grid;
    
    const powerIndex = gameState.players[gameState.currentPlayer].powers.findIndex(p => p.type === power);
    if (powerIndex === -1) return;
    
    gameState.players[gameState.currentPlayer].powers.splice(powerIndex, 1);
    
    let result = { hit: false, sunk: null, message: '', powerUsed: power };
    
    switch(power) {
        case 'instakill':
            result = executeInstakill(x, y, opponent);
            break;
        case 'triple':
            result = executeTriple(x, y, opponent);
            break;
        case 'sonar':
            result = executeSonar(x, y, opponent);
            break;
        case 'kraken':
            result = executeKraken(x, y, opponent);
            break;
    }
    
    gameState.activePower = null;
    showAttackResult(result);
}

function executeInstakill(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const cell = opponentGrid[y][x];
    
    if (cell && cell.shipId && !cell.hit) {
        const ship = gameState.players[opponent].ships.find(s => s.id === cell.shipId);
        
        ship.cells.forEach(({x: cx, y: cy}) => {
            opponentGrid[cy][cx].hit = true;
        });
        ship.hits = ship.size;
        markShipAsSunk(opponent, ship);
        
        gameState.players[opponent].powers.push({
            type: ship.power,
            name: ship.powerName
        });
        
        return { hit: true, sunk: ship, message: `Coup Fatal! Le ${ship.name} est détruit!`, powerUsed: 'instakill' };
    } else if (cell === 'miss' || (cell && cell.hit)) {
        return { hit: false, sunk: null, message: 'Case déjà jouée!', powerUsed: 'instakill', wasted: true };
    } else {
        opponentGrid[y][x] = 'miss';
        return { hit: false, sunk: null, message: 'Coup Fatal raté... à l\'eau!', powerUsed: 'instakill' };
    }
}

function executeTriple(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const cells = getPowerTargetCells(x, y, 'triple');
    
    let hits = 0;
    let sunks = [];
    
    cells.forEach(({x: cx, y: cy}) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            cell.hit = true;
            hits++;
            
            const ship = gameState.players[opponent].ships.find(s => s.id === cell.shipId);
            ship.hits++;
            
            if (ship.hits >= ship.size && !sunks.find(s => s.id === ship.id)) {
                sunks.push(ship);
                markShipAsSunk(opponent, ship);
                gameState.players[opponent].powers.push({
                    type: ship.power,
                    name: ship.powerName
                });
            }
        } else if (!cell || (!cell.shipId && cell !== 'miss')) {
            opponentGrid[cy][cx] = 'miss';
        }
    });
    
    return { 
        hit: hits > 0, 
        sunk: sunks.length > 0 ? sunks[0] : null,
        allSunks: sunks,
        message: `Tir Triple: ${hits} touché(s)!`, 
        powerUsed: 'triple' 
    };
}

function executeSonar(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const cells = getPowerTargetCells(x, y, 'sonar');
    
    let shipsDetected = 0;
    
    cells.forEach(({x: cx, y: cy}) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            shipsDetected++;
            opponentGrid[cy][cx].revealed = true;
        }
    });
    
    return { 
        hit: false, 
        sunk: null, 
        message: shipsDetected > 0 ? `Sonar: ${shipsDetected} case(s) de navire détectée(s)!` : 'Sonar: Aucun navire détecté dans cette zone.', 
        powerUsed: 'sonar',
        sonarResult: shipsDetected
    };
}

function executeKraken(x, y, opponent) {
    const opponentGrid = gameState.players[opponent].grid;
    const cells = getPowerTargetCells(x, y, 'kraken');
    
    let hits = 0;
    let sunks = [];
    
    cells.forEach(({x: cx, y: cy}) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            cell.hit = true;
            hits++;
            
            const ship = gameState.players[opponent].ships.find(s => s.id === cell.shipId);
            ship.hits++;
            
            if (ship.hits >= ship.size && !sunks.find(s => s.id === ship.id)) {
                sunks.push(ship);
                markShipAsSunk(opponent, ship);
                gameState.players[opponent].powers.push({
                    type: ship.power,
                    name: ship.powerName
                });
            }
        } else if (!cell || (!cell.shipId && cell !== 'miss')) {
            opponentGrid[cy][cx] = 'miss';
        }
    });
    
    return { 
        hit: hits > 0, 
        sunk: sunks.length > 0 ? sunks[0] : null,
        allSunks: sunks,
        message: `Kraken! ${hits} touché(s)!`, 
        powerUsed: 'kraken' 
    };
}

function markShipAsSunk(player, ship) {
    const grid = gameState.players[player].grid;
    ship.cells.forEach(({x, y}) => {
        grid[y][x].sunk = true;
    });
}

function showAttackResult(result) {
    const resultIcon = document.getElementById('result-icon');
    const resultTitle = document.getElementById('result-title');
    const resultMessage = document.getElementById('result-message');
    const powerGained = document.getElementById('power-gained');
    const powerGainedName = document.getElementById('power-gained-name');
    const powerDescription = document.getElementById('power-description');
    
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

function handleContinue() {
    const opponent = gameState.currentPlayer === 1 ? 2 : 1;
    
    if (checkVictory(opponent)) {
        showVictory(gameState.currentPlayer);
        return;
    }
    
    gameState.currentPlayer = opponent;
    showTransition(`Passez le téléphone au Capitaine ${opponent}`, startBattle);
}

function checkVictory(player) {
    const ships = gameState.players[player].ships;
    return ships.every(ship => ship.hits >= ship.size);
}

function showVictory(winner) {
    document.getElementById('winner').textContent = winner;
    showScreen('victory-screen');
}

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initGame();
});
