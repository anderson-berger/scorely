import { reactive } from 'vue';
import type { User } from '@scorely/api/modules/user/user.schemas';
import type { NewTeam, TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';
import UserService from 'src/services/api/UserService';
import TeamService from 'src/services/api/TeamService';

class SessionStore {
  private _state = reactive({
    user: null as User | null,
    teamWithMember: [] as TeamWithMember[],
    activeTeamId: this.getStoredTeamId(),
    isInitialized: false,
  });

  get user() {
    return this._state.user;
  }

  get teamWithMember() {
    return this._state.teamWithMember;
  }

  get activeTeamId() {
    return this._state.activeTeamId;
  }

  get activeTeam(): TeamWithMember | null {
    if (!this._state.activeTeamId) return null;
    return this._state.teamWithMember.find((t) => t.id === this._state.activeTeamId) ?? null;
  }

  get isInitialized() {
    return this._state.isInitialized;
  }

  // ===================================
  // INIT & RESET
  // ===================================

  async init() {
    if (this._state.isInitialized) return; // evita init duplicado

    await this.fetchSessionData();
    this._state.isInitialized = true;
  }

  reset() {
    this._state.user = null;
    this._state.teamWithMember = [];
    this._state.activeTeamId = null;
    this._state.isInitialized = false;
    localStorage.removeItem('activeTeamId');
  }

  // ===================================
  // DATA FETCHING
  // ===================================

  private async fetchSessionData() {
    const [user, teamWithMember] = await Promise.all([
      UserService.getMe(),
      TeamService.getMyTeams(),
    ]);

    this._state.user = user;
    this._state.teamWithMember = teamWithMember;

    // Validar activeTeamId salvo
    this.validateActiveTeam();
  }

  async refreshUser() {
    this._state.user = await UserService.getMe();
  }

  async createTeam(input?: NewTeam) {
    const team = await TeamService.create(input);
    this._state.teamWithMember.push(team);
    this.setActiveTeam(team.id);
    return team;
  }

  async refreshTeams() {
    const [teamWithMember] = await Promise.all([TeamService.getMyTeams()]);

    this._state.teamWithMember = teamWithMember;

    // Revalidar team ativo após refresh
    this.validateActiveTeam();
  }

  // ===================================
  // ACTIVE TEAM MANAGEMENT
  // ===================================

  setActiveTeam(teamId: TeamWithMember['id']) {
    const team = this._state.teamWithMember.find((t) => t.id === teamId);
    if (!team) {
      console.warn(`Team ${teamId} not found in user teamWithMember`);
      return;
    }

    this._state.activeTeamId = teamId;
    localStorage.setItem('activeTeamId', teamId);
  }

  private validateActiveTeam() {
    const saved = this.getStoredTeamId();
    const teamExists = saved && this._state.teamWithMember.find((t) => t.id === saved);

    this._state.activeTeamId = teamExists ? saved : (this._state.teamWithMember[0]?.id ?? null);

    if (this._state.activeTeamId) {
      localStorage.setItem('activeTeamId', this._state.activeTeamId);
    }
  }

  private getStoredTeamId(): TeamWithMember['id'] | null {
    return localStorage.getItem('activeTeamId');
  }
}

export const sessionStore = new SessionStore();
