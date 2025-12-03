package player

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"sync"

	"github.com/google/uuid"
	piratesv1 "github.com/trezz/bataille-de-pirates/server/gen/pirates/v1"
)

var pirateNamePrefixes = []string{
	"Capitaine",
	"Flibustier",
	"Marin",
	"Corsaire",
	"Boucanier",
	"Moussaillon",
	"Quartier-Maître",
	"Gabier",
	"Timonier",
	"Canonnier",
}

var pirateNameSuffixes = []string{
	"Barbe-Noire",
	"Rouge",
	"Borgne",
	"le Terrible",
	"des Caraïbes",
	"du Kraken",
	"Sans-Pitié",
	"le Chanceux",
	"aux Dents d'Or",
	"le Rusé",
	"le Balafré",
	"l'Intrépide",
	"du Grand Large",
	"le Vengeur",
	"le Mystérieux",
}

type Player struct {
	Proto         *piratesv1.Player
	SessionToken  string
	CurrentGameID string
	EventChannel  chan *piratesv1.GameEvent
}

type Registry struct {
	mu            sync.RWMutex
	players       map[string]*Player
	tokenToPlayer map[string]*Player
}

func NewRegistry() *Registry {
	return &Registry{
		players:       make(map[string]*Player),
		tokenToPlayer: make(map[string]*Player),
	}
}

func (r *Registry) Register(displayName string) (*Player, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if displayName == "" {
		displayName = generatePirateName()
	}

	id := uuid.New().String()
	token, err := generateSessionToken()
	if err != nil {
		return nil, err
	}

	player := &Player{
		Proto: &piratesv1.Player{
			Id:          id,
			DisplayName: displayName,
			Status:      piratesv1.PlayerStatus_PLAYER_STATUS_ONLINE,
		},
		SessionToken: token,
		EventChannel: make(chan *piratesv1.GameEvent, 100),
	}

	r.players[id] = player
	r.tokenToPlayer[token] = player

	return player, nil
}

func (r *Registry) GetByID(id string) (*Player, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	player, ok := r.players[id]
	return player, ok
}

func (r *Registry) GetByToken(token string) (*Player, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	player, ok := r.tokenToPlayer[token]
	return player, ok
}

func (r *Registry) SetStatus(id string, status piratesv1.PlayerStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, ok := r.players[id]; ok {
		player.Proto.Status = status
	}
}

func (r *Registry) GetAvailablePlayers() []*Player {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var available []*Player
	for _, player := range r.players {
		if player.Proto.Status == piratesv1.PlayerStatus_PLAYER_STATUS_ONLINE {
			available = append(available, player)
		}
	}
	return available
}

func (r *Registry) Remove(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if player, ok := r.players[id]; ok {
		delete(r.tokenToPlayer, player.SessionToken)
		close(player.EventChannel)
		delete(r.players, id)
	}
}

func generatePirateName() string {
	prefixIdx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(pirateNamePrefixes))))
	suffixIdx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(pirateNameSuffixes))))

	return pirateNamePrefixes[prefixIdx.Int64()] + " " + pirateNameSuffixes[suffixIdx.Int64()]
}

func generateSessionToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
