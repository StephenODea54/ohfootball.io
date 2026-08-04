import { teams } from "@/app/team-data"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text } from "@/components/ui/text"

const highestRating = Math.max(...teams.map((team) => team.rating))
const ratingFloor = 1500

export function LeaderboardPage() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <header className="max-w-4xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Leaderboard</Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Ohio high school football teams ranked by Elo rating. Ratings update as results are
            added throughout the season.
          </Text>
        </header>

        <Card className="mt-8 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)] sm:mt-10">
          <CardContent>
            <Table aria-label="Ohio high school football Elo leaderboard" bleed>
              <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
                <TableColumn isRowHeader className="w-16">Rank</TableColumn>
                <TableColumn>Team</TableColumn>
                <TableColumn className="text-end">Record</TableColumn>
                <TableColumn className="w-32 text-end">Elo</TableColumn>
              </TableHeader>
              <TableBody>
                {teams.map((team) => {
                  const progress = ((team.rating - ratingFloor) / (highestRating - ratingFloor)) * 100

                  return (
                    <TableRow id={team.slug} key={team.slug}>
                      <TableCell className="text-lg/6 font-semibold text-muted-fg">
                        {team.rank}
                      </TableCell>
                      <TableCell>
                        <div className="py-1">
                          <Link
                            href={`/teams/${team.slug}`}
                            className="font-semibold text-base/6 text-fg hover:text-primary-subtle-fg"
                          >
                            {team.name}
                          </Link>
                          <p className="text-sm/5 text-muted-fg">
                            {team.city} · {team.division}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-end font-medium text-fg">
                        {team.record}
                      </TableCell>
                      <TableCell>
                        <div className="ms-auto w-24 py-1">
                          <p className="text-end font-semibold text-base/6 text-success-subtle-fg">
                            {team.rating}
                          </p>
                          <ProgressBar
                            aria-label={`${team.name} Elo rating ${team.rating}`}
                            value={progress}
                            className="mt-1"
                          >
                            <ProgressBarTrack className="min-w-24 max-w-24 [--progress-content-bg:var(--color-success)]" />
                          </ProgressBar>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Text className="mt-3 text-xs/5">
          Elo ratings are relative performance estimates and update after completed games.
        </Text>
      </Container>
    </main>
  )
}
