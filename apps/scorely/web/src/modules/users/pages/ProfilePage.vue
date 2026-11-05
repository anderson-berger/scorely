<script lang="ts">
import { type Gender, type Locale, LocaleSchema, UpdateMeInputSchema } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage, issueMessage } from '@/i18n/errors';
import { detectTimeZone } from '@/lib/datetime';
import { effectiveTimeZone } from '@/lib/preferences';
import { useAuthStore } from '../../auth/auth.store';

interface Option<T> {
  label: string;
  value: T;
}

/** Todos os fusos IANA que o navegador conhece. */
const TIME_ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

export default defineComponent({
  name: 'ProfilePage',

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
    };
  },

  computed: {
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
  },

  watch: {
    'auth.user': {
      immediate: true,
      deep: true,
      handler(u: ReturnType<typeof useAuthStore>['user']) {
        if (!u) return;
        this.name = u.name ?? '';
        this.nickname = u.nickname ?? '';
        this.gender = u.gender;
        // Sem idioma/fuso no perfil: o formulário mostra os efetivos (o idioma atual e o fuso detectado).
        this.locale = u.locale ?? (this.$i18n.locale as Locale);
        this.timeZone = effectiveTimeZone({ user: u, detected: detectTimeZone() });
      },
    },
  },

  methods: {
    filterTimeZones(input: string, update: (fn: () => void) => void) {
      const needle = input.trim().toLowerCase();
      update(() => {
        this.timeZoneOptions = needle
          ? TIME_ZONES.filter((tz) => tz.toLowerCase().includes(needle))
          : TIME_ZONES;
      });
    },

    async save() {
      const parsed = UpdateMeInputSchema.safeParse({
        name: this.name,
        nickname: this.nickname.trim() ? this.nickname : null,
        ...(this.gender && { gender: this.gender }),
        ...(this.locale && { locale: this.locale }),
        ...(this.timeZone && { timeZone: this.timeZone }),
      });
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
        if (this.welcome) await this.$router.replace({ name: 'home' });
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
  <q-page padding>
    <div class="profile">
      <div class="text-h5 q-mb-xs">{{ welcome ? $t('profile.welcomeTitle') : $t('profile.title') }}</div>
      <div v-if="welcome" class="text-body2 text-grey-7 q-mb-md">{{ $t('profile.welcomeHint') }}</div>
      <div v-else class="text-body2 text-grey-7 q-mb-md">{{ auth.user?.email }}</div>

      <q-form class="q-gutter-md" @submit.prevent="save">
        <q-input
          v-model="name"
          :label="$t('profile.name')"
          outlined
          autocomplete="name"
          :rules="[(v) => !!v?.trim() || $t('validation.name.too_small')]"
        />
        <q-input v-model="nickname" :label="$t('profile.nickname')" outlined :hint="$t('profile.nicknameHint')" />
        <div>
          <div class="text-body2 q-mb-xs">{{ $t('profile.gender') }}</div>
          <q-option-group v-model="gender" :options="genderOptions" type="radio" inline />
          <div class="text-caption text-grey-7">{{ $t('profile.genderHint') }}</div>
        </div>
        <q-select
          v-model="locale"
          :options="localeOptions"
          :label="$t('profile.language')"
          emit-value
          map-options
          outlined
        />
        <q-select
          v-model="timeZone"
          :options="timeZoneOptions"
          :label="$t('profile.timeZone')"
          :hint="$t('profile.timeZoneHint')"
          use-input
          fill-input
          hide-selected
          input-debounce="0"
          outlined
          @filter="filterTimeZones"
        />
        <q-btn
          type="submit"
          color="primary"
          :label="welcome ? $t('profile.continue') : $t('profile.save')"
          :loading="saving"
        />
      </q-form>
    </div>
  </q-page>
</template>

<style scoped>
.profile {
  max-width: 480px;
  margin: 0 auto;
}
</style>
