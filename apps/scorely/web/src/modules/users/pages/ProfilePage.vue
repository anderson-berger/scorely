<script lang="ts">
import {
  type Gender,
  type Locale,
  LocaleSchema,
  MEDIA_PURPOSES,
  UpdateMeInputSchema,
} from '@scorely/contracts';
import { safeRedirect } from '@scorely/web/src/app/guard';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { detectTimeZone } from '@scorely/web/src/lib/datetime';
import { prepareImage } from '@scorely/web/src/lib/media';
import { effectiveTimeZone } from '@scorely/web/src/lib/preferences';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { initials } from '@scorely/web/src/modules/groups/scoreboard';
import { displayName } from '@scorely/web/src/modules/users/user.display';
import { copyToClipboard } from 'quasar';
import { defineComponent } from 'vue';

interface Option<T> {
  label: string;
  value: T;
}

/** Todos os fusos IANA que o navegador conhece. */
const TIME_ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

type Editor = '' | 'you' | 'prefs';

/**
 * Perfil (USR-02, USR-03): a página mostra os dados em dois cards, e cada "Editar" abre o painel de baixo só
 * com os campos daquele card (web.md, forms no painel de baixo). No primeiro acesso, o painel "Seus dados"
 * já abre, sem fechar, e salvar segue para o destino guardado.
 */
export default defineComponent({
  name: 'ProfilePage',

  components: { BottomSheet },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      name: '',
      nickname: '',
      gender: undefined as Gender | undefined,
      locale: undefined as Locale | undefined,
      timeZone: '',
      timeZoneOptions: TIME_ZONES as readonly string[],
      saving: false,
      photoBusy: false,
      editor: '' as Editor,
    };
  },

  computed: {
    avatarInitials(): string {
      return this.auth.user ? initials(displayName(this.auth.user)) : '?';
    },

    welcome(): boolean {
      return this.$route.query.welcome === '1';
    },

    genderOptions(): Option<Gender>[] {
      return [
        { label: this.$t('profile.genderM'), value: 'M' },
        { label: this.$t('profile.genderF'), value: 'F' },
      ];
    },

    localeOptions(): Option<Locale>[] {
      return LocaleSchema.options.map((value) => ({ label: this.$t(`locales.${value}`), value }));
    },

    shownName(): string {
      return this.auth.user ? displayName(this.auth.user) : '';
    },

    genderLabel(): string {
      const g = this.auth.user?.gender;
      return g ? this.$t(`profile.gender${g}`) : this.$t('profile.genderUnset');
    },

    localeLabel(): string {
      return this.$t(`locales.${this.auth.user?.preferences.locale ?? (this.$i18n.locale as Locale)}`);
    },

    timeZoneLabel(): string {
      return this.auth.user
        ? effectiveTimeZone({ user: this.auth.user.preferences, detected: detectTimeZone() })
        : '';
    },

    youOpen: {
      get(): boolean {
        return this.editor === 'you';
      },
      set(open: boolean) {
        if (!open) this.editor = '';
      },
    },

    prefsOpen: {
      get(): boolean {
        return this.editor === 'prefs';
      },
      set(open: boolean) {
        if (!open) this.editor = '';
      },
    },
  },

  watch: {
    /** Primeiro acesso (USR-02): o painel "Seus dados" abre sozinho assim que o usuário carrega. */
    'auth.user': {
      immediate: true,
      handler(u: ReturnType<typeof useAuthStore>['user']) {
        if (u && this.welcome && !this.editor) this.edit('you');
      },
    },
  },

  methods: {
    /** USR-15: copia o código de amigo (o id público). */
    async copyCode() {
      if (!this.auth.user) return;
      try {
        await copyToClipboard(this.auth.user.id);
        this.$q.notify({ type: 'positive', message: this.$t('profile.codeCopied') });
      } catch {
        // Navegador sem permissão de área de transferência: o código continua na tela para copiar à mão.
        this.$q.notify({ type: 'warning', message: this.$t('profile.copyFailed') });
      }
    },

    /** Abre um painel com o rascunho a partir do perfil atual. */
    edit(editor: Exclude<Editor, ''>) {
      const u = this.auth.user;
      if (!u) return;
      this.name = u.name ?? '';
      this.nickname = u.nickname ?? '';
      this.gender = u.gender;
      // Sem idioma/fuso nas preferências: o painel mostra os efetivos (o idioma atual e o fuso detectado).
      this.locale = u.preferences.locale ?? (this.$i18n.locale as Locale);
      this.timeZone = effectiveTimeZone({ user: u.preferences, detected: detectTimeZone() });
      this.timeZoneOptions = TIME_ZONES;
      this.editor = editor;
    },

    pickPhoto() {
      (this.$refs.photoInput as HTMLInputElement | undefined)?.click();
    },

    async onPhotoPicked(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      this.photoBusy = true;
      try {
        // MID-03: recorta e reduz no navegador (tamanho da finalidade `avatar`): a foto do celular vira poucos KB.
        const blob = await prepareImage(file, MEDIA_PURPOSES.avatar).catch(() => {
          throw new Error('unreadable');
        });
        await this.auth.setAvatar(blob);
        this.$q.notify({ type: 'positive', message: this.$t('profile.photoSaved') });
      } catch (err) {
        const unreadable = err instanceof Error && err.message === 'unreadable';
        this.$q.notify({
          type: 'negative',
          message: unreadable ? this.$t('profile.photoUnreadable') : errorMessage(err),
        });
      } finally {
        this.photoBusy = false;
      }
    },

    async removePhoto() {
      this.photoBusy = true;
      try {
        await this.auth.setAvatar(null);
        this.$q.notify({ type: 'positive', message: this.$t('profile.photoRemoved') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.photoBusy = false;
      }
    },

    filterTimeZones(input: string, update: (fn: () => void) => void) {
      const needle = input.trim().toLowerCase();
      update(() => {
        this.timeZoneOptions = needle
          ? TIME_ZONES.filter((tz) => tz.toLowerCase().includes(needle))
          : TIME_ZONES;
      });
    },

    /**
     * Cada painel manda só os seus campos no `PATCH /me` (USR-03): "Seus dados" leva o que é do perfil (nome, apelido,
     * gênero); "Preferências", o idioma e o fuso.
     */
    async save() {
      // No primeiro acesso, "Seus dados" também grava o idioma e o fuso detectados (como antes do painel).
      const you = {
        name: this.name,
        nickname: this.nickname.trim() ? this.nickname : null,
        ...(this.gender && { gender: this.gender }),
      };
      const fields =
        this.editor === 'you'
          ? { ...you, ...(this.welcome && { locale: this.locale, timeZone: this.timeZone }) }
          : {
              ...(this.locale && { locale: this.locale }),
              ...(this.timeZone && { timeZone: this.timeZone }),
            };
      const parsed = UpdateMeInputSchema.safeParse(fields);
      if (!parsed.success) {
        return this.$q.notify({
          type: 'warning',
          message: issueMessage(parsed.error.issues[0]),
        });
      }
      this.saving = true;
      try {
        // O store aplica o idioma e o fuso na hora: a tela já responde no idioma novo.
        await this.auth.updateProfile(parsed.data);
        this.$q.notify({ type: 'positive', message: this.$t('profile.saved') });
        this.editor = '';
        if (this.welcome) await this.$router.replace(safeRedirect(this.$route.query.redirect));
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page">
      <h1 class="sc-title q-mt-md">{{ welcome ? $t('profile.welcomeTitle') : $t('profile.title') }}</h1>
      <div v-if="welcome" class="lead">{{ $t('profile.welcomeHint') }}</div>

      <div v-if="auth.user" class="cards">
        <section class="sc-card card" :aria-label="$t('profile.you')">
          <div class="card-head">
            <h2 class="sc-section">{{ $t('profile.you') }}</h2>
            <q-btn flat no-caps color="primary" class="edit" :label="$t('profile.edit')" @click="edit('you')" />
          </div>

          <div class="who">
            <div class="avatar">
              <img v-if="auth.user.avatarUrl" :src="auth.user.avatarUrl" :alt="$t('profile.photo')" />
              <span v-else aria-hidden="true">{{ avatarInitials }}</span>
              <q-inner-loading :showing="photoBusy" />
            </div>
            <div class="who-text">
              <div class="sc-display who-name">{{ shownName }}</div>
              <div v-if="auth.user.nickname && auth.user.name" class="sc-caption">{{ auth.user.name }}</div>
              <div class="sc-caption">{{ auth.user.email }}</div>
            </div>
          </div>

          <div class="photo-actions">
            <q-btn outline no-caps color="primary" :label="$t('profile.changePhoto')" :disable="photoBusy" @click="pickPhoto" />
            <q-btn
              v-if="auth.user.avatarUrl"
              flat
              no-caps
              color="negative"
              :label="$t('profile.removePhoto')"
              :disable="photoBusy"
              @click="removePhoto"
            />
          </div>
          <input ref="photoInput" type="file" accept="image/*" hidden @change="onPhotoPicked" />

          <dl class="rows">
            <div class="row">
              <dt class="sc-label">{{ $t('profile.gender') }}</dt>
              <dd>{{ genderLabel }}</dd>
            </div>
          </dl>

          <div class="friend-code">
            <div>
              <div class="sc-label">{{ $t('profile.friendCode') }}</div>
              <div class="code">{{ auth.user.id }}</div>
              <div class="sc-caption">{{ $t('profile.friendCodeHint') }}</div>
            </div>
            <q-btn flat round color="primary" icon="content_copy" :aria-label="$t('profile.copyCode')" @click="copyCode">
              <q-tooltip>{{ $t('profile.copyCode') }}</q-tooltip>
            </q-btn>
          </div>
        </section>

        <section class="sc-card card" :aria-label="$t('profile.preferences')">
          <div class="card-head">
            <h2 class="sc-section">{{ $t('profile.preferences') }}</h2>
            <q-btn flat no-caps color="primary" class="edit" :label="$t('profile.edit')" @click="edit('prefs')" />
          </div>
          <dl class="rows">
            <div class="row">
              <dt class="sc-label">{{ $t('profile.language') }}</dt>
              <dd>{{ localeLabel }}</dd>
            </div>
            <div class="row">
              <dt class="sc-label">{{ $t('profile.timeZone') }}</dt>
              <dd>{{ timeZoneLabel }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>

    <BottomSheet v-model="youOpen" :title="$t('profile.editYou')" :persistent="welcome || saving">
      <div class="sc-caption q-mt-xs">{{ welcome ? $t('profile.welcomeHint') : $t('profile.nicknameHint') }}</div>
      <q-form class="fields" @submit.prevent="save">
        <div>
          <label for="profile-name" class="sc-label field-label">{{ $t('profile.name') }}</label>
          <q-input
            v-model="name"
            for="profile-name"
            outlined
            autofocus
            autocomplete="name"
            :rules="[(v) => !!v?.trim() || $t('validation.name.too_small')]"
          />
        </div>
        <div>
          <label for="profile-nickname" class="sc-label field-label">{{ $t('profile.nickname') }}</label>
          <q-input v-model="nickname" for="profile-nickname" outlined />
        </div>
        <fieldset class="group">
          <legend class="sc-label field-label">{{ $t('profile.gender') }}</legend>
          <div class="choices">
            <button
              v-for="g in genderOptions"
              :key="g.value"
              type="button"
              class="choice"
              :class="{ 'choice--on': gender === g.value }"
              :aria-pressed="gender === g.value"
              @click="gender = g.value"
            >
              {{ g.label }}
            </button>
          </div>
          <div class="sc-caption q-mt-xs">{{ $t('profile.genderHint') }}</div>
        </fieldset>
        <div class="actions" :class="{ 'actions--one': welcome }">
          <q-btn v-if="!welcome" flat no-caps class="sc-btn-outline" :label="$t('profile.cancel')" :disable="saving" @click="editor = ''" />
          <q-btn
            type="submit"
            color="primary"
            unelevated
            class="sc-btn-main"
            :label="welcome ? $t('profile.continue') : $t('profile.save')"
            :loading="saving"
          />
        </div>
      </q-form>
    </BottomSheet>

    <BottomSheet v-model="prefsOpen" :title="$t('profile.preferences')" :persistent="saving">
      <div class="sc-caption q-mt-xs">{{ $t('profile.preferencesHint') }}</div>
      <q-form class="fields" @submit.prevent="save">
        <div>
          <label for="profile-locale" class="sc-label field-label">{{ $t('profile.language') }}</label>
          <q-select v-model="locale" for="profile-locale" :options="localeOptions" emit-value map-options outlined />
        </div>
        <div>
          <label for="profile-tz" class="sc-label field-label">{{ $t('profile.timeZone') }}</label>
          <q-select
            v-model="timeZone"
            for="profile-tz"
            :options="timeZoneOptions"
            use-input
            fill-input
            hide-selected
            input-debounce="0"
            outlined
            @filter="filterTimeZones"
          />
          <div class="sc-caption q-mt-xs">{{ $t('profile.timeZoneHint') }}</div>
        </div>
        <div class="actions">
          <q-btn flat no-caps class="sc-btn-outline" :label="$t('profile.cancel')" :disable="saving" @click="editor = ''" />
          <q-btn type="submit" color="primary" unelevated class="sc-btn-main" :label="$t('profile.save')" :loading="saving" />
        </div>
      </q-form>
    </BottomSheet>
  </q-page>
</template>

<style scoped>
.avatar {
  position: relative;
  width: 88px;
  height: 88px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--sc-accent-soft);
  color: var(--sc-accent);
  font: 700 28px var(--sc-font-body);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cards {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

@media (min-width: 1024px) {
  .cards {
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    align-items: start;
  }
}

.card {
  padding: 16px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-head .sc-section {
  margin: 0;
}

.edit {
  min-height: 44px;
}

.who {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.who-text {
  min-width: 0;
}

.who-name {
  font-size: 26px;
  line-height: 1.1;
}

.rows {
  margin: 8px 0 0;
}

.friend-code {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--sc-line);
}

/* Logo depois da linha do gênero: a linha já tem o respiro de baixo. */
.rows + .friend-code {
  margin-top: 4px;
}

.friend-code .code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.25rem;
  letter-spacing: 0.12em;
  color: var(--sc-text);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sc-line);
}

.row:last-child {
  border-bottom: 0;
}

.row dd {
  margin: 0;
  text-align: right;
  color: var(--sc-text);
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.actions--one {
  grid-template-columns: 1fr;
}

.photo-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lead {
  font-size: 15px;
  color: var(--sc-text-2);
  margin-top: 8px;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 16px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  padding: 0;
}

.group {
  border: 0;
  margin: 0;
  padding: 0;
}

.choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.choice {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--sc-line-strong);
  background: var(--sc-surface);
  color: var(--sc-text);
  font: 600 15px var(--sc-font-body);
  cursor: pointer;
}

.choice--on {
  background: var(--sc-accent-soft);
  border-color: var(--sc-accent);
  color: var(--sc-accent);
}
</style>
