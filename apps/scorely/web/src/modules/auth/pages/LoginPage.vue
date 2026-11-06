<script lang="ts">
import { CodeSchema, EmailSchema, ErrorDetailsSchemas } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { safeRedirect } from '@/app/guard';
import { errorMessage, issueMessage } from '@/i18n/errors';
import { ApiRequestError } from '@/lib/http';
import { authApi } from '../auth.api';
import { useAuthStore } from '../auth.store';

export default defineComponent({
  name: 'LoginPage',

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      step: 'email' as 'email' | 'code',
      email: '',
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

    async sendCode() {
      const parsed = EmailSchema.safeParse(this.email);
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0], 'email') });
      }
      this.loading = true;
      try {
        const result = await authApi.requestCode(parsed.data);
        this.email = parsed.data;
        this.code = '';
        this.step = 'code';
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
        // Conta nova passa pelo perfil e depois segue para onde ia (ex.: o link de convite).
        if (!result.user.name) {
          return this.$router.replace({ name: 'profile', query: { welcome: '1', redirect } });
        }
        return this.$router.replace(redirect);
      } catch (err) {
        this.fail(err);
      } finally {
        this.loading = false;
      }
    },

    changeEmail() {
      this.step = 'email';
      this.code = '';
    },
  },
});
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center q-pa-md">
        <q-card flat bordered class="login-card">
          <q-card-section>
            <div class="text-h5 text-weight-bold">{{ $t('app.name') }}</div>
            <div class="text-body2 text-grey-7">{{ $t('login.tagline') }}</div>
          </q-card-section>

          <q-card-section v-if="step === 'email'">
            <q-form @submit.prevent="sendCode">
              <q-input
                v-model="email"
                type="email"
                :label="$t('login.email')"
                autocomplete="email"
                outlined
                autofocus
                :disable="loading"
              />
              <q-btn type="submit" color="primary" :label="$t('login.sendCode')" class="full-width q-mt-md" :loading="loading" />
            </q-form>
          </q-card-section>

          <q-card-section v-else>
            <div class="text-body2 q-mb-md">
              {{ $t('login.codeSent') }} <strong>{{ email }}</strong>.
            </div>
            <q-form @submit.prevent="verify">
              <q-input
                v-model="code"
                :label="$t('login.code')"
                inputmode="numeric"
                autocomplete="one-time-code"
                mask="######"
                outlined
                autofocus
                :disable="loading"
                input-class="text-h6 text-center code-input"
              />
              <q-btn type="submit" color="primary" :label="$t('login.enter')" class="full-width q-mt-md" :loading="loading" />
            </q-form>
            <div class="row justify-between q-mt-sm">
              <q-btn flat dense no-caps :label="$t('login.changeEmail')" @click="changeEmail" />
              <q-btn
                flat
                dense
                no-caps
                :disable="!canResend"
                :label="resendIn > 0 ? $t('login.resendIn', { seconds: resendIn }) : $t('login.resend')"
                @click="sendCode"
              />
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 380px;
}
:deep(.code-input) {
  letter-spacing: 0.5em;
}
</style>
