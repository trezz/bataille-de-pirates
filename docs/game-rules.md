# Bataille de Pirates - Game Rules Specification

A pirate-themed naval battle game for 2 players with special powers.

## Overview

Two captains take turns placing ships on a 10×10 grid, then attack each other until one fleet is completely destroyed. The twist: when you sink an enemy ship, **your opponent gains a special power** from that ship.

## Game Phases

### 1. Placement Phase
- Player 1 places all ships, then Player 2
- Ships cannot overlap or extend outside the grid
- Ships can be rotated (horizontal/vertical)

### 2. Battle Phase
- Players alternate taking shots at the opponent's grid
- A hit reveals that cell; a miss is also marked
- When all cells of a ship are hit, it sinks
- Game ends when all ships of one player are sunk

## Fleet Composition

| Ship      | Size | Power Granted on Sink |
|-----------|------|----------------------|
| Galion    | 5    | Kraken 🐙            |
| Frégate   | 4    | Sonar 📡             |
| Brick     | 3    | Triple Shot 🎯       |
| Corvette  | 3    | Triple Shot 🎯       |
| Chaloupe  | 2    | Instakill 💀         |

**Total: 5 ships, 17 cells**

## Powers

When you sink an enemy ship, **the opponent** (the ship's owner) gains the corresponding power. Powers are single-use.

### Kraken 🐙 (from Galion)
Attacks in a cross pattern: the target cell plus 4 adjacent cells (up, down, left, right).

```
    [X]
[X] [●] [X]
    [X]
```

### Sonar 📡 (from Frégate)
Reveals a large cross-shaped area (5 cells in each direction + diagonal corners). Does not damage ships—only reveals their positions. Empty cells are marked as misses.

```
          [X]
          [X]
          [X]
          [X]
          [X]
[X][X][X][X][X][●][X][X][X][X][X]
          [X]
          [X]
          [X]
          [X]
          [X]
       + corners
```

### Triple Shot 🎯 (from Brick or Corvette)
Fires 3 aligned shots (horizontal or vertical). Player chooses direction before firing.

Horizontal: `[X][●][X]`

Vertical:
```
[X]
[●]
[X]
```

### Instakill 💀 (from Chaloupe)
If the target cell contains a ship, the **entire ship is immediately sunk** regardless of size. If it misses, the power is wasted.

## Victory Condition

The first player to sink all 5 enemy ships wins.

## Special Rules

1. **Power transfer**: Sinking a ship gives the power to your opponent, not you—creating a comeback mechanic.
2. **Power stacking**: Multiple powers of the same type can be accumulated (e.g., two Triple Shots from Brick + Corvette).
3. **Already-hit cells**: Normal attacks on already-hit cells are ignored. Instakill on an already-hit cell wastes the power.
4. **Sonar marks**: Revealed ship cells are shown but not damaged. Empty revealed cells become misses.
