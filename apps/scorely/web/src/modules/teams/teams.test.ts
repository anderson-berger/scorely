import type { TeamPlayer, Teams } from '@scorely/contracts';
import {
  draftOf,
  emptyDraft,
  moveTo,
  setPinned,
  setTeamCount,
  type TeamsDraft,
  teamIndexOf,
} from '@scorely/web/src/modules/teams/teams';
import { describe, expect, it } from 'vitest';

const ANA = 'a0000000-0000-4000-8000-000000000001';
const BIA = 'a0000000-0000-4000-8000-000000000002';
const CAI = 'a0000000-0000-4000-8000-000000000003';
const DUDA = 'a0000000-0000-4000-8000-000000000004';

const draft = (teams: string[][], pinned: string[] = []): TeamsDraft => ({ teams, positions: {}, pinned });

describe('Montar times', () => {
  it('TIM-14: "Montar à mão" cria o rascunho com 2 times vazios, sem ajustes de posição e ninguém fixo', () => {
    expect(emptyDraft()).toEqual({ teams: [[], []], positions: {}, pinned: [] });
  });
});

describe('mover alguém', () => {
  it('TIM-14: quem está sem time vai para o time escolhido', () => {
    const next = moveTo(draft([[ANA], []]), BIA, 1);
    expect(teamIndexOf(next, BIA)).toBe(1);
    expect(next.teams).toEqual([[ANA], [BIA]]);
  });

  it('TIM-14: quem entra num time vai para o fim dele', () => {
    const next = moveTo(draft([[ANA, BIA], []]), CAI, 0);
    expect(next.teams[0]).toEqual([ANA, BIA, CAI]);
  });

  it('TIM-14: trocar de time tira a pessoa do time antigo (uma pessoa num time só, TIM-08)', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]]), ANA, 1);
    expect(next.teams).toEqual([[BIA], [CAI, ANA]]);
    expect(next.teams.flat().filter((id) => id === ANA)).toHaveLength(1);
  });

  it('TIM-14: "Sem time" ou "Tirar dos times" tira a pessoa de todos os times', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]]), BIA, undefined);
    expect(teamIndexOf(next, BIA)).toBeUndefined();
    expect(next.teams).toEqual([[ANA], [CAI]]);
  });

  it('TIM-14: mover mantém os outros times como estavam', () => {
    const next = moveTo(draft([[ANA], [BIA], [CAI]]), DUDA, 2);
    expect(next.teams).toEqual([[ANA], [BIA], [CAI, DUDA]]);
  });

  it('TIM-14: teamIndexOf diz o time da pessoa (0 = Time 1) ou nada se está sem time', () => {
    const current = draft([[ANA], [BIA]]);
    expect(teamIndexOf(current, ANA)).toBe(0);
    expect(teamIndexOf(current, BIA)).toBe(1);
    expect(teamIndexOf(current, CAI)).toBeUndefined();
  });
});

describe('Times: − N +', () => {
  it('TIM-14: aumentar a quantidade acrescenta times vazios no fim, sem mexer nos outros', () => {
    const next = setTeamCount(draft([[ANA], [BIA]]), 3);
    expect(next.teams).toEqual([[ANA], [BIA], []]);
  });

  it('TIM-14: ao diminuir, quem estava no time que sumiu vai para "sem time"', () => {
    const next = setTeamCount(draft([[ANA], [BIA], [CAI, DUDA]]), 2);
    expect(next.teams).toEqual([[ANA], [BIA]]);
    expect(teamIndexOf(next, CAI)).toBeUndefined();
    expect(teamIndexOf(next, DUDA)).toBeUndefined();
  });

  it('TIM-14: diminuir vários de uma vez tira todos os times que sumiram', () => {
    const next = setTeamCount(draft([[ANA], [BIA], [CAI], [DUDA]]), 2);
    expect(next.teams).toEqual([[ANA], [BIA]]);
  });

  it('TIM-14: mudar a quantidade mantém os ajustes de posição do jogo', () => {
    const current: TeamsDraft = { teams: [[ANA], [BIA]], positions: { [ANA]: ['setter'] }, pinned: [] };
    expect(setTeamCount(current, 3).positions).toEqual({ [ANA]: ['setter'] });
  });
});

// E3 etapa 3 (`.claude/work/e3-times-3.md`): fixar (TIM-16) no rascunho do dono.

const player = (userId: string, pinned: boolean): TeamPlayer => ({
  userId,
  role: 'member',
  positions: [],
  adjusted: false,
  inList: true,
  bench: false,
  pinned,
  extra: false,
});

describe('Fixar neste time', () => {
  it('TIM-16: draftOf lê quem está fixo nos times', () => {
    const teams: Teams = {
      groupId: 'b0000000-0000-4000-8000-000000000001',
      date: '2026-11-06',
      status: 'draft',
      teams: [[player(ANA, true), player(BIA, false)], [player(CAI, true)]],
      unassigned: [player(DUDA, false)],
    };
    const current = draftOf(teams);
    expect(current.teams).toEqual([[ANA, BIA], [CAI]]);
    expect([...current.pinned].sort()).toEqual([ANA, CAI].sort());
  });

  it('TIM-16: fixar quem está num time marca a pessoa; desafixar tira a marca', () => {
    const pinned = setPinned(draft([[ANA], [BIA]]), ANA, true);
    expect(pinned.pinned).toEqual([ANA]);
    expect(pinned.teams).toEqual([[ANA], [BIA]]);
    expect(setPinned(pinned, ANA, false).pinned).toEqual([]);
  });

  it('TIM-16: fixar quem já está fixo não repete a pessoa', () => {
    expect(setPinned(draft([[ANA], [BIA]], [ANA]), ANA, true).pinned).toEqual([ANA]);
  });

  it('TIM-16: só quem está num time pode ser fixo (sem time não muda nada)', () => {
    const current = draft([[ANA], [BIA]]);
    expect(setPinned(current, CAI, true)).toEqual(current);
  });

  it('TIM-16: mover uma pessoa fixa para outro time mantém a pessoa fixa', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]], [ANA]), ANA, 1);
    expect(next.teams).toEqual([[BIA], [CAI, ANA]]);
    expect(next.pinned).toEqual([ANA]);
  });

  it('TIM-16: mover para "sem time" ou tirar dos times desafixa', () => {
    const next = moveTo(draft([[ANA, BIA], [CAI]], [ANA, CAI]), ANA, undefined);
    expect(teamIndexOf(next, ANA)).toBeUndefined();
    expect(next.pinned).toEqual([CAI]);
  });

  it('TIM-14 / TIM-16: ao diminuir os times, quem estava no time que sumiu deixa de ser fixo', () => {
    const next = setTeamCount(draft([[ANA], [BIA], [CAI, DUDA]], [ANA, CAI]), 2);
    expect(next.teams).toEqual([[ANA], [BIA]]);
    expect(next.pinned).toEqual([ANA]);
  });

  it('TIM-14 / TIM-16: aumentar os times mantém quem está fixo', () => {
    expect(setTeamCount(draft([[ANA], [BIA]], [ANA, BIA]), 3).pinned).toEqual([ANA, BIA]);
  });
});
