package game

import (
	"testing"

	piratesv1 "github.com/trezz/bataille-de-pirates/server/gen/pirates/v1"
)

func TestNewGame(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")

	if g.ID != "game-1" {
		t.Errorf("expected ID game-1, got %s", g.ID)
	}
	if g.Player1ID != "player-1" {
		t.Errorf("expected Player1ID player-1, got %s", g.Player1ID)
	}
	if g.Status != StatusWaitingForShips {
		t.Errorf("expected StatusWaitingForShips, got %d", g.Status)
	}
}

func createTestShips() []*piratesv1.Ship {
	return []*piratesv1.Ship{
		{Id: "ship-1", Name: "Galion", Size: 5, Start: &piratesv1.Coordinate{X: 0, Y: 0}, Horizontal: true},
		{Id: "ship-2", Name: "Frégate", Size: 4, Start: &piratesv1.Coordinate{X: 0, Y: 1}, Horizontal: true},
		{Id: "ship-3", Name: "Brick", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 2}, Horizontal: true},
		{Id: "ship-4", Name: "Corvette", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 3}, Horizontal: true},
		{Id: "ship-5", Name: "Chaloupe", Size: 2, Start: &piratesv1.Coordinate{X: 0, Y: 4}, Horizontal: true},
	}
}

func TestPlaceShips(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	err := g.PlaceShips("player-1", ships)
	if err != nil {
		t.Errorf("PlaceShips failed: %v", err)
	}

	if !g.Player1State.ShipsReady {
		t.Error("Player1 ships should be ready")
	}

	// Verify ships are on the grid
	if g.Player1State.Grid[0][0].ShipID != "ship-1" {
		t.Error("Galion should be at (0,0)")
	}
}

func TestPlaceShipsInvalidPlayer(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	err := g.PlaceShips("invalid-player", ships)
	if err != ErrInvalidPlayer {
		t.Errorf("expected ErrInvalidPlayer, got %v", err)
	}
}

func TestPlaceShipsOverlapping(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := []*piratesv1.Ship{
		{Id: "ship-1", Name: "Galion", Size: 5, Start: &piratesv1.Coordinate{X: 0, Y: 0}, Horizontal: true},
		{Id: "ship-2", Name: "Frégate", Size: 4, Start: &piratesv1.Coordinate{X: 2, Y: 0}, Horizontal: true}, // overlaps with Galion
		{Id: "ship-3", Name: "Brick", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 2}, Horizontal: true},
		{Id: "ship-4", Name: "Corvette", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 3}, Horizontal: true},
		{Id: "ship-5", Name: "Chaloupe", Size: 2, Start: &piratesv1.Coordinate{X: 0, Y: 4}, Horizontal: true},
	}

	err := g.PlaceShips("player-1", ships)
	if err == nil {
		t.Error("expected error for overlapping ships")
	}
}

func TestBothPlayersReady(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	g.PlaceShips("player-1", ships)
	if g.BothPlayersReady() {
		t.Error("should not be ready with only one player")
	}

	g.PlaceShips("player-2", ships)
	if !g.BothPlayersReady() {
		t.Error("should be ready with both players")
	}
}

func TestAttack(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	g.PlaceShips("player-1", ships)
	g.PlaceShips("player-2", ships)
	g.StartGame()

	// Player 1's turn, attack player 2's grid
	result, err := g.Attack("player-1", 0, 0)
	if err != nil {
		t.Errorf("Attack failed: %v", err)
	}
	if !result.Hit {
		t.Error("should be a hit")
	}
}

func TestAttackNotYourTurn(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	g.PlaceShips("player-1", ships)
	g.PlaceShips("player-2", ships)
	g.StartGame()

	// Player 2 tries to attack on player 1's turn
	_, err := g.Attack("player-2", 0, 0)
	if err != ErrNotYourTurn {
		t.Errorf("expected ErrNotYourTurn, got %v", err)
	}
}

func TestAttackSinkShip(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	g.PlaceShips("player-1", ships)
	g.PlaceShips("player-2", ships)
	g.StartGame()

	// Sink the Chaloupe (2 cells at y=4)
	result1, _ := g.Attack("player-1", 0, 4)
	if result1.SunkShip != nil {
		t.Error("should not be sunk after first hit")
	}

	g.NextTurn()
	g.Attack("player-2", 5, 5) // Player 2 attacks
	g.NextTurn()

	result2, _ := g.Attack("player-1", 1, 4)
	if result2.SunkShip == nil {
		t.Error("Chaloupe should be sunk")
	}
	if result2.SunkShip.Name != "Chaloupe" {
		t.Errorf("expected Chaloupe, got %s", result2.SunkShip.Name)
	}

	// Check defender (player-2) gained power
	powers := g.GetPlayerPowers("player-2")
	found := false
	for _, p := range powers {
		if p.Type == piratesv1.PowerType_POWER_TYPE_INSTAKILL {
			found = true
		}
	}
	if !found {
		t.Error("player-2 should have gained Instakill power")
	}
}

func TestCheckVictory(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")

	// Only place Chaloupe for faster test
	ships := []*piratesv1.Ship{
		{Id: "ship-1", Name: "Galion", Size: 5, Start: &piratesv1.Coordinate{X: 0, Y: 0}, Horizontal: true},
		{Id: "ship-2", Name: "Frégate", Size: 4, Start: &piratesv1.Coordinate{X: 0, Y: 1}, Horizontal: true},
		{Id: "ship-3", Name: "Brick", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 2}, Horizontal: true},
		{Id: "ship-4", Name: "Corvette", Size: 3, Start: &piratesv1.Coordinate{X: 0, Y: 3}, Horizontal: true},
		{Id: "ship-5", Name: "Chaloupe", Size: 2, Start: &piratesv1.Coordinate{X: 0, Y: 4}, Horizontal: true},
	}

	g.PlaceShips("player-1", ships)
	g.PlaceShips("player-2", ships)
	g.StartGame()

	// Manually sink all of player-2's ships
	for _, ship := range g.Player2State.Ships {
		ship.Hits = ship.Size
	}

	gameOver := g.CheckVictory()
	if gameOver == nil {
		t.Error("game should be over")
	}
	if !gameOver.YouWon {
		t.Error("player-1 should have won")
	}
}

func TestGetOpponentID(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")

	if g.GetOpponentID("player-1") != "player-2" {
		t.Error("opponent of player-1 should be player-2")
	}
	if g.GetOpponentID("player-2") != "player-1" {
		t.Error("opponent of player-2 should be player-1")
	}
}

func TestForfeit(t *testing.T) {
	g := NewGame("game-1", "player-1", "player-2")
	ships := createTestShips()

	g.PlaceShips("player-1", ships)
	g.PlaceShips("player-2", ships)
	g.StartGame()

	gameOver := g.Forfeit("player-1")
	if gameOver.Reason != "opponent_forfeit" {
		t.Errorf("expected opponent_forfeit, got %s", gameOver.Reason)
	}
	if g.Winner != "player-2" {
		t.Error("player-2 should be the winner")
	}
}
