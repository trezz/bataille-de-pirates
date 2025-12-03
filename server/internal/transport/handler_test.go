package transport

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	pb "github.com/trezz/bataille-de-pirates/server/gen/pirates/v1"
)

func TestPiratesServer_Connect(t *testing.T) {
	s := NewPiratesServer()

	t.Run("with display name", func(t *testing.T) {
		req := connect.NewRequest(&pb.ConnectRequest{
			DisplayName: "TestPirate",
		})

		resp, err := s.Connect(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.Msg.Player.DisplayName != "TestPirate" {
			t.Errorf("expected display name 'TestPirate', got %q", resp.Msg.Player.DisplayName)
		}
		if resp.Msg.SessionToken == "" {
			t.Error("expected non-empty session token")
		}
		if resp.Msg.Player.Id == "" {
			t.Error("expected non-empty player ID")
		}
	})

	t.Run("without display name", func(t *testing.T) {
		req := connect.NewRequest(&pb.ConnectRequest{})

		resp, err := s.Connect(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.Msg.Player.DisplayName == "" {
			t.Error("expected generated display name")
		}
	})
}

func TestPiratesServer_JoinQueue(t *testing.T) {
	s := NewPiratesServer()

	connectReq := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
	connectResp, _ := s.Connect(context.Background(), connectReq)
	token := connectResp.Msg.SessionToken

	t.Run("successful join", func(t *testing.T) {
		req := connect.NewRequest(&pb.JoinQueueRequest{})
		req.Header().Set("Authorization", token)

		resp, err := s.JoinQueue(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !resp.Msg.InQueue {
			t.Error("expected to be in queue")
		}
		if resp.Msg.QueuePosition != 1 {
			t.Errorf("expected queue position 1, got %d", resp.Msg.QueuePosition)
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		req := connect.NewRequest(&pb.JoinQueueRequest{})
		req.Header().Set("Authorization", "invalid-token")

		_, err := s.JoinQueue(context.Background(), req)
		if err == nil {
			t.Error("expected error for invalid token")
		}
	})
}

func TestPiratesServer_LeaveQueue(t *testing.T) {
	s := NewPiratesServer()

	connectReq := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
	connectResp, _ := s.Connect(context.Background(), connectReq)
	token := connectResp.Msg.SessionToken

	joinReq := connect.NewRequest(&pb.JoinQueueRequest{})
	joinReq.Header().Set("Authorization", token)
	s.JoinQueue(context.Background(), joinReq)

	t.Run("successful leave", func(t *testing.T) {
		req := connect.NewRequest(&pb.LeaveQueueRequest{})
		req.Header().Set("Authorization", token)

		_, err := s.LeaveQueue(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestPiratesServer_ListPlayers(t *testing.T) {
	s := NewPiratesServer()

	connectReq := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
	connectResp, _ := s.Connect(context.Background(), connectReq)
	token := connectResp.Msg.SessionToken

	s.Connect(context.Background(), connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player2"}))

	t.Run("list available players", func(t *testing.T) {
		req := connect.NewRequest(&pb.ListPlayersRequest{})
		req.Header().Set("Authorization", token)

		resp, err := s.ListPlayers(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(resp.Msg.AvailablePlayers) != 2 {
			t.Errorf("expected 2 players, got %d", len(resp.Msg.AvailablePlayers))
		}
	})
}

func TestPiratesServer_ChallengePlayer(t *testing.T) {
	s := NewPiratesServer()

	connectReq1 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
	connectResp1, _ := s.Connect(context.Background(), connectReq1)
	token1 := connectResp1.Msg.SessionToken

	connectReq2 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player2"})
	connectResp2, _ := s.Connect(context.Background(), connectReq2)
	player2ID := connectResp2.Msg.Player.Id

	t.Run("successful challenge", func(t *testing.T) {
		req := connect.NewRequest(&pb.ChallengePlayerRequest{
			TargetPlayerId: player2ID,
		})
		req.Header().Set("Authorization", token1)

		resp, err := s.ChallengePlayer(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.Msg.MatchId == "" {
			t.Error("expected non-empty match ID")
		}
	})
}

func TestPiratesServer_RespondToMatch(t *testing.T) {
	t.Run("reject match", func(t *testing.T) {
		s := NewPiratesServer()

		connectReq1 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
		connectResp1, _ := s.Connect(context.Background(), connectReq1)
		token1 := connectResp1.Msg.SessionToken

		connectReq2 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player2"})
		connectResp2, _ := s.Connect(context.Background(), connectReq2)
		player2ID := connectResp2.Msg.Player.Id

		challengeReq := connect.NewRequest(&pb.ChallengePlayerRequest{TargetPlayerId: player2ID})
		challengeReq.Header().Set("Authorization", token1)
		challengeResp, _ := s.ChallengePlayer(context.Background(), challengeReq)
		matchID := challengeResp.Msg.MatchId

		req := connect.NewRequest(&pb.RespondToMatchRequest{MatchId: matchID, Accepted: false})
		req.Header().Set("Authorization", token1)
		resp, err := s.RespondToMatch(context.Background(), req)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.Accepted {
			t.Error("expected match to be rejected")
		}
		if resp.Msg.RejectionReason != "opponent_declined" {
			t.Errorf("expected rejection reason 'opponent_declined', got %q", resp.Msg.RejectionReason)
		}
	})

	t.Run("accept match", func(t *testing.T) {
		s := NewPiratesServer()

		connectReq1 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player1"})
		connectResp1, _ := s.Connect(context.Background(), connectReq1)
		token1 := connectResp1.Msg.SessionToken

		connectReq2 := connect.NewRequest(&pb.ConnectRequest{DisplayName: "Player2"})
		connectResp2, _ := s.Connect(context.Background(), connectReq2)
		token2 := connectResp2.Msg.SessionToken
		player2ID := connectResp2.Msg.Player.Id

		challengeReq := connect.NewRequest(&pb.ChallengePlayerRequest{TargetPlayerId: player2ID})
		challengeReq.Header().Set("Authorization", token1)
		challengeResp, _ := s.ChallengePlayer(context.Background(), challengeReq)
		matchID := challengeResp.Msg.MatchId

		req1 := connect.NewRequest(&pb.RespondToMatchRequest{MatchId: matchID, Accepted: true})
		req1.Header().Set("Authorization", token1)
		s.RespondToMatch(context.Background(), req1)

		req2 := connect.NewRequest(&pb.RespondToMatchRequest{MatchId: matchID, Accepted: true})
		req2.Header().Set("Authorization", token2)
		resp, err := s.RespondToMatch(context.Background(), req2)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.Msg.Accepted {
			t.Error("expected match to be accepted")
		}
	})
}
