package matchmaker

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

type MatchStatus int

const (
	MatchStatusPending MatchStatus = iota
	MatchStatusAccepted
	MatchStatusRejected
	MatchStatusExpired
)

type QueueEntry struct {
	PlayerID string
	JoinedAt time.Time
}

type Match struct {
	ID          string
	Player1ID   string
	Player2ID   string
	InitiatedBy string
	Status      MatchStatus
	ExpiresAt   time.Time
	responses   map[string]bool
}

type OnMatchProposed func(playerID string, match *Match)
type OnMatchResult func(playerID string, match *Match)
type OnGameCreated func(player1ID, player2ID, gameID string)

type Matchmaker struct {
	mu           sync.RWMutex
	queue        []QueueEntry
	matches      map[string]*Match
	playerMatch  map[string]string
	matchTimeout time.Duration

	OnMatchProposed OnMatchProposed
	OnMatchResult   OnMatchResult
	OnGameCreated   OnGameCreated

	stopCh chan struct{}
	wg     sync.WaitGroup
}

func NewMatchmaker(matchTimeout time.Duration) *Matchmaker {
	m := &Matchmaker{
		queue:        make([]QueueEntry, 0),
		matches:      make(map[string]*Match),
		playerMatch:  make(map[string]string),
		matchTimeout: matchTimeout,
		stopCh:       make(chan struct{}),
	}
	m.wg.Add(1)
	go m.runAutoMatch()
	return m
}

func (m *Matchmaker) Stop() {
	close(m.stopCh)
	m.wg.Wait()
}

func (m *Matchmaker) JoinQueue(playerID string) (position int, total int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, entry := range m.queue {
		if entry.PlayerID == playerID {
			return i + 1, len(m.queue)
		}
	}

	m.queue = append(m.queue, QueueEntry{
		PlayerID: playerID,
		JoinedAt: time.Now(),
	})

	return len(m.queue), len(m.queue)
}

func (m *Matchmaker) LeaveQueue(playerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, entry := range m.queue {
		if entry.PlayerID == playerID {
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			return
		}
	}
}

func (m *Matchmaker) IsInQueue(playerID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, entry := range m.queue {
		if entry.PlayerID == playerID {
			return true
		}
	}
	return false
}

func (m *Matchmaker) GetQueuePosition(playerID string) (position int, total int) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for i, entry := range m.queue {
		if entry.PlayerID == playerID {
			return i + 1, len(m.queue)
		}
	}
	return 0, len(m.queue)
}

func (m *Matchmaker) Challenge(challengerID, targetID string) (*Match, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if challengerID == targetID {
		return nil, errors.New("cannot challenge yourself")
	}

	if _, exists := m.playerMatch[challengerID]; exists {
		return nil, errors.New("challenger already has a pending match")
	}
	if _, exists := m.playerMatch[targetID]; exists {
		return nil, errors.New("target already has a pending match")
	}

	match := &Match{
		ID:          uuid.New().String(),
		Player1ID:   challengerID,
		Player2ID:   targetID,
		InitiatedBy: challengerID,
		Status:      MatchStatusPending,
		ExpiresAt:   time.Now().Add(m.matchTimeout),
		responses:   make(map[string]bool),
	}

	m.matches[match.ID] = match
	m.playerMatch[challengerID] = match.ID
	m.playerMatch[targetID] = match.ID

	m.removeFromQueueLocked(challengerID)
	m.removeFromQueueLocked(targetID)

	if m.OnMatchProposed != nil {
		go m.OnMatchProposed(challengerID, match)
		go m.OnMatchProposed(targetID, match)
	}

	return match, nil
}

func (m *Matchmaker) RespondToMatch(matchID string, playerID string, accepted bool) (*Match, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	match, exists := m.matches[matchID]
	if !exists {
		return nil, errors.New("match not found")
	}

	if match.Player1ID != playerID && match.Player2ID != playerID {
		return nil, errors.New("player not part of this match")
	}

	if match.Status != MatchStatusPending {
		return nil, errors.New("match is no longer pending")
	}

	if time.Now().After(match.ExpiresAt) {
		match.Status = MatchStatusExpired
		m.cleanupMatch(match)
		return match, errors.New("match has expired")
	}

	match.responses[playerID] = accepted

	if !accepted {
		match.Status = MatchStatusRejected
		m.cleanupMatch(match)
		if m.OnMatchResult != nil {
			go m.OnMatchResult(match.Player1ID, match)
			go m.OnMatchResult(match.Player2ID, match)
		}
		return match, nil
	}

	if len(match.responses) == 2 && match.responses[match.Player1ID] && match.responses[match.Player2ID] {
		match.Status = MatchStatusAccepted
		gameID := m.CreateGame(match)
		m.cleanupMatch(match)
		if m.OnMatchResult != nil {
			go m.OnMatchResult(match.Player1ID, match)
			go m.OnMatchResult(match.Player2ID, match)
		}
		if m.OnGameCreated != nil {
			go m.OnGameCreated(match.Player1ID, match.Player2ID, gameID)
		}
	}

	return match, nil
}

func (m *Matchmaker) GetPendingMatch(playerID string) *Match {
	m.mu.RLock()
	defer m.mu.RUnlock()

	matchID, exists := m.playerMatch[playerID]
	if !exists {
		return nil
	}

	match, exists := m.matches[matchID]
	if !exists {
		return nil
	}

	if match.Status != MatchStatusPending {
		return nil
	}

	return match
}

func (m *Matchmaker) CreateGame(match *Match) string {
	return uuid.New().String()
}

func (m *Matchmaker) removeFromQueueLocked(playerID string) {
	for i, entry := range m.queue {
		if entry.PlayerID == playerID {
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			return
		}
	}
}

func (m *Matchmaker) cleanupMatch(match *Match) {
	delete(m.matches, match.ID)
	delete(m.playerMatch, match.Player1ID)
	delete(m.playerMatch, match.Player2ID)
}

func (m *Matchmaker) runAutoMatch() {
	defer m.wg.Done()

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.tryAutoMatch()
			m.cleanupExpiredMatches()
		}
	}
}

func (m *Matchmaker) tryAutoMatch() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.queue) < 2 {
		return
	}

	player1 := m.queue[0]
	player2 := m.queue[1]

	if _, exists := m.playerMatch[player1.PlayerID]; exists {
		return
	}
	if _, exists := m.playerMatch[player2.PlayerID]; exists {
		return
	}

	m.queue = m.queue[2:]

	match := &Match{
		ID:          uuid.New().String(),
		Player1ID:   player1.PlayerID,
		Player2ID:   player2.PlayerID,
		InitiatedBy: "",
		Status:      MatchStatusPending,
		ExpiresAt:   time.Now().Add(m.matchTimeout),
		responses:   make(map[string]bool),
	}

	m.matches[match.ID] = match
	m.playerMatch[player1.PlayerID] = match.ID
	m.playerMatch[player2.PlayerID] = match.ID

	if m.OnMatchProposed != nil {
		go m.OnMatchProposed(player1.PlayerID, match)
		go m.OnMatchProposed(player2.PlayerID, match)
	}
}

func (m *Matchmaker) cleanupExpiredMatches() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for _, match := range m.matches {
		if match.Status == MatchStatusPending && now.After(match.ExpiresAt) {
			match.Status = MatchStatusExpired
			if m.OnMatchResult != nil {
				go m.OnMatchResult(match.Player1ID, match)
				go m.OnMatchResult(match.Player2ID, match)
			}
			m.cleanupMatch(match)
		}
	}
}
