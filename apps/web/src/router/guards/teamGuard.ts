import type { NavigationGuardWithThis } from 'vue-router';
import { teamStore } from 'src/services/stores/TeamStore';

/**
 * Resolves the active team from the :teamId route param.
 * Runs AFTER authGuard, so initSession() has already populated teamStore.
 * Sets teamStore.activeTeamId so the layout and menus react correctly.
 */
export const teamGuard: NavigationGuardWithThis<undefined> = (to, _from, next) => {
  const teamId = to.params.teamId as string;

  const team = teamStore.teamsWithMember.find((t) => t.id === teamId);

  if (!team) {
    return next({ name: 'app.home' });
  }

  teamStore.setActiveTeam(teamId);
  next();
};
