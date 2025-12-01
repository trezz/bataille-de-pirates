const {
    GRID_SIZE,
    SHIPS,
    createEmptyGrid,
    createInitialGameState,
    getShipCells,
    canPlaceShip,
    placeShipOnGrid,
    isShipAlreadyPlaced,
    isPlacementComplete,
    getOpponent,
    getPowerTargetCells,
    executeNormalAttack,
    executeInstakill,
    executeTriple,
    executeSonar,
    executeKraken,
    removePower,
    checkVictory
} = require('./gameLogic');

describe('createEmptyGrid', () => {
    test('crée une grille 10x10 vide', () => {
        const grid = createEmptyGrid();
        expect(grid.length).toBe(10);
        expect(grid[0].length).toBe(10);
        expect(grid.every(row => row.every(cell => cell === null))).toBe(true);
    });
});

describe('createInitialGameState', () => {
    test('crée un état initial valide', () => {
        const state = createInitialGameState();
        expect(state.currentPlayer).toBe(1);
        expect(state.phase).toBe('welcome');
        expect(state.players[1].ships).toEqual([]);
        expect(state.players[2].ships).toEqual([]);
    });
});

describe('getShipCells', () => {
    test('retourne les bonnes cellules horizontales', () => {
        const cells = getShipCells(2, 3, 4, true);
        expect(cells).toEqual([
            { x: 2, y: 3 },
            { x: 3, y: 3 },
            { x: 4, y: 3 },
            { x: 5, y: 3 }
        ]);
    });

    test('retourne les bonnes cellules verticales', () => {
        const cells = getShipCells(2, 3, 3, false);
        expect(cells).toEqual([
            { x: 2, y: 3 },
            { x: 2, y: 4 },
            { x: 2, y: 5 }
        ]);
    });
});

describe('canPlaceShip', () => {
    test('autorise le placement sur grille vide', () => {
        const grid = createEmptyGrid();
        expect(canPlaceShip(grid, 0, 0, 5, true)).toBe(true);
    });

    test('refuse le placement hors limites horizontal', () => {
        const grid = createEmptyGrid();
        expect(canPlaceShip(grid, 8, 0, 5, true)).toBe(false);
    });

    test('refuse le placement hors limites vertical', () => {
        const grid = createEmptyGrid();
        expect(canPlaceShip(grid, 0, 8, 5, false)).toBe(false);
    });

    test('refuse le placement sur une case occupée', () => {
        const grid = createEmptyGrid();
        grid[0][2] = { shipId: 1, hit: false };
        expect(canPlaceShip(grid, 0, 0, 5, true)).toBe(false);
    });
});

describe('placeShipOnGrid', () => {
    test('place un bateau correctement', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const template = SHIPS[0];

        const ship = placeShipOnGrid(grid, ships, template, 0, 0, true);

        expect(ship).not.toBeNull();
        expect(ship.name).toBe('Galion');
        expect(ships.length).toBe(1);
        expect(grid[0][0]).not.toBeNull();
        expect(grid[0][4]).not.toBeNull();
    });

    test('retourne null si placement invalide', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const template = SHIPS[0];

        const ship = placeShipOnGrid(grid, ships, template, 8, 0, true);
        expect(ship).toBeNull();
        expect(ships.length).toBe(0);
    });

    test('refuse de placer deux fois le même bateau', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const corvette = SHIPS.find(s => s.name === 'Corvette');

        const first = placeShipOnGrid(grid, ships, corvette, 0, 0, true);
        expect(first).not.toBeNull();
        expect(ships.length).toBe(1);

        const second = placeShipOnGrid(grid, ships, corvette, 0, 2, true);
        expect(second).toBeNull();
        expect(ships.length).toBe(1);
    });
});

describe('isShipAlreadyPlaced', () => {
    test('détecte un bateau déjà placé', () => {
        const ships = [{ name: 'Galion' }, { name: 'Brick' }];
        expect(isShipAlreadyPlaced(ships, 'Galion')).toBe(true);
        expect(isShipAlreadyPlaced(ships, 'Corvette')).toBe(false);
    });
});

describe('isPlacementComplete', () => {
    test('retourne false si pas tous les bateaux placés', () => {
        const ships = [{ name: 'Galion' }];
        expect(isPlacementComplete(ships)).toBe(false);
    });

    test('retourne true si tous les bateaux placés', () => {
        const ships = SHIPS.map(s => ({ ...s }));
        expect(isPlacementComplete(ships)).toBe(true);
    });
});

describe('getOpponent', () => {
    test('retourne le bon adversaire', () => {
        expect(getOpponent(1)).toBe(2);
        expect(getOpponent(2)).toBe(1);
    });
});

describe('getPowerTargetCells', () => {
    test('triple horizontal retourne 3 cellules', () => {
        const cells = getPowerTargetCells(5, 5, 'triple', 'horizontal');
        expect(cells.length).toBe(3);
        expect(cells).toContainEqual({ x: 4, y: 5 });
        expect(cells).toContainEqual({ x: 5, y: 5 });
        expect(cells).toContainEqual({ x: 6, y: 5 });
    });

    test('triple vertical retourne 3 cellules', () => {
        const cells = getPowerTargetCells(5, 5, 'triple', 'vertical');
        expect(cells.length).toBe(3);
        expect(cells).toContainEqual({ x: 5, y: 4 });
        expect(cells).toContainEqual({ x: 5, y: 5 });
        expect(cells).toContainEqual({ x: 5, y: 6 });
    });

    test('kraken retourne 5 cellules (croix)', () => {
        const cells = getPowerTargetCells(5, 5, 'kraken', null);
        expect(cells.length).toBe(5);
    });

    test('sonar retourne les cellules en croix + coins (filtré par grille)', () => {
        const cells = getPowerTargetCells(5, 5, 'sonar', null);
        expect(cells.length).toBe(23);
        expect(cells).toContainEqual({ x: 5, y: 5 });
        expect(cells).toContainEqual({ x: 0, y: 5 });
        expect(cells).toContainEqual({ x: 5, y: 0 });
        expect(cells).toContainEqual({ x: 4, y: 4 });
    });

    test('sonar au bord filtre les cellules hors grille', () => {
        const cells = getPowerTargetCells(0, 0, 'sonar', null);
        expect(cells.every(c => c.x >= 0 && c.y >= 0)).toBe(true);
    });
});

describe('executeNormalAttack', () => {
    test('touche un bateau', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[4], 0, 0, true);

        const result = executeNormalAttack(grid, ships, powers, 0, 0);

        expect(result.hit).toBe(true);
        expect(grid[0][0].hit).toBe(true);
    });

    test('manque un tir à l\'eau', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];

        const result = executeNormalAttack(grid, ships, powers, 5, 5);

        expect(result.hit).toBe(false);
        expect(grid[5][5]).toBe('miss');
    });

    test('coule un bateau et donne le pouvoir au défenseur', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[4], 0, 0, true);

        executeNormalAttack(grid, ships, powers, 0, 0);
        const result = executeNormalAttack(grid, ships, powers, 1, 0);

        expect(result.sunk).not.toBeNull();
        expect(result.sunk.name).toBe('Chaloupe');
        expect(powers.length).toBe(1);
        expect(powers[0].type).toBe('instakill');
    });

    test('ignore une case déjà touchée', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[4], 0, 0, true);

        executeNormalAttack(grid, ships, powers, 0, 0);
        const result = executeNormalAttack(grid, ships, powers, 0, 0);

        expect(result).toBeNull();
    });

    test('permet de tirer sur une case révélée par le sonar', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[0], 0, 0, true);
        
        grid[0][0].revealed = true;
        
        const result = executeNormalAttack(grid, ships, powers, 0, 0);
        
        expect(result).not.toBeNull();
        expect(result.hit).toBe(true);
    });
});

describe('executeInstakill', () => {
    test('coule un bateau instantanément', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[0], 0, 0, true);

        const result = executeInstakill(grid, ships, powers, 2, 0);

        expect(result.hit).toBe(true);
        expect(result.sunk).not.toBeNull();
        expect(result.sunk.name).toBe('Galion');
        expect(ships[0].hits).toBe(5);
    });

    test('rate si pas de bateau', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];

        const result = executeInstakill(grid, ships, powers, 5, 5);

        expect(result.hit).toBe(false);
        expect(grid[5][5]).toBe('miss');
    });
});

describe('executeTriple', () => {
    test('touche plusieurs cases', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[0], 0, 0, true);

        const result = executeTriple(grid, ships, powers, 1, 0, 'horizontal');

        expect(result.hit).toBe(true);
        expect(grid[0][0].hit).toBe(true);
        expect(grid[0][1].hit).toBe(true);
        expect(grid[0][2].hit).toBe(true);
    });
});

describe('executeSonar', () => {
    test('révèle les bateaux sans les toucher', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[0], 3, 5, true);

        const result = executeSonar(grid, 5, 5);

        expect(result.hit).toBe(false);
        expect(result.sonarResult).toBeGreaterThan(0);
        expect(grid[5][3].revealed).toBe(true);
        expect(grid[5][3].hit).toBeFalsy();
    });

    test('marque miss les cases vides', () => {
        const grid = createEmptyGrid();

        executeSonar(grid, 5, 5);

        expect(grid[5][4]).toBe('miss');
        expect(grid[5][6]).toBe('miss');
    });
});

describe('executeKraken', () => {
    test('tire en croix', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const powers = [];
        placeShipOnGrid(grid, ships, SHIPS[0], 4, 5, true);

        const result = executeKraken(grid, ships, powers, 5, 5);

        expect(result.hit).toBe(true);
        expect(grid[5][4].hit).toBe(true);
        expect(grid[5][5].hit).toBe(true);
        expect(grid[5][6].hit).toBe(true);
    });
});

describe('removePower', () => {
    test('retire un pouvoir existant', () => {
        const powers = [
            { type: 'kraken', name: 'Kraken' },
            { type: 'sonar', name: 'Sonar' }
        ];

        const result = removePower(powers, 'kraken');

        expect(result).toBe(true);
        expect(powers.length).toBe(1);
        expect(powers[0].type).toBe('sonar');
    });

    test('retourne false si pouvoir inexistant', () => {
        const powers = [{ type: 'sonar', name: 'Sonar' }];

        const result = removePower(powers, 'kraken');

        expect(result).toBe(false);
        expect(powers.length).toBe(1);
    });
});

describe('checkVictory', () => {
    test('retourne true si tous les bateaux coulés', () => {
        const ships = [
            { size: 2, hits: 2 },
            { size: 3, hits: 3 }
        ];
        expect(checkVictory(ships)).toBe(true);
    });

    test('retourne false si des bateaux restent', () => {
        const ships = [
            { size: 2, hits: 2 },
            { size: 3, hits: 1 }
        ];
        expect(checkVictory(ships)).toBe(false);
    });
});

describe('règle: pouvoir au défenseur', () => {
    test('le défenseur reçoit le pouvoir quand son bateau est coulé', () => {
        const grid = createEmptyGrid();
        const ships = [];
        const defenderPowers = [];

        placeShipOnGrid(grid, ships, SHIPS[4], 0, 0, true);

        executeNormalAttack(grid, ships, defenderPowers, 0, 0);
        executeNormalAttack(grid, ships, defenderPowers, 1, 0);

        expect(defenderPowers.length).toBe(1);
        expect(defenderPowers[0].type).toBe('instakill');
    });
});

describe('règle: pas de double placement de bateau', () => {
    test('ne peut pas placer deux fois le même bateau', () => {
        const ships = [{ name: 'Corvette', size: 3 }];

        expect(isShipAlreadyPlaced(ships, 'Corvette')).toBe(true);
        expect(isShipAlreadyPlaced(ships, 'Brick')).toBe(false);
    });
});
