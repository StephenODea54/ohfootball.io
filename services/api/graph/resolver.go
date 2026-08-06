package graph

import (
	"context"

	"github.com/StephenODea54/services/api/graph/model"
)

type FootballStore interface {
	CurrentSeason(context.Context) (int, error)
	ListTeams(context.Context, *int, *string, *model.TeamSort, *int) ([]*model.Team, error)
	Team(context.Context, string) (*model.Team, error)
}

type Resolver struct {
	Store FootballStore
}
