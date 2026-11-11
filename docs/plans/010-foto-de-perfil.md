# 010 — Foto de perfil (upload por presigned POST no S3)

## Objetivo

O usuário escolhe uma foto no perfil. O navegador corta e redimensiona a imagem, envia **direto para o S3** com um POST assinado pela api e depois confirma o upload. A foto fica pública para leitura e aparece no perfil.

No dev local, onde não há LocalStack ([ADR 0007](../decisions/0007-dynamodb-local-sem-localstack.md)), um emulador de S3 entra no compose.

## Fora de escopo

- Mostrar a foto em outros lugares (lista de membros, placar, cabeçalho). Fica para um plano seguinte; por enquanto a foto aparece só no perfil.
- Imagens de outras entidades (escudo do grupo etc.).
- Processar a imagem no servidor (Lambda com `sharp`, miniaturas). Quem redimensiona é o navegador.
- CloudFront ou domínio próprio para as imagens: a leitura é pela URL pública do bucket.
- Limpar uploads abandonados (assinou mas não confirmou). Ficam no bucket; uma regra de ciclo de vida fica para depois.
- `base`: só o scorely.

## Decisões

- **D1. Fluxo em 3 passos.**
  1. `POST /me/avatar/upload` com `{ contentType }` devolve um POST assinado (`url`, `fields`), a `key` e o `maxBytes`.
  2. O navegador envia o arquivo para o S3 (multipart, direto, sem passar pela Lambda).
  3. `PUT /me/avatar` com `{ key }` confere o objeto e grava a foto.
  - Motivo: a Lambda não recebe o arquivo (limite de payload e custo), e o passo 3 garante que só vira foto o que foi enviado de verdade.
- **D2. POST assinado (`createPresignedPost`), não PUT.** A policy fixa `content-length-range` [1, 2 MB], `Content-Type` igual ao pedido e a `key`, e vale por 5 min. Motivo: com POST, o próprio S3 recusa arquivo grande ou de outro tipo, o que um PUT assinado não consegue garantir.
- **D3. Limites:** `image/jpeg`, `image/png` e `image/webp`, até **2 MB**.
  - **No navegador:** antes de enviar, recorta a imagem no centro em quadrado e redimensiona para **512×512**, em WebP (qualidade 0,85; JPEG se o navegador não gerar WebP). Uma foto de celular de 5 MB vira algo como 30–80 KB.
  - **Por que 2 MB:** o limite fica bem acima do que o redimensionamento gera, mas barra quem chamar a api por fora.
  - **Validação final:** quem decide é a api, não o navegador.
- **D4. Chave:** `avatars/<userId>/<uuid>.<ext>`, com uma chave nova a cada upload. Motivo: a URL muda, então não sobra cache velho no navegador.
  - **No `PUT /me/avatar`:** a `key` precisa começar com `avatars/<auth.userId>/`, senão `AVATAR_KEY_INVALID`.
  - **Foto anterior:** é apagada do bucket depois de gravar a nova. É melhor esforço: se falhar, só loga.
- **D5. Conferência no passo 3:** `HeadObject` na key.
  - Não existe → `AVATAR_NOT_UPLOADED`.
  - Tamanho acima de 2 MB ou tipo fora da lista → apaga o objeto e responde `AVATAR_INVALID` (`details: { maxBytes }`).
  - Motivo: o emulador local pode ignorar a policy, e assim a regra vale em qualquer ambiente.
- **D6. O que fica no usuário:** a entidade ganha `avatarUrl` (URL pública completa), e a chave para apagar sai da própria URL. `DELETE /me/avatar` remove a foto (apaga o objeto e o campo).
- **D7. Bucket no stack de infra** ([ADR 0001](../decisions/0001-infra-separada-da-api.md)): `createInfraService(project, { uploads: true })`, ligado só no scorely.
  - **Nome:** `<projeto>-<stage>-uploads-<AccountId>`, porque nome de bucket é global na AWS.
  - **Leitura pública** só em `avatars/*`, por bucket policy. O `PublicAccessBlock` libera a policy pública e continua bloqueando ACLs.
  - **CORS:** `POST` e `GET` de qualquer origem. A assinatura é que protege o envio. O domínio da web em prod ainda não existe; quando existir, troca-se `*` por ele.
  - **Outputs:** `UploadsBucketName` e `UploadsPublicUrl`. O compose repassa como params, e a api lê com fallback para o dev local.
- **D8. IAM da api:** `s3:PutObject` (a assinatura do POST exige), `s3:GetObject` (para o `HeadObject`) e `s3:DeleteObject`, em `arn:aws:s3:::<bucket>/avatars/*`, com ARN montado, sem `GetAtt`.
- **D9. Endpoints do S3:** `S3_ENDPOINT` é opcional, como o `DYNAMODB_ENDPOINT`. Se definido, a api usa `forcePathStyle` e credenciais `test`.
  - **`S3_PUBLIC_ENDPOINT`:** é o host que o navegador alcança (`http://localhost:9090`). A URL é assinada com ele, porque a assinatura inclui o host e o navegador não alcança `http://s3:9090`.
  - **URL pública:** em prod, `https://<bucket>.s3.sa-east-1.amazonaws.com/<key>`; no local, `<S3_PUBLIC_ENDPOINT>/<bucket>/<key>`.
- **D10. Emulador local:** **Adobe S3Mock** (`adobe/s3mock:5.2.3`, porta 9090, sem autenticação). O `db:setup` cria o bucket `scorely-dev-uploads` e o CORS.
  - **Tarefa 1 é um teste rápido:** POST assinado a partir do navegador (CORS + policy) e GET público.
  - **Se falhar:** troca por **Garage** (`dxflrs/garage:v2.5.0`). O resto do plano não muda.
  - **Registro:** a escolha vira a ADR `0008`.
- **D11. Web:**
  - **No `ProfilePage`:** foto (ou iniciais), "Trocar foto" (input de arquivo + preview) e "Remover".
  - **Corte e redimensionamento:** em `avatar.image.ts`. A conta do recorte (`coverCrop`) é função pura e testável; o canvas fica fora do teste.
  - **Envio:** em `users.api.ts` (`uploadAvatar(file)`: pede a assinatura → POST no S3 → confirma).
  - **Textos:** i18n em pt-BR e en.

## Interfaces internas (para os testes)

Adicionadas depois da aprovação, a pedido do test-writer. Só detalham D1–D11, sem mudar o escopo.

**Api, `src/lib/storage.ts`**

```ts
export interface StoredObject { size: number; contentType: string | undefined }

/** O service depende só disto; nos testes entra um storage em memória. */
export interface AvatarStorage {
  /** POST assinado (D2): policy com content-length-range [1, maxBytes], Content-Type exato e a key. */
  presignUpload(key: string, contentType: AvatarContentType, maxBytes: number): Promise<{ url: string; fields: Record<string, string> }>;
  /** `undefined` se o objeto não existe. */
  head(key: string): Promise<StoredObject | undefined>;
  remove(key: string): Promise<void>;
  /** URL pública do objeto (D9). */
  publicUrl(key: string): string;
  /** Inverso de `publicUrl`: `undefined` se a URL não é deste bucket. */
  keyFromUrl(url: string): string | undefined;
}

/** Base pública (caso 11). Com publicEndpoint: `<publicEndpoint>/<bucket>` (path style); sem: `https://<bucket>.s3.<region>.amazonaws.com`. Sem barra no fim. */
export function publicBaseUrl(cfg: { bucket: string; region: string; publicEndpoint?: string }): string;

/** Implementação real (S3, lê `env()` sob demanda). */
export const s3AvatarStorage: AvatarStorage;
```

**Api, `users`**

- `createUserService(repo, now = () => new Date(), storage: AvatarStorage = s3AvatarStorage)`: o terceiro parâmetro é novo e opcional.
- Métodos novos do service:
  - `requestAvatarUpload(userId: string, input: AvatarUploadInput): Promise<AvatarUpload>`: key `avatars/<userId>/<randomUUID>.<ext>`, com ext `jpg`, `png` ou `webp`.
  - `setAvatar(userId: string, input: SetAvatarInput): Promise<User>`: ordem das checagens: prefixo da key → `head` → tamanho/tipo → `repo.update` → `remove` da foto antiga, com falha só logada por `console.warn`.
  - `clearAvatar(userId: string): Promise<User>`
- `UserRepository` não ganha método. O `update` passa a aceitar `UserPatch = UpdateMeInput | { avatarUrl: string | null }`, e `null` remove o atributo, como já faz com o `nickname`.
- Handlers: `requestAvatarUpload`, `setAvatar` e `clearAvatar` no `authHandlers` de `users/handlers.ts`. As funções são `usersAvatarUpload`, `usersSetAvatar` e `usersClearAvatar`.

**Web, `src/modules/users/avatar.image.ts`**

```ts
/** Recorte central quadrado (caso 12). `size` = lado do recorte na origem; `out` = lado da saída = min(size, target). */
export function coverCrop(
  width: number,
  height: number,
  target: number,
): { sx: number; sy: number; size: number; out: number };
/** Canvas: decodifica (com orientação EXIF), recorta, redimensiona e gera WebP (ou JPEG). Fora dos testes. */
export function resizeAvatar(file: File, target?: number): Promise<Blob>;
```

- `users.api.ts`: `uploadAvatar(file: Blob): Promise<User>` e `removeAvatar(): Promise<User>`.

## Contrato (`@scorely/contracts`, `users.ts`)

```ts
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AvatarContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

UserSchema += { avatarUrl: z.url().optional() };

// POST /me/avatar/upload
export const AvatarUploadInputSchema = z.object({ contentType: AvatarContentTypeSchema });
export const AvatarUploadSchema = z.object({
  url: z.url(), // para onde o navegador faz o POST
  fields: z.record(z.string(), z.string()), // campos do form, antes do `file`
  key: z.string(),
  maxBytes: z.number().int(),
});

// PUT /me/avatar → User
export const SetAvatarInputSchema = z.object({ key: z.string().min(1) });

// DELETE /me/avatar → User
```

| Rota                     | Auth | Resposta           | Erros                                                                                                            |
| ------------------------ | ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `POST /me/avatar/upload` | sim  | 200 `AvatarUpload` | 422 `VALIDATION_ERROR` (tipo fora da lista)                                                                      |
| `PUT /me/avatar`         | sim  | 200 `User`         | 403 `AVATAR_KEY_INVALID`; 404 `AVATAR_NOT_UPLOADED`; 422 `AVATAR_INVALID` (`{ maxBytes }`); 404 `USER_NOT_FOUND` |
| `DELETE /me/avatar`      | sim  | 200 `User`         | 404 `USER_NOT_FOUND`                                                                                             |

Erros novos (os 4 lugares: enum, `CATALOG`, details, i18n): `AVATAR_KEY_INVALID` (403), `AVATAR_NOT_UPLOADED` (404), `AVATAR_INVALID` (422, `details: { maxBytes }`).

## Casos de comportamento

1. **Dado** um usuário logado, **quando** pede `POST /me/avatar/upload` com `image/webp`, **então** recebe `url`, `fields`, `maxBytes = 2097152` e uma `key` em `avatars/<userId>/<uuid>.webp`.
2. **Dado** o caso 1 duas vezes, **então** as duas `key` são diferentes.
3. **Dado** `contentType: 'image/gif'`, **quando** pede o upload, **então** 422 `VALIDATION_ERROR`.
4. **Dado** um objeto enviado na key do caso 1, **quando** chama `PUT /me/avatar`, **então** o usuário passa a ter `avatarUrl` apontando para essa key e a resposta é o `User`.
5. **Dado** uma key de outro usuário (`avatars/<outroId>/...`) ou fora de `avatars/`, **quando** chama `PUT /me/avatar`, **então** 403 `AVATAR_KEY_INVALID` e nada muda.
6. **Dado** uma key do próprio usuário sem objeto no bucket, **quando** chama `PUT /me/avatar`, **então** 404 `AVATAR_NOT_UPLOADED`.
7. **Dado** um objeto acima de 2 MB ou com tipo fora da lista na key, **quando** chama `PUT /me/avatar`, **então** 422 `AVATAR_INVALID` com `{ maxBytes }`, o objeto é apagado e o usuário não muda.
8. **Dado** um usuário que já tem foto, **quando** confirma uma nova, **então** `avatarUrl` muda e o objeto antigo é apagado.
9. **Dado** o caso 8 com falha ao apagar o objeto antigo, **então** a resposta continua 200 com a foto nova (a falha só é logada).
10. **Dado** um usuário com foto, **quando** chama `DELETE /me/avatar`, **então** `avatarUrl` some do usuário e o objeto é apagado. Sem foto, responde 200 sem mudar nada.
11. **Dado** `S3_ENDPOINT`/`S3_PUBLIC_ENDPOINT` definidos, **então** a `url` assinada e a `avatarUrl` usam o `S3_PUBLIC_ENDPOINT` em path style (`<endpoint>/<bucket>/<key>`). Sem eles, usam `https://<bucket>.s3.sa-east-1.amazonaws.com`.
12. **Web, `coverCrop`:** para uma imagem 4000×3000 e alvo 512, o recorte de origem é o quadrado central 3000×3000 (x=500, y=0). Para retrato 1080×1920, o recorte é x=0, y=420, 1080×1080. Imagem menor que 512 não é ampliada além do próprio tamanho.
13. **Web, perfil:** sem foto, mostra as iniciais e "Trocar foto". Com foto, mostra a imagem e "Remover". Um erro da api aparece traduzido pelo código.
14. **Checks:** o stack de infra do scorely tem o bucket, a policy pública só em `avatars/*` e os outputs. O IAM da api tem as três ações S3 no ARN montado, sem `GetAtt`. O compose tem `adobe/s3mock` com versão fixa e o `app` com `S3_ENDPOINT`/`S3_PUBLIC_ENDPOINT`. O devcontainer encaminha a 9090.

## Tarefas

1. **Teste rápido do S3Mock (D10).** Subir o S3Mock e, com um script fora do repo, fazer: criar bucket, configurar CORS, POST assinado a partir do navegador (`localhost:5174`), GET público e um upload acima do limite. Pronto quando: os quatro passos estão anotados no plano, ou a troca para Garage está decidida. Risco: **alto** (é aqui que se descobre se o emulador serve).
2. **Contrato + erros (4 lugares).** Pronto quando: `npm run typecheck` está verde. Risco: baixo.
3. **Infra:** bucket, policy, CORS e outputs no `createInfraService` (opção `uploads`); params no `serverless-compose.ts`; `setup-local.ts` cria o bucket e o CORS no emulador. Pronto quando: os checks do caso 14 passam e o `db:setup` cria o bucket local. Risco: médio (`PublicAccessBlock` + bucket policy).
4. **Ambiente local:** serviço `s3` no compose; `S3_ENDPOINT=http://s3:9090` e `S3_PUBLIC_ENDPOINT=http://localhost:9090` no `app`; porta 9090 no devcontainer; `.env.example`; ADR 0008. Pronto quando: o check do caso 14 passa. Risco: baixo.
5. **Api:** `lib/storage.ts` (cliente S3 lazy, presign, head, delete, URL pública); `env.ts` (`UPLOADS_BUCKET`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`); rotas, service e repositório (`setAvatar`/`clearAvatar`); IAM. Dependências novas: `@aws-sdk/client-s3` e `@aws-sdk/s3-presigned-post`. Pronto quando: os casos 1–11 passam, com o storage falso nos testes. Risco: médio.
6. **Web:** `avatar.image.ts` (`coverCrop` + canvas), `uploadAvatar` em `users.api.ts`, `ProfilePage` e i18n. Pronto quando: os casos 12–13 passam. Risco: médio (WebP e orientação EXIF; `createImageBitmap` com `imageOrientation: 'from-image'`).
7. **Docs:** README (S3 local, porta 9090) e PROJECT_CONTEXT. Pronto quando: as docs batem com o compose.

## Perguntas que bloqueiam

Nenhuma. Pontos para você confirmar na aprovação:

- **Limite:** 512×512 em WebP, até 2 MB, JPEG/PNG/WebP (D3).
- **CORS:** `*` até existir o domínio de prod (D7).
- **Uploads abandonados:** ficam no bucket por enquanto (fora de escopo).

## Status

- [x] 1. Plano — aprovado
- [x] 2. Contrato — schemas em `users.ts`, 3 erros nos 4 lugares; typecheck verde
- [x] 3. Testes — api (`user.avatar.test.ts`, `storage.test.ts`), web (`avatar.image.test.ts`), check (`uploads.test.ts`); caso 13 no roteiro manual. Desvio: a api foi implementada enquanto os testes eram escritos, então os testes da api não chegaram a falhar antes (foram escritos a partir do plano). O `biome --write` reformatou o `user.avatar.test.ts` staged (só quebra de linha).
- [x] 4. Implementação — tarefas 2–7 feitas, `npm run check` verde; check `dynamodb.test.ts` ganhou HeadObject/DeleteObject no mapa de IAM. Tarefa 1 feita em 2026-11-09 (ver nota no fim).
- [x] 5. Revisão — aprovado com ressalvas; 2 ⚠️ corrigidos (ListBucket, turbo env) (`010-foto-de-perfil.review.md`)
- [x] 6. Entrega — staged só o exclusivo do 010; arquivos compartilhados com 008/009 ficam para o dono

Nota (2026-11-09): as portas dos serviços fora do `app` (8000, 8001, 9090) saíram do `forwardPorts`: o Docker já as publica pelo compose, e o VS Code, que só encaminha o `app`, criava entradas mortas em portas aleatórias. Os checks agora exigem o contrário.

Nota da tarefa 1 (2026-11-09, a partir do container `app`, S3Mock 5.2.3): preflight CORS de `localhost:5174` → 200 com `*`; POST assinado de 1 KB → 200 (URL em path style); GET público → 200 `image/webp`; POST de 2 MB + 1 byte → **aceito** (o S3Mock ignora a policy, como previsto em D5: a api confere no `PUT /me/avatar`). O S3Mock não implementa `PutBucketCors` (o CORS já é `*`), e o `db:setup` ignora a falha. Conclusão: o S3Mock serve; ADR 0008 aceita.
