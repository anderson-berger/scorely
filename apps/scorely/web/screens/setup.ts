import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Group, LoginResult, Match, MatchSummary, Me, RefreshResult, Tokens } from '@scorely/contracts';
import { ApiCallError, call } from '@scorely/web/screens/api';
import { API_URL, WEB_URL } from '@scorely/web/screens/env';
import { FILES, OUTPUT_DIR } from '@scorely/web/screens/paths';
import type { ScreenIds } from '@scorely/web/screens/routes';

/** Conta própria do script: os dados do dono não entram nos prints nem mudam (ADR 0023). */
const EMAIL = 'screens@scorely.dev';
const NICKNAME = 'Screens';
const GROUP_NAME = 'Grupo Screens';
const DAY_MS = 86_400_000;

async function assertUp(url: string, name: string) {
  try {
    await fetch(url);
  } catch {
    throw new Error(`${name} is not responding at ${url}. Start it with "npm run dev:scorely".`);
  }
}

/** O código de login, lido do outbox de dev (`consoleMailer`, só no serverless offline). */
async function loginCode(since: number) {
  const file = join(tmpdir(), 'scorely-outbox', `${EMAIL}.json`);
  const message = await readFile(file, 'utf8')
    .then((text) => JSON.parse(text) as { text: string; sentAt: string })
    .catch(() => undefined);
  const code =
    message && Date.parse(message.sentAt) >= since ? message.text.match(/\b\d{6}\b/)?.[0] : undefined;
  if (!code) throw new Error(`No new login code in ${file}. Is the api running in serverless offline here?`);
  return code;
}

async function savedSession(): Promise<Tokens | undefined> {
  try {
    const saved = JSON.parse(await readFile(FILES.session, 'utf8')) as Tokens;
    return await call<RefreshResult>('POST', '/auth/refresh', { body: { refreshToken: saved.refreshToken } });
  } catch (err) {
    // Sem arquivo, sessão vencida ou tabela recriada: entra de novo.
    if (err instanceof ApiCallError && err.status >= 500) throw err;
    return undefined;
  }
}

async function newSession(): Promise<Tokens> {
  const since = Date.now();
  await call('POST', '/auth/code', { body: { email: EMAIL, locale: 'pt-BR' } });
  const code = await loginCode(since);
  return call<LoginResult>('POST', '/auth/verify', { body: { email: EMAIL, code } });
}

/** AUTH-13: com o apelido de fábrica o guard prende a conta no perfil. */
async function ensureNickname(token: string) {
  const me = await call<Me>('GET', '/me', { token });
  if (me.nickname !== me.id) return;
  await call('PATCH', '/me', { token, body: { nickname: NICKNAME, version: me.version } });
}

async function ensureGroup(token: string) {
  const mine = await call<Group[]>('GET', '/me/groups', { token });
  const found = mine.find((group) => group.name === GROUP_NAME);
  return found ?? call<Group>('POST', '/groups', { token, body: { name: GROUP_NAME } });
}

/** Uma partida por vir com a lista aberta; sem nenhuma, cria uma para daqui a uma semana. */
async function ensureMatch(token: string, groupId: string) {
  const upcoming = await call<MatchSummary[]>('GET', `/groups/${groupId}/matches`, { token });
  const open = upcoming.find((match) => match.status === 'open');
  if (open) return open;
  const startsAt = new Date(Date.now() + 7 * DAY_MS);
  const body = {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 7_200_000).toISOString(),
  };
  return call<Match>('POST', `/groups/${groupId}/matches`, { token, body });
}

export default async function setup() {
  await assertUp(`${API_URL}/health`, 'The api');
  await assertUp(WEB_URL, 'The web');
  await mkdir(OUTPUT_DIR, { recursive: true });

  const tokens = (await savedSession()) ?? (await newSession());
  const { accessToken, refreshToken } = tokens;
  await writeFile(FILES.session, JSON.stringify({ accessToken, refreshToken }));

  await ensureNickname(accessToken);
  const group = await ensureGroup(accessToken);
  const match = await ensureMatch(accessToken, group.id);
  const ids: ScreenIds = { groupId: group.id, matchId: match.id };
  await writeFile(FILES.ids, JSON.stringify(ids));

  // O que o web guarda no navegador: a sessão (`lib/session.ts`) e o idioma (`lib/preferences.ts`).
  const localStorage = [
    { name: 'scorely.session', value: JSON.stringify({ accessToken, refreshToken }) },
    { name: 'scorely.locale', value: 'pt-BR' },
  ];
  await writeFile(
    FILES.storageState,
    JSON.stringify({ cookies: [], origins: [{ origin: new URL(WEB_URL).origin, localStorage }] }),
  );
}
