package transport

import (
	"context"
	"errors"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/trezz/bataille-de-pirates/server/internal/game"
	"github.com/trezz/bataille-de-pirates/server/internal/matchmaker"
	"github.com/trezz/bataille-de-pirates/server/internal/player"

	pb "github.com/trezz/bataille-de-pirates/server/gen/pirates/v1"
	"github.com/trezz/bataille-de-pirates/server/gen/pirates/v1/piratesv1connect"
)

var _ piratesv1connect.PiratesServiceHandler = (*PiratesServer)(nil)

type PiratesServer struct {
	registry    *player.Registry
	matchmaker  *matchmaker.Matchmaker
	games       map[string]*game.Game
	gamesMu     sync.RWMutex
}

func NewPiratesServer() *PiratesServer {
	s := &PiratesServer{
		registry: player.NewRegistry(),
		games:    make(map[string]*game.Game),
	}

	s.matchmaker = matchmaker.NewMatchmaker(30 * time.Second)
	s.matchmaker.OnMatchProposed = s.handleMatchProposed
	s.matchmaker.OnMatchResult = s.handleMatchResult
	s.matchmaker.OnGameCreated = s.handleGameCreated

	return s
}

func (s *PiratesServer) getPlayerFromContext(ctx context.Context) (*player.Player, error) {
	token := ctx.Value("session_token")
	if token == nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("missing session token"))
	}
	p, ok := s.registry.GetByToken(token.(string))
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}
	return p, nil
}

func (s *PiratesServer) Connect(
	ctx context.Context,
	req *connect.Request[pb.ConnectRequest],
) (*connect.Response[pb.ConnectResponse], error) {
	p, err := s.registry.Register(req.Msg.DisplayName)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&pb.ConnectResponse{
		Player:       p.Proto,
		SessionToken: p.SessionToken,
	}), nil
}

func (s *PiratesServer) JoinQueue(
	ctx context.Context,
	req *connect.Request[pb.JoinQueueRequest],
) (*connect.Response[pb.QueueStatusUpdate], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	position, total := s.matchmaker.JoinQueue(p.Proto.Id)
	s.registry.SetStatus(p.Proto.Id, pb.PlayerStatus_PLAYER_STATUS_IN_QUEUE)

	return connect.NewResponse(&pb.QueueStatusUpdate{
		InQueue:        true,
		QueuePosition:  int32(position),
		PlayersInQueue: int32(total),
	}), nil
}

func (s *PiratesServer) LeaveQueue(
	ctx context.Context,
	req *connect.Request[pb.LeaveQueueRequest],
) (*connect.Response[pb.LeaveQueueResponse], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	s.matchmaker.LeaveQueue(p.Proto.Id)
	s.registry.SetStatus(p.Proto.Id, pb.PlayerStatus_PLAYER_STATUS_ONLINE)

	return connect.NewResponse(&pb.LeaveQueueResponse{}), nil
}

func (s *PiratesServer) ListPlayers(
	ctx context.Context,
	req *connect.Request[pb.ListPlayersRequest],
) (*connect.Response[pb.PlayerListUpdate], error) {
	_, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	available := s.registry.GetAvailablePlayers()
	protoPlayers := make([]*pb.Player, len(available))
	for i, p := range available {
		protoPlayers[i] = p.Proto
	}

	return connect.NewResponse(&pb.PlayerListUpdate{
		AvailablePlayers: protoPlayers,
	}), nil
}

func (s *PiratesServer) ChallengePlayer(
	ctx context.Context,
	req *connect.Request[pb.ChallengePlayerRequest],
) (*connect.Response[pb.ChallengePlayerResponse], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	match, err := s.matchmaker.Challenge(p.Proto.Id, req.Msg.TargetPlayerId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	return connect.NewResponse(&pb.ChallengePlayerResponse{
		MatchId: match.ID,
	}), nil
}

func (s *PiratesServer) RespondToMatch(
	ctx context.Context,
	req *connect.Request[pb.RespondToMatchRequest],
) (*connect.Response[pb.MatchResult], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	match, err := s.matchmaker.RespondToMatch(req.Msg.MatchId, p.Proto.Id, req.Msg.Accepted)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	reason := ""
	if match.Status == matchmaker.MatchStatusRejected {
		reason = "opponent_declined"
	}

	return connect.NewResponse(&pb.MatchResult{
		MatchId:         match.ID,
		Accepted:        match.Status == matchmaker.MatchStatusAccepted,
		RejectionReason: reason,
	}), nil
}

func (s *PiratesServer) PlaceShips(
	ctx context.Context,
	req *connect.Request[pb.PlaceShipsRequest],
) (*connect.Response[pb.PlacementResult], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	s.gamesMu.RLock()
	g, exists := s.games[p.CurrentGameID]
	s.gamesMu.RUnlock()

	if !exists {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("not in a game"))
	}

	err := g.PlaceShips(p.Proto.Id, req.Msg.Ships)
	if err != nil {
		return connect.NewResponse(&pb.PlacementResult{
			Valid:        false,
			ErrorMessage: err.Error(),
		}), nil
	}

	waitingForOpponent := !g.BothPlayersReady()

	if !waitingForOpponent {
		g.StartGame()
		s.notifyTurnStarted(g)
	} else {
		opponentID := g.GetOpponentID(p.Proto.Id)
		if opponent, ok := s.registry.GetByID(opponentID); ok {
			s.sendEvent(opponent, &pb.GameEvent{
				Event: &pb.GameEvent_PlacementUpdate{
					PlacementUpdate: &pb.PlacementResult{
						Valid:              true,
						WaitingForOpponent: false,
					},
				},
			})
		}
	}

	return connect.NewResponse(&pb.PlacementResult{
		Valid:              true,
		WaitingForOpponent: waitingForOpponent,
	}), nil
}

func (s *PiratesServer) Attack(
	ctx context.Context,
	req *connect.Request[pb.AttackRequest],
) (*connect.Response[pb.AttackResult], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	s.gamesMu.RLock()
	g, exists := s.games[p.CurrentGameID]
	s.gamesMu.RUnlock()

	if !exists {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("not in a game"))
	}

	result, err := g.Attack(p.Proto.Id, int(req.Msg.Target.X), int(req.Msg.Target.Y))
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	s.notifyOpponentOfAttack(g, p.Proto.Id, result)

	if gameOver := g.CheckVictory(); gameOver != nil {
		s.handleGameOver(g, gameOver)
	} else {
		g.NextTurn()
		s.notifyTurnStarted(g)
	}

	return connect.NewResponse(result), nil
}

func (s *PiratesServer) UsePower(
	ctx context.Context,
	req *connect.Request[pb.UsePowerRequest],
) (*connect.Response[pb.PowerResult], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	s.gamesMu.RLock()
	g, exists := s.games[p.CurrentGameID]
	s.gamesMu.RUnlock()

	if !exists {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("not in a game"))
	}

	result, err := g.UsePower(p.Proto.Id, req.Msg.Power, int(req.Msg.Target.X), int(req.Msg.Target.Y), req.Msg.Horizontal)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	s.notifyOpponentOfPower(g, p.Proto.Id, result)

	if gameOver := g.CheckVictory(); gameOver != nil {
		s.handleGameOver(g, gameOver)
	} else {
		g.NextTurn()
		s.notifyTurnStarted(g)
	}

	return connect.NewResponse(result), nil
}

func (s *PiratesServer) Forfeit(
	ctx context.Context,
	req *connect.Request[pb.ForfeitRequest],
) (*connect.Response[pb.ForfeitResponse], error) {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	s.gamesMu.RLock()
	g, exists := s.games[p.CurrentGameID]
	s.gamesMu.RUnlock()

	if !exists {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("not in a game"))
	}

	gameOver := g.Forfeit(p.Proto.Id)
	s.handleGameOver(g, gameOver)

	return connect.NewResponse(&pb.ForfeitResponse{}), nil
}

func (s *PiratesServer) SubscribeEvents(
	ctx context.Context,
	req *connect.Request[pb.SubscribeEventsRequest],
	stream *connect.ServerStream[pb.GameEvent],
) error {
	p, ok := s.registry.GetByToken(req.Msg.SessionToken)
	if !ok {
		return connect.NewError(connect.CodeUnauthenticated, errors.New("invalid session token"))
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case event, ok := <-p.EventChannel:
			if !ok {
				return nil
			}
			if err := stream.Send(event); err != nil {
				return err
			}
		}
	}
}

func (s *PiratesServer) handleMatchProposed(playerID string, match *matchmaker.Match) {
	p, ok := s.registry.GetByID(playerID)
	if !ok {
		return
	}

	var opponent *player.Player
	var youInitiated bool
	if match.Player1ID == playerID {
		opponent, _ = s.registry.GetByID(match.Player2ID)
		youInitiated = match.InitiatedBy == playerID
	} else {
		opponent, _ = s.registry.GetByID(match.Player1ID)
		youInitiated = match.InitiatedBy == playerID
	}

	if opponent == nil {
		return
	}

	s.sendEvent(p, &pb.GameEvent{
		Event: &pb.GameEvent_MatchProposal{
			MatchProposal: &pb.MatchProposal{
				MatchId:        match.ID,
				Opponent:       opponent.Proto,
				YouInitiated:   youInitiated,
				TimeoutSeconds: 30,
			},
		},
	})
}

func (s *PiratesServer) handleMatchResult(playerID string, match *matchmaker.Match) {
	p, ok := s.registry.GetByID(playerID)
	if !ok {
		return
	}

	reason := ""
	if match.Status == matchmaker.MatchStatusRejected {
		reason = "opponent_declined"
	} else if match.Status == matchmaker.MatchStatusExpired {
		reason = "timeout"
	}

	s.sendEvent(p, &pb.GameEvent{
		Event: &pb.GameEvent_MatchResult{
			MatchResult: &pb.MatchResult{
				MatchId:         match.ID,
				Accepted:        match.Status == matchmaker.MatchStatusAccepted,
				RejectionReason: reason,
			},
		},
	})
}

func (s *PiratesServer) handleGameCreated(player1ID, player2ID, gameID string) {
	g := game.NewGame(gameID, player1ID, player2ID)

	s.gamesMu.Lock()
	s.games[gameID] = g
	s.gamesMu.Unlock()

	p1, ok1 := s.registry.GetByID(player1ID)
	p2, ok2 := s.registry.GetByID(player2ID)

	if ok1 {
		p1.CurrentGameID = gameID
		s.registry.SetStatus(player1ID, pb.PlayerStatus_PLAYER_STATUS_IN_GAME)
		s.sendEvent(p1, &pb.GameEvent{
			Event: &pb.GameEvent_GameStarted{
				GameStarted: &pb.GameStarted{
					GameId:        gameID,
					Opponent:      p2.Proto,
					YourTurnFirst: g.CurrentTurn == player1ID,
				},
			},
		})
	}

	if ok2 {
		p2.CurrentGameID = gameID
		s.registry.SetStatus(player2ID, pb.PlayerStatus_PLAYER_STATUS_IN_GAME)
		s.sendEvent(p2, &pb.GameEvent{
			Event: &pb.GameEvent_GameStarted{
				GameStarted: &pb.GameStarted{
					GameId:        gameID,
					Opponent:      p1.Proto,
					YourTurnFirst: g.CurrentTurn == player2ID,
				},
			},
		})
	}
}

func (s *PiratesServer) notifyTurnStarted(g *game.Game) {
	p1, ok1 := s.registry.GetByID(g.Player1ID)
	p2, ok2 := s.registry.GetByID(g.Player2ID)

	if ok1 {
		powers := g.GetPlayerPowers(g.Player1ID)
		s.sendEvent(p1, &pb.GameEvent{
			Event: &pb.GameEvent_TurnStarted{
				TurnStarted: &pb.TurnStarted{
					YourTurn:        g.CurrentTurn == g.Player1ID,
					AvailablePowers: powers,
				},
			},
		})
	}

	if ok2 {
		powers := g.GetPlayerPowers(g.Player2ID)
		s.sendEvent(p2, &pb.GameEvent{
			Event: &pb.GameEvent_TurnStarted{
				TurnStarted: &pb.TurnStarted{
					YourTurn:        g.CurrentTurn == g.Player2ID,
					AvailablePowers: powers,
				},
			},
		})
	}
}

func (s *PiratesServer) notifyOpponentOfAttack(g *game.Game, attackerID string, result *pb.AttackResult) {
	opponentID := g.GetOpponentID(attackerID)
	opponent, ok := s.registry.GetByID(opponentID)
	if !ok {
		return
	}

	s.sendEvent(opponent, &pb.GameEvent{
		Event: &pb.GameEvent_OpponentAction{
			OpponentAction: &pb.OpponentAction{
				Action: &pb.OpponentAction_Attack{
					Attack: result,
				},
			},
		},
	})
}

func (s *PiratesServer) notifyOpponentOfPower(g *game.Game, attackerID string, result *pb.PowerResult) {
	opponentID := g.GetOpponentID(attackerID)
	opponent, ok := s.registry.GetByID(opponentID)
	if !ok {
		return
	}

	s.sendEvent(opponent, &pb.GameEvent{
		Event: &pb.GameEvent_OpponentAction{
			OpponentAction: &pb.OpponentAction{
				Action: &pb.OpponentAction_Power{
					Power: result,
				},
			},
		},
	})
}

func (s *PiratesServer) handleGameOver(g *game.Game, gameOver *pb.GameOver) {
	p1, ok1 := s.registry.GetByID(g.Player1ID)
	p2, ok2 := s.registry.GetByID(g.Player2ID)

	if ok1 {
		p1.CurrentGameID = ""
		s.registry.SetStatus(g.Player1ID, pb.PlayerStatus_PLAYER_STATUS_ONLINE)
		s.sendEvent(p1, &pb.GameEvent{
			Event: &pb.GameEvent_GameOver{
				GameOver: &pb.GameOver{
					YouWon: g.Winner == g.Player1ID,
					Reason: gameOver.Reason,
				},
			},
		})
	}

	if ok2 {
		p2.CurrentGameID = ""
		s.registry.SetStatus(g.Player2ID, pb.PlayerStatus_PLAYER_STATUS_ONLINE)
		s.sendEvent(p2, &pb.GameEvent{
			Event: &pb.GameEvent_GameOver{
				GameOver: &pb.GameOver{
					YouWon: g.Winner == g.Player2ID,
					Reason: gameOver.Reason,
				},
			},
		})
	}

	s.gamesMu.Lock()
	delete(s.games, g.ID)
	s.gamesMu.Unlock()
}

func (s *PiratesServer) sendEvent(p *player.Player, event *pb.GameEvent) {
	select {
	case p.EventChannel <- event:
	default:
	}
}
