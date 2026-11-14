import { type Permission, PublicUserIdSchema } from '@scorely/contracts';
import { groupAccess, showsSettings } from '@scorely/web/src/modules/groups/permissions';
import { describe, expect, it } from 'vitest';

// GRP-29 (alterada em 2026-11-14, `.claude/work/competicao-1.md`, D7): a aba Ajustes aparece também para quem tem
// `seasons.manage`. A conta passa pelo `groupAccess` + `showsSettings`, sem depender do nome do campo novo.

const OWNER = PublicUserIdSchema.parse('AAAA1111');
const ME = PublicUserIdSchema.parse('BBBB2222');

const access = (myPermissions: Permission[], meId = ME) =>
  groupAccess({ ownerId: OWNER, myPermissions }, meId);

describe('a aba Ajustes com a competição (GRP-29)', () => {
  it('GRP-29: quem tem só seasons.manage vê a aba Ajustes', () => {
    expect(showsSettings(access(['seasons.manage']), false)).toBe(true);
  });

  it('GRP-29: sem nenhuma das permissões dos Ajustes, e sem ser dono, a aba não aparece', () => {
    expect(showsSettings(access([]), false)).toBe(false);
    expect(showsSettings(access(['members.manage']), false)).toBe(false);
  });

  it('GRP-29: no grupo arquivado, seasons.manage não mostra os Ajustes (só o dono, GRP-37)', () => {
    expect(showsSettings(access(['seasons.manage']), true)).toBe(false);
    expect(showsSettings(access(['seasons.manage'], OWNER), true)).toBe(true);
  });
});
