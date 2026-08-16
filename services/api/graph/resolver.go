package graph

import (
	"context"

	"github.com/StephenODea54/services/api/graph/model"
)

type FootballStore interface {
	CurrentSeason(context.Context) (int, error)
	Seasons(context.Context) ([]int, error)
	ListTeams(context.Context, *int, *string, *int, *int, *model.TeamSort, *int) ([]*model.Team, error)
	Team(context.Context, string, *int) (*model.Team, error)
}

type Resolver struct {
	Store FootballStore
}
