<script lang="ts">
import { CodeSchema, ErrorDetailsSchemas } from '@scorely/contracts';
import { safeRedirect } from '@scorely/web/src/app/guard';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { authApi } from '@scorely/web/src/modules/auth/auth.api';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LoginCodeStep',

  props: {
    email: { type: String, required: true },
    resendInSeconds: { type: Number, required: true },
  },

  emits: {
    'change-email': () => true,
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      code: '',
      loading: false,
      resendIn: 0,
      timer: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },

  computed: {
    canResend(): boolean {
      return this.resendIn === 0 && !this.loading;
    },
  },

  mounted() {
    this.startCountdown(this.resendInSeconds);
  },

  beforeUnmount() {
    clearInterval(this.timer);
  },

  methods: {
    startCountdown(seconds: number) {
      this.resendIn = seconds;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.resendIn = Math.max(0, this.resendIn - 1);
        if (this.resendIn === 0) clearInterval(this.timer);
      }, 1000);
    },

    fail(err: unknown) {
      this.$q.notify({ type: 'negative', message: errorMessage(err) });
    },

    async resend() {
      this.loading = true;
      try {
        const result = await authApi.requestCode(this.email);
        this.code = '';
        this.startCountdown(result.resendInSeconds);
      } catch (err) {
        // A api diz quanto falta: o botão de reenviar já mostra a contagem certa.
        if (err instanceof ApiRequestError && err.code === 'AUTH_CODE_COOLDOWN') {
          const parsed = ErrorDetailsSchemas.AUTH_CODE_COOLDOWN.safeParse(err.details);
          if (parsed.success) this.startCountdown(parsed.data.retryInSeconds);
        }
        this.fail(err);
      } finally {
        this.loading = false;
      }
    },

    async verify() {
      const parsed = CodeSchema.safeParse(this.code);
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0], 'code') });
      }
      this.loading = true;
      try {
        const result = await this.auth.login(this.email, parsed.data);
        const redirect = safeRedirect(this.$route.query.redirect);
        // AUTH-13: apelido ainda igual ao código (USR-02) passa pelo perfil e depois segue para onde ia (ex.: o convite).
        if (result.user.nickname === result.user.id) {
          return this.$router.replace({ name: 'profile', query: { welcome: '1', redirect } });
        }
        return this.$router.replace(redirect);
      } catch (err) {
        this.fail(err);
      } finally {
        this.loading = false;
      }
    },
  },
});
</script>

<template>
  <div>
    <div class="sent">
      {{ $t('login.codeSent') }} <strong>{{ email }}</strong>.
    </div>
    <q-form @submit.prevent="verify">
      <label for="login-code" class="sc-label field-label">{{ $t('login.code') }}</label>
      <q-input
        v-model="code"
        for="login-code"
        inputmode="numeric"
        autocomplete="one-time-code"
        mask="######"
        outlined
        autofocus
        :disable="loading"
        input-class="code-input"
      />
      <q-btn
        type="submit"
        color="primary"
        unelevated
        class="full-width sc-btn-main q-mt-md"
        :label="$t('login.enter')"
        :loading="loading"
      />
    </q-form>
    <div class="row justify-between q-mt-md">
      <q-btn flat no-caps class="link" :label="$t('login.changeEmail')" @click="$emit('change-email')" />
      <q-btn
        flat
        no-caps
        class="link"
        :disable="!canResend"
        :label="resendIn > 0 ? $t('login.resendIn', { seconds: resendIn }) : $t('login.resend')"
        @click="resend"
      />
    </div>
  </div>
</template>

<style scoped>
.field-label {
  display: block;
  margin-bottom: 8px;
}

.sent {
  font-size: 15px;
  color: var(--sc-text-2);
  margin-bottom: 14px;
}

.sent strong {
  color: var(--sc-text);
  font-weight: 600;
}

:deep(.code-input) {
  font-family: var(--sc-font-display);
  font-weight: 700;
  font-size: 32px;
  letter-spacing: 10px;
  text-align: center;
}

.link {
  color: var(--sc-text-2);
}
</style>
