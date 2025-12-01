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

function createEmptyGrid() {
    return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
}

function createInitialGameState() {
    return {
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

function canPlaceShip(grid, startX, startY, size, horizontal) {
    const cells = getShipCells(startX, startY, size, horizontal);
    return cells.every(({ x, y }) =>
        x >= 0 && x < GRID_SIZE &&
        y >= 0 && y < GRID_SIZE &&
        !grid[y][x]
    );
}

function placeShipOnGrid(grid, ships, shipTemplate, startX, startY, horizontal) {
    if (isShipAlreadyPlaced(ships, shipTemplate.name)) {
        return null;
    }
    if (!canPlaceShip(grid, startX, startY, shipTemplate.size, horizontal)) {
        return null;
    }

    const cells = getShipCells(startX, startY, shipTemplate.size, horizontal);
    const shipId = Date.now() + Math.random();

    cells.forEach(({ x, y }) => {
        grid[y][x] = { shipId, hit: false };
    });

    const newShip = {
        id: shipId,
        ...shipTemplate,
        cells: cells,
        hits: 0
    };

    ships.push(newShip);
    return newShip;
}

function isShipAlreadyPlaced(ships, shipName) {
    return ships.some(s => s.name === shipName);
}

function isPlacementComplete(ships) {
    return ships.length >= SHIPS.length;
}

function getOpponent(currentPlayer) {
    return currentPlayer === 1 ? 2 : 1;
}

function getPowerTargetCells(x, y, power, tripleDirection) {
    const cells = [{ x, y }];

    switch (power) {
        case 'triple':
            if (tripleDirection === 'horizontal') {
                cells.push({ x: x - 1, y }, { x: x + 1, y });
            } else {
                cells.push({ x, y: y - 1 }, { x, y: y + 1 });
            }
            break;
        case 'sonar':
            for (let i = 1; i <= 5; i++) {
                cells.push({ x: x - i, y }, { x: x + i, y }, { x, y: y - i }, { x, y: y + i });
            }
            cells.push({ x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 }, { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 });
            break;
        case 'kraken':
            cells.push(
                { x: x - 1, y }, { x: x + 1, y },
                { x, y: y - 1 }, { x, y: y + 1 }
            );
            break;
    }

    return cells.filter(c => c.x >= 0 && c.x < GRID_SIZE && c.y >= 0 && c.y < GRID_SIZE);
}

function markShipAsSunk(grid, ship) {
    ship.cells.forEach(({ x, y }) => {
        grid[y][x].sunk = true;
    });
}

function executeNormalAttack(opponentGrid, opponentShips, opponentPowers, x, y) {
    const cell = opponentGrid[y][x];

    if (cell && (cell.hit || cell === 'miss')) {
        return null;
    }

    const result = { hit: false, sunk: null };

    if (cell && cell.shipId) {
        cell.hit = true;
        result.hit = true;

        const ship = opponentShips.find(s => s.id === cell.shipId);
        ship.hits++;

        if (ship.hits >= ship.size) {
            result.sunk = ship;
            markShipAsSunk(opponentGrid, ship);
            opponentPowers.push({
                type: ship.power,
                name: ship.powerName
            });
        }
    } else {
        opponentGrid[y][x] = 'miss';
    }

    return result;
}

function executeInstakill(opponentGrid, opponentShips, opponentPowers, x, y) {
    const cell = opponentGrid[y][x];

    if (cell && cell.shipId && !cell.hit) {
        const ship = opponentShips.find(s => s.id === cell.shipId);

        ship.cells.forEach(({ x: cx, y: cy }) => {
            opponentGrid[cy][cx].hit = true;
        });
        ship.hits = ship.size;
        markShipAsSunk(opponentGrid, ship);

        opponentPowers.push({
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

function executeTriple(opponentGrid, opponentShips, opponentPowers, x, y, tripleDirection) {
    const cells = getPowerTargetCells(x, y, 'triple', tripleDirection);

    let hits = 0;
    const sunks = [];

    cells.forEach(({ x: cx, y: cy }) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            cell.hit = true;
            hits++;

            const ship = opponentShips.find(s => s.id === cell.shipId);
            ship.hits++;

            if (ship.hits >= ship.size && !sunks.find(s => s.id === ship.id)) {
                sunks.push(ship);
                markShipAsSunk(opponentGrid, ship);
                opponentPowers.push({
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

function executeSonar(opponentGrid, x, y) {
    const cells = getPowerTargetCells(x, y, 'sonar', null);

    let cellsRevealed = 0;
    const shipsDetected = new Set();

    cells.forEach(({ x: cx, y: cy }) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            cellsRevealed++;
            shipsDetected.add(cell.shipId);
            opponentGrid[cy][cx].revealed = true;
        } else if (!cell) {
            opponentGrid[cy][cx] = 'miss';
        }
    });

    const shipCount = shipsDetected.size;
    let message;
    if (shipCount > 0) {
        message = `Sonar: ${shipCount} navire(s) détecté(s) (${cellsRevealed} cases)!`;
    } else {
        message = 'Sonar: Aucun navire détecté dans cette zone.';
    }

    return {
        hit: false,
        sunk: null,
        message: message,
        powerUsed: 'sonar',
        sonarResult: shipCount,
        cellsRevealed: cellsRevealed
    };
}

function executeKraken(opponentGrid, opponentShips, opponentPowers, x, y) {
    const cells = getPowerTargetCells(x, y, 'kraken', null);

    let hits = 0;
    const sunks = [];

    cells.forEach(({ x: cx, y: cy }) => {
        const cell = opponentGrid[cy][cx];
        if (cell && cell.shipId && !cell.hit) {
            cell.hit = true;
            hits++;

            const ship = opponentShips.find(s => s.id === cell.shipId);
            ship.hits++;

            if (ship.hits >= ship.size && !sunks.find(s => s.id === ship.id)) {
                sunks.push(ship);
                markShipAsSunk(opponentGrid, ship);
                opponentPowers.push({
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

function removePower(powers, powerType) {
    const index = powers.findIndex(p => p.type === powerType);
    if (index !== -1) {
        powers.splice(index, 1);
        return true;
    }
    return false;
}

function checkVictory(ships) {
    return ships.every(ship => ship.hits >= ship.size);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
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
    };
}
