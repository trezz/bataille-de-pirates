package player

import (
	"testing"

	piratesv1 "github.com/trezz/bataille-de-pirates/server/gen/proto/pirates/v1"
)

func TestRegistry_Register(t *testing.T) {
	r := NewRegistry()

	t.Run("with display name", func(t *testing.T) {
		p, err := r.Register("TestPlayer")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Proto.DisplayName != "TestPlayer" {
			t.Errorf("expected display name 'TestPlayer', got %q", p.Proto.DisplayName)
		}
		if p.Proto.Id == "" {
			t.Error("expected non-empty ID")
		}
		if p.SessionToken == "" {
			t.Error("expected non-empty session token")
		}
		if p.Proto.Status != piratesv1.PlayerStatus_PLAYER_STATUS_ONLINE {
			t.Errorf("expected status ONLINE, got %v", p.Proto.Status)
		}
	})

	t.Run("without display name generates pirate name", func(t *testing.T) {
		p, err := r.Register("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Proto.DisplayName == "" {
			t.Error("expected generated pirate name, got empty string")
		}
	})
}

func TestRegistry_GetByID(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Register("TestPlayer")

	t.Run("existing player", func(t *testing.T) {
		found, ok := r.GetByID(p.Proto.Id)
		if !ok {
			t.Error("expected to find player")
		}
		if found.Proto.Id != p.Proto.Id {
			t.Error("found wrong player")
		}
	})

	t.Run("non-existing player", func(t *testing.T) {
		_, ok := r.GetByID("non-existing-id")
		if ok {
			t.Error("expected not to find player")
		}
	})
}

func TestRegistry_GetByToken(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Register("TestPlayer")

	t.Run("existing token", func(t *testing.T) {
		found, ok := r.GetByToken(p.SessionToken)
		if !ok {
			t.Error("expected to find player")
		}
		if found.Proto.Id != p.Proto.Id {
			t.Error("found wrong player")
		}
	})

	t.Run("non-existing token", func(t *testing.T) {
		_, ok := r.GetByToken("invalid-token")
		if ok {
			t.Error("expected not to find player")
		}
	})
}

func TestRegistry_SetStatus(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Register("TestPlayer")

	r.SetStatus(p.Proto.Id, piratesv1.PlayerStatus_PLAYER_STATUS_IN_GAME)

	found, _ := r.GetByID(p.Proto.Id)
	if found.Proto.Status != piratesv1.PlayerStatus_PLAYER_STATUS_IN_GAME {
		t.Errorf("expected status IN_GAME, got %v", found.Proto.Status)
	}
}

func TestRegistry_GetAvailablePlayers(t *testing.T) {
	r := NewRegistry()
	p1, _ := r.Register("Player1")
	p2, _ := r.Register("Player2")
	r.SetStatus(p2.Proto.Id, piratesv1.PlayerStatus_PLAYER_STATUS_IN_GAME)

	available := r.GetAvailablePlayers()

	if len(available) != 1 {
		t.Fatalf("expected 1 available player, got %d", len(available))
	}
	if available[0].Proto.Id != p1.Proto.Id {
		t.Error("expected Player1 to be available")
	}
}

func TestRegistry_Remove(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Register("TestPlayer")

	r.Remove(p.Proto.Id)

	_, ok := r.GetByID(p.Proto.Id)
	if ok {
		t.Error("expected player to be removed")
	}

	_, ok = r.GetByToken(p.SessionToken)
	if ok {
		t.Error("expected token mapping to be removed")
	}
}
