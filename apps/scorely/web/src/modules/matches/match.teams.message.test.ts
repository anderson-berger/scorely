import type { Match, MatchTeamMember, PublicUserId, User } from '@scorely/contracts';
import { teamsMessage } from '@scorely/web/src/modules/matches/match.message';
import { describe, expect, it } from 'vitest';

// PAR-19: a mensagem dos times (Copiar times), montada na tela.

const LINK = 'https://scorely.app/groups/K3X9PQ2A/matches/abc';
const OPTIONS = { groupName: 'Pelada de sexta', link: LINK, timeZone: 'America/Sao_Paulo' };

const user = (nickname: string, id: string): User => ({
  id: id as PublicUserId,
  createdAt: '2026-01-01T00:00:00.000Z',
  nickname,
});
const player = (nickname: string, id: string, left = false): MatchTeamMember => ({
  kind: 'player',
  user: user(nickname, id),
  tier: 'member',
  left,
});
const guest = (name: string, left = false): MatchTeamMember => ({
  kind: 'guest',
  guestId: '11111111-1111-4111-8111-111111111111',
  name,
  requestedBy: user('Carioca', '2BBBBBBB'),
  left,
});

function match(list: MatchTeamMember[][]): Match {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    startsAt: '2026-11-27T22:00:00.000Z',
    endsAt: '2026-11-28T00:00:00.000Z',
    teams: 2,
    playersPerTeam: 6,
    status: 'open',
    wave: 'members',
    confirmed: 0,
    createdAt: '2026-11-23T10:00:00.000Z',
    version: 1,
    membersHours: 72,
    reservesHours: 24,
    noGuests: false,
    closeHours: 0,
    waves: {
      members: '2026-11-24T22:00:00.000Z',
      reserves: '2026-11-26T22:00:00.000Z',
      close: '2026-11-27T22:00:00.000Z',
    },
    in: [],
    queue: [],
    notGoing: [],
    guestRequests: [],
    actions: { going: true, notGoing: true, requestGuest: false, manage: false, manageTeams: false },
    lineup: { list, unassigned: [], version: 1 },
  } as Match;
}

describe('teamsMessage (PAR-19)', () => {
  it('PAR-19: cabeçalho como o da lista, depois cada time numerado e, no fim, o link da partida', () => {
    const text = teamsMessage(
      match([[player('Edu', '1AAAAAAA'), player('Bia', '3CCCCCCC')], [player('Carioca', '2BBBBBBB')]]),
      OPTIONS,
    );
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^Pelada de sexta · .*27\/11 às 19:00$/);
    expect(lines[1]).toBe('');
    expect(text).toContain('Time 1\n1. Edu\n2. Bia\nTime 2\n1. Carioca');
    expect(lines.at(-1)).toBe(`Partida: ${LINK}`);
    expect(lines.at(-2)).toBe('');
  });

  it('PAR-19: quem saiu da lista não entra na mensagem', () => {
    const text = teamsMessage(
      match([[player('Edu', '1AAAAAAA'), player('Bia', '3CCCCCCC', true)], [player('Carioca', '2BBBBBBB')]]),
      OPTIONS,
    );
    expect(text).toContain('Time 1\n1. Edu\nTime 2');
    expect(text).not.toContain('Bia');
  });

  it('PAR-19: a pessoa removida (sem perfil) não entra na mensagem', () => {
    const text = teamsMessage(
      match([[player('Edu', '1AAAAAAA'), { kind: 'gone', left: true }], [player('Carioca', '2BBBBBBB')]]),
      OPTIONS,
    );
    expect(text).toContain('Time 1\n1. Edu\nTime 2\n1. Carioca');
  });

  it('PAR-19: o convidado sai só com o nome', () => {
    const text = teamsMessage(match([[guest('Joao')], [player('Carioca', '2BBBBBBB')]]), OPTIONS);
    expect(text).toContain('Time 1\n1. Joao\n');
    expect(text).not.toContain('convidado de');
  });

  it('PAR-19: o dia e a hora seguem o fuso de quem copia', () => {
    const text = teamsMessage(match([[], []]), { ...OPTIONS, timeZone: 'Europe/Lisbon' });
    expect(text.split('\n')[0]).toMatch(/27\/11 às 22:00$/);
  });
});
