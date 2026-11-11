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
      <q-page class="login">
        <div class="court" aria-hidden="true"><span class="mid" /><span class="circle" /></div>

        <div class="hero">
          <h1 class="sc-display brand">score<span class="sc-accent">ly</span></h1>
          <div class="tagline">{{ $t('login.tagline') }}</div>
        </div>

        <div class="form">
          <q-form v-if="step === 'email'" @submit.prevent="sendCode">
            <label for="login-email" class="sc-label field-label">{{ $t('login.email') }}</label>
            <q-input
              v-model="email"
              for="login-email"
              type="email"
              autocomplete="email"
              outlined
              autofocus
              :disable="loading"
            />
            <q-btn
              type="submit"
              color="primary"
              unelevated
              class="full-width sc-btn-main q-mt-md"
              :label="$t('login.sendCode')"
              :loading="loading"
            />
            <div class="sc-caption text-center q-mt-sm">{{ $t('login.noPassword') }}</div>
          </q-form>

          <template v-else>
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
            <div class="row justify-between q-mt-xs">
              <q-btn flat no-caps class="link" :label="$t('login.changeEmail')" @click="changeEmail" />
              <q-btn
                flat
                no-caps
                class="link"
                :disable="!canResend"
                :label="resendIn > 0 ? $t('login.resendIn', { seconds: resendIn }) : $t('login.resend')"
                @click="sendCode"
              />
            </div>
          </template>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.login {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 16px 28px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.court {
  position: absolute;
  left: -60px;
  right: -60px;
  top: 120px;
  height: 300px;
  border: 2px solid var(--sc-surface-2);
  border-radius: 4px;
  pointer-events: none;
}

.mid {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--sc-surface-2);
}

.circle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border: 2px solid var(--sc-surface-2);
  border-radius: 50%;
}

.hero {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
}

.brand {
  font-size: 72px;
  font-weight: 800;
  line-height: 0.85;
  letter-spacing: 1px;
  margin: 0;
}

.tagline {
  font-size: 16px;
  color: var(--sc-text-2);
  margin-top: 10px;
}

.form {
  position: relative;
}

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
  min-height: 44px;
  color: var(--sc-text-2);
}
</style>
