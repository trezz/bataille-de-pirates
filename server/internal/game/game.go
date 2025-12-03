package game

import (
	"errors"
	"fmt"
	"sync"

	piratesv1 "github.com/trezz/bataille-de-pirates/server/gen/proto/pirates/v1"
)

const GridSize = 10

var (
	ErrInvalidPlayer     = errors.New("invalid player")
	ErrNotYourTurn       = errors.New("not your turn")
	ErrGameNotInProgress = errors.New("game not in progress")
	ErrInvalidTarget     = errors.New("invalid target coordinates")
	ErrAlreadyHit        = errors.New("cell already hit")
	ErrPowerNotAvailable = errors.New("power not available")
	ErrInvalidPlacement  = errors.New("invalid ship placement")
	ErrShipsAlreadyPlaced = errors.New("ships already placed")
)

type ShipDefinition struct {
	Name string
	Size int
}

var RequiredShips = []ShipDefinition{
	{Name: "Galion", Size: 5},
	{Name: "Frégate", Size: 4},
	{Name: "Brick", Size: 3},
	{Name: "Corvette", Size: 3},
	{Name: "Chaloupe", Size: 2},
}

type GameStatus int

const (
	StatusWaitingForShips GameStatus = iota
	StatusPlayer1Turn
	StatusPlayer2Turn
	StatusFinished
)

type Coordinate struct {
	X, Y int
}

type Cell struct {
	ShipID   string
	Hit      bool
	Revealed bool
	Sunk     bool
}

type Grid [GridSize][GridSize]*Cell

type GameShip struct {
	ID    string
	Name  string
	Size  int
	Cells []Coordinate
	Hits  int
}

func (s *GameShip) IsSunk() bool {
	return s.Hits >= s.Size
}

func (s *GameShip) ToProto() *piratesv1.Ship {
	var start *piratesv1.Coordinate
	horizontal := true
	if len(s.Cells) > 0 {
		start = &piratesv1.Coordinate{X: int32(s.Cells[0].X), Y: int32(s.Cells[0].Y)}
		if len(s.Cells) > 1 {
			horizontal = s.Cells[1].X != s.Cells[0].X
		}
	}
	return &piratesv1.Ship{
		Id:         s.ID,
		Name:       s.Name,
		Size:       int32(s.Size),
		Start:      start,
		Horizontal: horizontal,
	}
}

type PlayerState struct {
	Grid       Grid
	Ships      map[string]*GameShip
	Powers     map[piratesv1.PowerType]bool
	ShipsReady bool
}

func NewPlayerState() *PlayerState {
	ps := &PlayerState{
		Ships:  make(map[string]*GameShip),
		Powers: make(map[piratesv1.PowerType]bool),
	}
	for i := 0; i < GridSize; i++ {
		for j := 0; j < GridSize; j++ {
			ps.Grid[i][j] = &Cell{}
		}
	}
	return ps
}

func (ps *PlayerState) AllShipsSunk() bool {
	for _, ship := range ps.Ships {
		if !ship.IsSunk() {
			return false
		}
	}
	return len(ps.Ships) > 0
}

func (ps *PlayerState) AvailablePowers() []*piratesv1.Power {
	var powers []*piratesv1.Power
	for pt, available := range ps.Powers {
		if available {
			powers = append(powers, &piratesv1.Power{
				Type: pt,
				Name: powerName(pt),
			})
		}
	}
	return powers
}

func powerName(pt piratesv1.PowerType) string {
	switch pt {
	case piratesv1.PowerType_POWER_TYPE_INSTAKILL:
		return "Instakill"
	case piratesv1.PowerType_POWER_TYPE_TRIPLE:
		return "Triple"
	case piratesv1.PowerType_POWER_TYPE_SONAR:
		return "Sonar"
	case piratesv1.PowerType_POWER_TYPE_KRAKEN:
		return "Kraken"
	default:
		return ""
	}
}

func shipSizeToPower(size int) piratesv1.PowerType {
	switch size {
	case 2:
		return piratesv1.PowerType_POWER_TYPE_INSTAKILL
	case 3:
		return piratesv1.PowerType_POWER_TYPE_TRIPLE
	case 4:
		return piratesv1.PowerType_POWER_TYPE_SONAR
	case 5:
		return piratesv1.PowerType_POWER_TYPE_KRAKEN
	default:
		return piratesv1.PowerType_POWER_TYPE_UNSPECIFIED
	}
}

type Game struct {
	mu sync.RWMutex

	ID           string
	Player1ID    string
	Player2ID    string
	Player1State *PlayerState
	Player2State *PlayerState
	CurrentTurn  string
	Status       GameStatus
	Winner       string
}

func NewGame(id, player1ID, player2ID string) *Game {
	return &Game{
		ID:           id,
		Player1ID:    player1ID,
		Player2ID:    player2ID,
		Player1State: NewPlayerState(),
		Player2State: NewPlayerState(),
		Status:       StatusWaitingForShips,
	}
}

func (g *Game) getPlayerState(playerID string) (*PlayerState, error) {
	switch playerID {
	case g.Player1ID:
		return g.Player1State, nil
	case g.Player2ID:
		return g.Player2State, nil
	default:
		return nil, ErrInvalidPlayer
	}
}

func (g *Game) GetOpponentID(playerID string) string {
	if playerID == g.Player1ID {
		return g.Player2ID
	}
	return g.Player1ID
}

func (g *Game) getOpponentState(playerID string) (*PlayerState, error) {
	switch playerID {
	case g.Player1ID:
		return g.Player2State, nil
	case g.Player2ID:
		return g.Player1State, nil
	default:
		return nil, ErrInvalidPlayer
	}
}

func (g *Game) IsPlayerTurn(playerID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.CurrentTurn == playerID
}

func (g *Game) NextTurn() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.CurrentTurn == g.Player1ID {
		g.CurrentTurn = g.Player2ID
		g.Status = StatusPlayer2Turn
	} else {
		g.CurrentTurn = g.Player1ID
		g.Status = StatusPlayer1Turn
	}
}

func (g *Game) PlaceShips(playerID string, ships []*piratesv1.Ship) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Status != StatusWaitingForShips {
		return ErrGameNotInProgress
	}

	ps, err := g.getPlayerState(playerID)
	if err != nil {
		return err
	}

	if ps.ShipsReady {
		return ErrShipsAlreadyPlaced
	}

	if err := g.validateShipPlacement(ships); err != nil {
		return err
	}

	for _, ship := range ships {
		gameShip := &GameShip{
			ID:   ship.Id,
			Name: ship.Name,
			Size: int(ship.Size),
		}

		x, y := int(ship.Start.X), int(ship.Start.Y)
		for i := 0; i < int(ship.Size); i++ {
			var cx, cy int
			if ship.Horizontal {
				cx, cy = x+i, y
			} else {
				cx, cy = x, y+i
			}
			gameShip.Cells = append(gameShip.Cells, Coordinate{X: cx, Y: cy})
			ps.Grid[cx][cy].ShipID = ship.Id
		}
		ps.Ships[ship.Id] = gameShip
	}

	ps.ShipsReady = true
	return nil
}

func (g *Game) validateShipPlacement(ships []*piratesv1.Ship) error {
	if len(ships) != len(RequiredShips) {
		return fmt.Errorf("%w: expected %d ships, got %d", ErrInvalidPlacement, len(RequiredShips), len(ships))
	}

	requiredCounts := make(map[int]int)
	for _, def := range RequiredShips {
		requiredCounts[def.Size]++
	}
	providedCounts := make(map[int]int)
	for _, ship := range ships {
		providedCounts[int(ship.Size)]++
	}
	for size, count := range requiredCounts {
		if providedCounts[size] != count {
			return fmt.Errorf("%w: wrong number of size-%d ships", ErrInvalidPlacement, size)
		}
	}

	occupied := make(map[Coordinate]bool)
	for _, ship := range ships {
		if ship.Start == nil {
			return fmt.Errorf("%w: ship %s has no start coordinate", ErrInvalidPlacement, ship.Id)
		}

		x, y := int(ship.Start.X), int(ship.Start.Y)
		for i := 0; i < int(ship.Size); i++ {
			var cx, cy int
			if ship.Horizontal {
				cx, cy = x+i, y
			} else {
				cx, cy = x, y+i
			}

			if cx < 0 || cx >= GridSize || cy < 0 || cy >= GridSize {
				return fmt.Errorf("%w: ship %s extends out of bounds", ErrInvalidPlacement, ship.Id)
			}

			coord := Coordinate{X: cx, Y: cy}
			if occupied[coord] {
				return fmt.Errorf("%w: ships overlap at (%d, %d)", ErrInvalidPlacement, cx, cy)
			}
			occupied[coord] = true
		}
	}

	return nil
}

func (g *Game) BothPlayersReady() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.Player1State.ShipsReady && g.Player2State.ShipsReady
}

func (g *Game) StartGame() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.CurrentTurn = g.Player1ID
	g.Status = StatusPlayer1Turn
}

func (g *Game) Attack(playerID string, x, y int) (*piratesv1.AttackResult, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Status != StatusPlayer1Turn && g.Status != StatusPlayer2Turn {
		return nil, ErrGameNotInProgress
	}

	if g.CurrentTurn != playerID {
		return nil, ErrNotYourTurn
	}

	if x < 0 || x >= GridSize || y < 0 || y >= GridSize {
		return nil, ErrInvalidTarget
	}

	opponentState, err := g.getOpponentState(playerID)
	if err != nil {
		return nil, err
	}

	cell := opponentState.Grid[x][y]
	if cell.Hit {
		return nil, ErrAlreadyHit
	}

	cell.Hit = true

	result := &piratesv1.AttackResult{
		Target: &piratesv1.Coordinate{X: int32(x), Y: int32(y)},
		Hit:    cell.ShipID != "",
	}

	if cell.ShipID != "" {
		ship := opponentState.Ships[cell.ShipID]
		ship.Hits++

		if ship.IsSunk() {
			for _, coord := range ship.Cells {
				opponentState.Grid[coord.X][coord.Y].Sunk = true
			}
			result.SunkShip = ship.ToProto()

			// Power goes to the DEFENDER (opponent) as compensation
			power := shipSizeToPower(ship.Size)
			if power != piratesv1.PowerType_POWER_TYPE_UNSPECIFIED {
				opponentState.Powers[power] = true
				result.PowerGained = &piratesv1.Power{
					Type: power,
					Name: powerName(power),
				}
			}
		}
	}

	return result, nil
}

func (g *Game) UsePower(playerID string, power piratesv1.PowerType, x, y int, horizontal bool) (*piratesv1.PowerResult, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Status != StatusPlayer1Turn && g.Status != StatusPlayer2Turn {
		return nil, ErrGameNotInProgress
	}

	if g.CurrentTurn != playerID {
		return nil, ErrNotYourTurn
	}

	playerState, err := g.getPlayerState(playerID)
	if err != nil {
		return nil, err
	}

	if !playerState.Powers[power] {
		return nil, ErrPowerNotAvailable
	}

	opponentState, _ := g.getOpponentState(playerID)

	var result *piratesv1.PowerResult
	switch power {
	case piratesv1.PowerType_POWER_TYPE_INSTAKILL:
		result, err = g.useInstakill(opponentState, playerState, x, y)
	case piratesv1.PowerType_POWER_TYPE_TRIPLE:
		result, err = g.useTriple(opponentState, playerState, x, y, horizontal)
	case piratesv1.PowerType_POWER_TYPE_SONAR:
		result, err = g.useSonar(opponentState, x, y)
	case piratesv1.PowerType_POWER_TYPE_KRAKEN:
		result, err = g.useKraken(opponentState, playerState, x, y)
	default:
		return nil, ErrPowerNotAvailable
	}

	if err != nil {
		return nil, err
	}

	playerState.Powers[power] = false
	result.PowerUsed = power

	return result, nil
}

func (g *Game) useInstakill(opponentState, _ *PlayerState, x, y int) (*piratesv1.PowerResult, error) {
	if x < 0 || x >= GridSize || y < 0 || y >= GridSize {
		return nil, ErrInvalidTarget
	}

	cell := opponentState.Grid[x][y]
	result := &piratesv1.PowerResult{}

	cell.Hit = true
	state := piratesv1.CellState_CELL_STATE_MISS
	if cell.ShipID != "" {
		ship := opponentState.Ships[cell.ShipID]
		for _, coord := range ship.Cells {
			opponentState.Grid[coord.X][coord.Y].Hit = true
			opponentState.Grid[coord.X][coord.Y].Sunk = true
			result.CellsAffected = append(result.CellsAffected, &piratesv1.CellReveal{
				Position: &piratesv1.Coordinate{X: int32(coord.X), Y: int32(coord.Y)},
				State:    piratesv1.CellState_CELL_STATE_SUNK,
			})
		}
		ship.Hits = ship.Size
		result.SunkShips = append(result.SunkShips, ship.ToProto())

		// Power goes to defender (opponentState) as compensation
		power := shipSizeToPower(ship.Size)
		if power != piratesv1.PowerType_POWER_TYPE_UNSPECIFIED {
			opponentState.Powers[power] = true
		}
	} else {
		result.CellsAffected = append(result.CellsAffected, &piratesv1.CellReveal{
			Position: &piratesv1.Coordinate{X: int32(x), Y: int32(y)},
			State:    state,
		})
	}

	return result, nil
}

func (g *Game) useTriple(opponentState, _ *PlayerState, x, y int, horizontal bool) (*piratesv1.PowerResult, error) {
	result := &piratesv1.PowerResult{}

	targets := []Coordinate{{X: x, Y: y}}
	if horizontal {
		if x > 0 {
			targets = append([]Coordinate{{X: x - 1, Y: y}}, targets...)
		}
		if x < GridSize-1 {
			targets = append(targets, Coordinate{X: x + 1, Y: y})
		}
	} else {
		if y > 0 {
			targets = append([]Coordinate{{X: x, Y: y - 1}}, targets...)
		}
		if y < GridSize-1 {
			targets = append(targets, Coordinate{X: x, Y: y + 1})
		}
	}

	for _, t := range targets {
		if t.X < 0 || t.X >= GridSize || t.Y < 0 || t.Y >= GridSize {
			continue
		}

		cell := opponentState.Grid[t.X][t.Y]
		if cell.Hit {
			continue
		}

		cell.Hit = true
		state := piratesv1.CellState_CELL_STATE_MISS
		if cell.ShipID != "" {
			ship := opponentState.Ships[cell.ShipID]
			ship.Hits++
			state = piratesv1.CellState_CELL_STATE_HIT

			if ship.IsSunk() {
				for _, coord := range ship.Cells {
					opponentState.Grid[coord.X][coord.Y].Sunk = true
				}
				state = piratesv1.CellState_CELL_STATE_SUNK
				result.SunkShips = append(result.SunkShips, ship.ToProto())

				// Power goes to defender as compensation
				power := shipSizeToPower(ship.Size)
				if power != piratesv1.PowerType_POWER_TYPE_UNSPECIFIED {
					opponentState.Powers[power] = true
				}
			}
		}

		result.CellsAffected = append(result.CellsAffected, &piratesv1.CellReveal{
			Position: &piratesv1.Coordinate{X: int32(t.X), Y: int32(t.Y)},
			State:    state,
		})
	}

	return result, nil
}

func (g *Game) useSonar(opponentState *PlayerState, x, y int) (*piratesv1.PowerResult, error) {
	if x < 0 || x >= GridSize || y < 0 || y >= GridSize {
		return nil, ErrInvalidTarget
	}

	result := &piratesv1.PowerResult{}

	reveal := func(cx, cy int) {
		if cx < 0 || cx >= GridSize || cy < 0 || cy >= GridSize {
			return
		}
		cell := opponentState.Grid[cx][cy]
		cell.Revealed = true

		var state piratesv1.CellState
		if cell.Sunk {
			state = piratesv1.CellState_CELL_STATE_SUNK
		} else if cell.Hit && cell.ShipID != "" {
			state = piratesv1.CellState_CELL_STATE_HIT
		} else if cell.Hit {
			state = piratesv1.CellState_CELL_STATE_MISS
		} else if cell.ShipID != "" {
			state = piratesv1.CellState_CELL_STATE_REVEALED
		} else {
			state = piratesv1.CellState_CELL_STATE_EMPTY
		}

		result.CellsAffected = append(result.CellsAffected, &piratesv1.CellReveal{
			Position: &piratesv1.Coordinate{X: int32(cx), Y: int32(cy)},
			State:    state,
		})
	}

	for i := -5; i <= 5; i++ {
		reveal(x+i, y)
		if i != 0 {
			reveal(x, y+i)
		}
	}

	reveal(x-1, y-1)
	reveal(x+1, y-1)
	reveal(x-1, y+1)
	reveal(x+1, y+1)

	return result, nil
}

func (g *Game) useKraken(opponentState, _ *PlayerState, x, y int) (*piratesv1.PowerResult, error) {
	if x < 0 || x >= GridSize || y < 0 || y >= GridSize {
		return nil, ErrInvalidTarget
	}

	result := &piratesv1.PowerResult{}

	attack := func(cx, cy int) {
		if cx < 0 || cx >= GridSize || cy < 0 || cy >= GridSize {
			return
		}
		cell := opponentState.Grid[cx][cy]
		if cell.Hit {
			return
		}

		cell.Hit = true
		state := piratesv1.CellState_CELL_STATE_MISS
		if cell.ShipID != "" {
			ship := opponentState.Ships[cell.ShipID]
			ship.Hits++
			state = piratesv1.CellState_CELL_STATE_HIT

			if ship.IsSunk() {
				for _, coord := range ship.Cells {
					opponentState.Grid[coord.X][coord.Y].Sunk = true
				}
				state = piratesv1.CellState_CELL_STATE_SUNK
				result.SunkShips = append(result.SunkShips, ship.ToProto())

				// Power goes to defender as compensation
				power := shipSizeToPower(ship.Size)
				if power != piratesv1.PowerType_POWER_TYPE_UNSPECIFIED {
					opponentState.Powers[power] = true
				}
			}
		}

		result.CellsAffected = append(result.CellsAffected, &piratesv1.CellReveal{
			Position: &piratesv1.Coordinate{X: int32(cx), Y: int32(cy)},
			State:    state,
		})
	}

	attack(x, y)
	for i := 1; i <= 2; i++ {
		attack(x-i, y)
		attack(x+i, y)
		attack(x, y-i)
		attack(x, y+i)
	}

	return result, nil
}

func (g *Game) Forfeit(playerID string) *piratesv1.GameOver {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.Status = StatusFinished
	g.Winner = g.GetOpponentID(playerID)

	return &piratesv1.GameOver{
		YouWon: false,
		Reason: "opponent_forfeit",
	}
}

func (g *Game) CheckVictory() *piratesv1.GameOver {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.Player1State.AllShipsSunk() {
		g.Winner = g.Player2ID
		g.Status = StatusFinished
		return &piratesv1.GameOver{
			YouWon: true, // From perspective of player2
			Reason: "all_ships_sunk",
		}
	}
	if g.Player2State.AllShipsSunk() {
		g.Winner = g.Player1ID
		g.Status = StatusFinished
		return &piratesv1.GameOver{
			YouWon: true, // From perspective of player1
			Reason: "all_ships_sunk",
		}
	}
	return nil
}

func (g *Game) SetWinner(playerID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.Winner = playerID
	g.Status = StatusFinished
}

func (g *Game) GetWinner() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.Winner
}

func (g *Game) GetStatus() GameStatus {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.Status
}

func (g *Game) GetCurrentTurn() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.CurrentTurn
}

func (g *Game) GetPlayerState(playerID string) (*PlayerState, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.getPlayerState(playerID)
}

func (g *Game) GetPlayerPowers(playerID string) []*piratesv1.Power {
	g.mu.RLock()
	defer g.mu.RUnlock()
	ps, err := g.getPlayerState(playerID)
	if err != nil {
		return nil
	}
	return ps.AvailablePowers()
}
