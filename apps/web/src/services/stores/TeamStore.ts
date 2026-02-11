import { reactive } from 'vue';
import type { NewTeam, TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';
import TeamService from 'src/services/api/TeamService';

const ACTIVE_TEAM_KEY = 'activeTeamId';

class TeamStore {
  private _state = reactive({
    teamsWithMember: [] as TeamWithMember[],
    activeTeamId: localStorage.getItem(ACTIVE_TEAM_KEY),
  });

  get teamsWithMember() {
    return this._state.teamsWithMember;
  }

  get activeTeamId() {
    return this._state.activeTeamId;
  }

  get activeTeam() {
    if (!this._state.activeTeamId) return null;
    return this._state.teamsWithMember.find((t) => t.id === this._state.activeTeamId) ?? null;
  }

  setActiveTeam(teamId: string) {
    this._state.activeTeamId = teamId;
    localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  }

  async fetchTeams() {
    this._state.teamsWithMember = await TeamService.getMyTeams();
  }

  async createTeam(input?: NewTeam) {
    const team = await TeamService.create(input);
    this._state.teamsWithMember.push(team);
    return team;
  }

  reset() {
    this._state.teamsWithMember = [];
    this._state.activeTeamId = null;
    localStorage.removeItem(ACTIVE_TEAM_KEY);
  }
}

export const teamStore = new TeamStore();
