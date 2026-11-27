import { randomInt, randomUUID } from 'node:crypto';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { memoryUsers } from '@scorely/api/src/modules/users/data/users.memory';
import {
  dynamoUserDirectory,
  dynamoUserRepository,
  type UserRepository,
} from '@scorely/api/src/modules/users/data/users.repository';
import type { UserDirectory, UserRecord } from '@scorely/api/src/modules/users/users.access';
import { type PublicUserId, PublicUserIdSchema } from '@scorely/contracts';
import { beforeAll, describe, expect, inject, it } from 'vitest';

// Suíte de contrato do UserRepository e do UserDirectory (ADR 0019): a mesma bateria roda contra a memória e contra
// o DynamoDB Local, chamando o repositório direto. Ids, emails e códigos sempre novos, sem limpar entre os testes.

const T0 = new Date('2026-11-23T10:00:00.000Z');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = (): PublicUserId =>
  PublicUserIdSchema.parse(Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''));
const newEmail = () => `${randomUUID()}@example.com`;

function newUser(publicId: PublicUserId = newCode()): UserRecord {
  return {
    id: asUserId(randomUUID()),
    publicId,
    nickname: publicId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
  } as UserRecord;
}

/** Conta criada pelo próprio repositório. */
async function account(repo: UserRepository) {
  const user = newUser();
  const email = newEmail();
  expect(await repo.create(user, email)).toBe('created');
  return { user, email, id: user.id };
}

const read = { consistent: true };

describe.each([
  {
    name: 'memória',
    make: () => {
      const m = memoryUsers();
      return { repo: m.repo, directory: m.directory as UserDirectory };
    },
  },
  {
    name: 'DynamoDB Local',
    make: () => ({ repo: dynamoUserRepository, directory: dynamoUserDirectory as UserDirectory }),
    dynamo: true,
  },
])('UserRepository ($name)', ({ make, dynamo }) => {
  const { repo, directory } = make();

  beforeAll(() => {
    if (!dynamo) return;
    process.env.TABLE_NAME = inject('dynamoTableName');
    process.env.DYNAMODB_ENDPOINT = inject('dynamoEndpoint');
    process.env.AWS_REGION = 'sa-east-1';
  });

  describe('criar', () => {
    it('USR-01, USR-15: create grava o perfil, o email e o código de amigo, e os lookups levam a ele', async () => {
      const user = newUser();
      const email = newEmail();
      expect(await repo.create(user, email)).toBe('created');
      expect(await repo.get(user.id, read)).toEqual(user);
      const me = await repo.getMe(user.id, read);
      expect(me).toMatchObject({ ...user, private: { email }, preferences: {} });
      expect(me?.private.name).toBeUndefined();
      expect(await repo.getByEmail(email, read)).toEqual(me);
      expect((await repo.resolve([user.publicId])).get(user.publicId)).toBe(user.id);
    });

    it('USR-13: get e o getMany do diretório não trazem private, email nem name', async () => {
      const { id } = await account(repo);
      await repo.update(id, { version: 1, private: { name: 'Fulano de Tal' } });
      const profile = await repo.get(id, read);
      const [fromDirectory] = await directory.getMany([id]);
      for (const record of [profile, fromDirectory, await directory.get(id)]) {
        expect(record).toBeDefined();
        expect(record).not.toHaveProperty('private');
        expect(record).not.toHaveProperty('email');
        expect(record).not.toHaveProperty('name');
      }
    });

    it('USR-01: create com email já usado → email_taken, e nada do segundo existe', async () => {
      const first = await account(repo);
      const second = newUser();
      expect(await repo.create(second, first.email)).toBe('email_taken');
      expect(await repo.get(second.id, read)).toBeUndefined();
      expect((await repo.resolve([second.publicId])).size).toBe(0);
      expect((await repo.getByEmail(first.email, read))?.id).toBe(first.id);
    });

    it('USR-15: create com código já usado e email novo → public_id_taken, e nada do segundo existe', async () => {
      const first = await account(repo);
      const second = newUser(first.user.publicId);
      const email = newEmail();
      expect(await repo.create(second, email)).toBe('public_id_taken');
      expect(await repo.get(second.id, read)).toBeUndefined();
      expect(await repo.getByEmail(email, read)).toBeUndefined();
      expect((await repo.resolve([first.user.publicId])).get(first.user.publicId)).toBe(first.id);
    });

    it('USR-01, USR-15: email e código já usados → email_taken (o email vem primeiro)', async () => {
      const first = await account(repo);
      const second = newUser(first.user.publicId);
      expect(await repo.create(second, first.email)).toBe('email_taken');
      expect(await repo.get(second.id, read)).toBeUndefined();
    });
  });

  describe('ler', () => {
    it('USR-01: id ou email que não existe → get, getMe e getByEmail undefined; getPreferences {}', async () => {
      const id = asUserId(randomUUID());
      expect(await repo.get(id, read)).toBeUndefined();
      expect(await repo.getMe(id, read)).toBeUndefined();
      expect(await repo.getByEmail(newEmail(), read)).toBeUndefined();
      expect(await repo.getPreferences(id)).toEqual({});
    });
  });

  describe('editar', () => {
    it('USR-03, USR-18: update do apelido e do gênero com a version atual → devolve o novo, version +1', async () => {
      const { id } = await account(repo);
      const updated = await repo.update(id, { version: 1, nickname: 'Craque', gender: 'F' });
      expect(updated).toMatchObject({ id, nickname: 'Craque', gender: 'F', version: 2 });
      expect(await repo.get(id, read)).toMatchObject({ nickname: 'Craque', gender: 'F', version: 2 });
      expect(await repo.getMe(id, read)).toEqual(updated);
    });

    it('USR-13, USR-18: update só do private.name → version +1, name no getMe e fora do get', async () => {
      const { id, email } = await account(repo);
      const updated = await repo.update(id, { version: 1, private: { name: 'Fulano de Tal' } });
      expect(updated?.version).toBe(2);
      expect((await repo.getMe(id, read))?.private).toEqual({ email, name: 'Fulano de Tal' });
      expect(await repo.get(id, read)).toMatchObject({ version: 2 });
      expect(await repo.get(id, read)).not.toHaveProperty('name');
      expect(await repo.get(id, read)).not.toHaveProperty('private');
    });

    it('USR-14, USR-18: update só das preferências, um campo por vez: o segundo não apaga o primeiro', async () => {
      const { id } = await account(repo);
      const first = await repo.update(id, { version: 1, preferences: { locale: 'en' } });
      expect(first?.version).toBe(2);
      const second = await repo.update(id, { version: 2, preferences: { timeZone: 'America/Sao_Paulo' } });
      expect(second?.version).toBe(3);
      expect(await repo.getPreferences(id)).toEqual({ locale: 'en', timeZone: 'America/Sao_Paulo' });
      expect((await repo.getMe(id, read))?.preferences).toEqual({
        locale: 'en',
        timeZone: 'America/Sao_Paulo',
      });
    });

    it('USR-18: update com version velha → VERSION_CONFLICT com a currentVersion, e nada muda', async () => {
      const { id } = await account(repo);
      await repo.update(id, { version: 1, nickname: 'Craque' });
      const before = await repo.getMe(id, read);
      const err = await repo
        .update(id, {
          version: 1,
          nickname: 'Outro',
          private: { name: 'Outro Nome' },
          preferences: { locale: 'en' },
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'VERSION_CONFLICT', status: 409, details: { currentVersion: 2 } });
      expect(await repo.getMe(id, read)).toEqual(before);
      expect(await repo.getPreferences(id)).toEqual({});
    });

    it('AUTH-16: update de id que não existe → undefined, sem criar nada', async () => {
      const id: UserId = asUserId(randomUUID());
      expect(await repo.update(id, { version: 1, nickname: 'Fantasma' })).toBeUndefined();
      expect(await repo.get(id, read)).toBeUndefined();
      expect(await repo.getMe(id, read)).toBeUndefined();
    });
  });

  describe('traduzir', () => {
    it('USR-17: resolve com códigos conhecidos, desconhecidos e repetidos → só os conhecidos, uma vez cada', async () => {
      const a = await account(repo);
      const b = await account(repo);
      const unknown = newCode();
      const found = await repo.resolve([a.user.publicId, unknown, b.user.publicId, a.user.publicId]);
      expect(found.size).toBe(2);
      expect(found.get(a.user.publicId)).toBe(a.id);
      expect(found.get(b.user.publicId)).toBe(b.id);
      expect(found.has(unknown)).toBe(false);
      expect((await directory.resolve([b.user.publicId, unknown])).get(b.user.publicId)).toBe(b.id);
    });

    it('USR-17: getMany do diretório segue a ordem dos ids, sem os que não existem e sem repetir', async () => {
      const a = await account(repo);
      const b = await account(repo);
      const c = await account(repo);
      const ghost = asUserId(randomUUID());
      const many = await directory.getMany([c.id, ghost, a.id, c.id, b.id]);
      expect(many.map((u) => u.id)).toEqual([c.id, a.id, b.id]);
    });
  });
});
