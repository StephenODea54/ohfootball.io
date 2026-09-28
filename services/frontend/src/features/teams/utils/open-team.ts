import { paths } from "@/config/paths"

/** Loads the page of one team. Every page is a file, so this is a full page load. */
export function openTeam(teamId: string) {
  window.location.assign(paths.team.getHref(teamId))
}
