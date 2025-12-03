package matchmaker

import (
	"testing"
	"time"
)

func newTestMatchmaker() *Matchmaker {
	m := &Matchmaker{
		queue:        make([]QueueEntry, 0),
		matches:      make(map[string]*Match),
		playerMatch:  make(map[string]string),
		matchTimeout: 30 * time.Second,
		stopCh:       make(chan struct{}),
	}
	return m
}

func TestMatchmaker_JoinQueue(t *testing.T) {
	m := newTestMatchmaker()

	t.Run("first player joins", func(t *testing.T) {
		pos, total := m.JoinQueue("player1")
		if pos != 1 || total != 1 {
			t.Errorf("expected position 1, total 1, got %d, %d", pos, total)
		}
	})

	t.Run("second player joins", func(t *testing.T) {
		pos, total := m.JoinQueue("player2")
		if pos != 2 || total != 2 {
			t.Errorf("expected position 2, total 2, got %d, %d", pos, total)
		}
	})

	t.Run("same player joins again returns existing position", func(t *testing.T) {
		pos, total := m.JoinQueue("player1")
		if pos != 1 || total != 2 {
			t.Errorf("expected position 1, total 2, got %d, %d", pos, total)
		}
	})
}

func TestMatchmaker_LeaveQueue(t *testing.T) {
	m := newTestMatchmaker()
	m.JoinQueue("player1")
	m.JoinQueue("player2")

	m.LeaveQueue("player1")

	if m.IsInQueue("player1") {
		t.Error("expected player1 to not be in queue")
	}
	if !m.IsInQueue("player2") {
		t.Error("expected player2 to still be in queue")
	}
}

func TestMatchmaker_IsInQueue(t *testing.T) {
	m := newTestMatchmaker()

	if m.IsInQueue("player1") {
		t.Error("expected player1 to not be in queue initially")
	}

	m.JoinQueue("player1")

	if !m.IsInQueue("player1") {
		t.Error("expected player1 to be in queue after joining")
	}
}

func TestMatchmaker_GetQueuePosition(t *testing.T) {
	m := newTestMatchmaker()
	m.JoinQueue("player1")
	m.JoinQueue("player2")

	t.Run("player in queue", func(t *testing.T) {
		pos, total := m.GetQueuePosition("player2")
		if pos != 2 || total != 2 {
			t.Errorf("expected position 2, total 2, got %d, %d", pos, total)
		}
	})

	t.Run("player not in queue", func(t *testing.T) {
		pos, total := m.GetQueuePosition("player3")
		if pos != 0 || total != 2 {
			t.Errorf("expected position 0, total 2, got %d, %d", pos, total)
		}
	})
}

func TestMatchmaker_Challenge(t *testing.T) {
	m := newTestMatchmaker()

	t.Run("successful challenge", func(t *testing.T) {
		match, err := m.Challenge("player1", "player2")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if match.Player1ID != "player1" || match.Player2ID != "player2" {
			t.Error("match players incorrect")
		}
		if match.InitiatedBy != "player1" {
			t.Error("initiator should be player1")
		}
		if match.Status != MatchStatusPending {
			t.Error("status should be pending")
		}
	})

	t.Run("cannot challenge yourself", func(t *testing.T) {
		_, err := m.Challenge("player3", "player3")
		if err == nil {
			t.Error("expected error when challenging yourself")
		}
	})

	t.Run("cannot challenge when already in match", func(t *testing.T) {
		_, err := m.Challenge("player1", "player3")
		if err == nil {
			t.Error("expected error when challenger has pending match")
		}
	})

	t.Run("removes players from queue", func(t *testing.T) {
		m2 := newTestMatchmaker()
		m2.JoinQueue("p1")
		m2.JoinQueue("p2")
		m2.Challenge("p1", "p2")

		if m2.IsInQueue("p1") || m2.IsInQueue("p2") {
			t.Error("players should be removed from queue after challenge")
		}
	})
}

func TestMatchmaker_RespondToMatch(t *testing.T) {
	t.Run("both accept", func(t *testing.T) {
		m := newTestMatchmaker()
		match, _ := m.Challenge("player1", "player2")

		m.RespondToMatch(match.ID, "player1", true)
		result, err := m.RespondToMatch(match.ID, "player2", true)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Status != MatchStatusAccepted {
			t.Errorf("expected status Accepted, got %v", result.Status)
		}
	})

	t.Run("one rejects", func(t *testing.T) {
		m := newTestMatchmaker()
		match, _ := m.Challenge("player1", "player2")

		result, err := m.RespondToMatch(match.ID, "player1", false)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Status != MatchStatusRejected {
			t.Errorf("expected status Rejected, got %v", result.Status)
		}
	})

	t.Run("match not found", func(t *testing.T) {
		m := newTestMatchmaker()
		_, err := m.RespondToMatch("invalid-id", "player1", true)
		if err == nil {
			t.Error("expected error for invalid match ID")
		}
	})

	t.Run("player not in match", func(t *testing.T) {
		m := newTestMatchmaker()
		match, _ := m.Challenge("player1", "player2")

		_, err := m.RespondToMatch(match.ID, "player3", true)
		if err == nil {
			t.Error("expected error for player not in match")
		}
	})
}

func TestMatchmaker_GetPendingMatch(t *testing.T) {
	m := newTestMatchmaker()

	t.Run("no pending match", func(t *testing.T) {
		match := m.GetPendingMatch("player1")
		if match != nil {
			t.Error("expected no pending match")
		}
	})

	t.Run("has pending match", func(t *testing.T) {
		created, _ := m.Challenge("player1", "player2")
		match := m.GetPendingMatch("player1")

		if match == nil {
			t.Fatal("expected pending match")
		}
		if match.ID != created.ID {
			t.Error("got wrong match")
		}
	})
}
