---
paths:
  - "apps/*/web/**"
---

# Web

## Componentes Vue em Options API

**Não use `<script setup>`.** Todo `.vue` usa `<script lang="ts">` com `export default defineComponent({ ... })`, na ordem `name`, `components`, `setup`, `data`, `computed`, `watch`, hooks (`mounted`, `beforeUnmount`...) e `methods`.

- `setup()` serve só para expor as stores do Pinia: `return { auth: useAuthStore() }`. O resto fica nas opções. As stores continuam no estilo setup (`defineStore` com função).
- Use `this.$q`, `this.$route` e `this.$router`. Não chame `useQuasar`, `useRoute` nem `useRouter`.
- Declare o tipo de retorno de cada `computed` (`welcome(): boolean`). Sem ele, o TS perde a inferência do `this`.
- No `data()`, tipe com `as` os campos que não dá para inferir (`gender: undefined as Gender | undefined`).
- Helper importado que o template usa (ex.: `displayName`, `notificationIcon`) vira um método. O template só enxerga o que está no componente.
- Componente filho entra em `components: { ... }`.

Referência: `apps/scorely/web/src/modules/users/pages/ProfilePage.vue`.

## Regras de negócio ficam na api (scorely)

**Padrões e regras de negócio são decididos pela api. O web só mostra o que a api devolve e envia o que a pessoa escolheu.** Não copie no web um valor padrão, um limite de negócio ou uma regra para "adiantar" a api: se a tela precisa de um número, ele vem na resposta. A exceção é o que o contrato já compartilha para validar o form (`GROUP_LIMITS` e os schemas).

## Forms no painel de baixo

Todo form abre no `BottomSheet` (`src/components/BottomSheet.vue`), no padrão do editor de Abertura da lista (`modules/groups/components/LayersCard.vue`): título, uma dica curta, os campos e, no rodapé, Cancelar e a ação principal. Não crie uma tela própria nem um drawer para um form.

## Módulo novo

`web/src/modules/<mod>/` (routes, api, store, pages) → registre as rotas em `src/app/router.ts`.

## Datas e preferências (scorely)

Motivo: [docs/decisions/0006-datas-utc-fuso-do-perfil.md](../../docs/decisions/0006-datas-utc-fuso-do-perfil.md).

- Toda data na tela passa por `formatDateTime(iso, style?)` de `src/lib/datetime.ts`, que usa o idioma e o fuso efetivos. Nunca `toLocale*String` nem `Intl.DateTimeFormat` fora dele. Check: `checks/web.test.ts`. Fuso que o navegador não conhece cai no detectado; não valide fuso na leitura.
- Idioma e fuso efetivos saem de `src/lib/preferences.ts` (preferências da pessoa → último idioma do navegador → idioma do navegador; preferências → fuso detectado). O navegador guarda uma cópia das preferências em `scorely.preferences` (USR-14): o boot aplica a cópia com `applyPreferences()`; login, `loadMe`, `updateProfile` e o refresh chamam `updatePreferences(prefs)`, que só aplica e grava se mudou; o logout chama `clearSavedPreferences()` e `applyPreferences()`.
- Texto da interface sempre por `this.$t` (chaves no `pt-BR`, mesmas chaves no `en`).

## i18n e erros (scorely)

- `vue-i18n` (Composition mode, `legacy: false`), em `apps/scorely/web/src/i18n/`. `pt-BR` é o idioma base e define as chaves; os outros locales são tipados como `MessageSchema` e precisam ter as mesmas chaves. Nos componentes use `this.$t`; fora deles, `t` de `@scorely/web/src/i18n`.
- O usuário nunca vê texto do back. Traduza o erro pelo `code` com `errorMessage(err)` e os issues de validação com `issueMessage(issue, field?)` (`src/i18n/errors.ts`). Nunca mostre `err.message` nem `issue.message`.
- Validação: `validation.<campo>.<código do Zod>`, com fallback em `validation.<código do Zod>`.
- O `src/lib/http.ts` renova a sessão no 401 e no 403 sem `{ error }`.
