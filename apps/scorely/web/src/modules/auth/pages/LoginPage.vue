<script lang="ts">
import LoginCodeStep from '@scorely/web/src/modules/auth/components/LoginCodeStep.vue';
import LoginEmailStep from '@scorely/web/src/modules/auth/components/LoginEmailStep.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LoginPage',

  components: { LoginEmailStep, LoginCodeStep },

  data() {
    return {
      step: 'email' as 'email' | 'code',
      email: '',
      resendInSeconds: 0,
    };
  },

  methods: {
    onSent(email: string, resendInSeconds: number) {
      this.email = email;
      this.resendInSeconds = resendInSeconds;
      this.step = 'code';
    },
  },
});
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="login">
        <section class="brand-side">
          <div class="brand-inner">
            <div class="court" aria-hidden="true"><span class="mid" /><span class="circle" /></div>
            <h1 class="sc-display brand">score<span class="sc-accent">ly</span></h1>
            <div class="tagline">{{ $t('login.tagline') }}</div>
          </div>
        </section>

        <section class="form-side">
          <div class="form">
            <login-email-step v-if="step === 'email'" :initial-email="email" @sent="onSent" />
            <login-code-step
              v-else
              :email="email"
              :resend-in-seconds="resendInSeconds"
              @change-email="step = 'email'"
            />
          </div>
        </section>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
/* Login (web-visual.md): uma coluna até 1023px; tela dividida (marca | form) a partir de 1024px. */
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 32px 16px;
}

.brand-side {
  text-align: center;
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

.court {
  display: none;
}

.form-side {
  width: 100%;
  display: flex;
  justify-content: center;
}

.form {
  width: 100%;
  max-width: 400px;
}

@media (min-width: 1024px) {
  .login {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    padding: 0;
  }

  .brand-side {
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px;
    text-align: left;
    background: var(--sc-surface);
    border-right: 1px solid var(--sc-line);
  }

  .brand-inner {
    width: 100%;
    max-width: 440px;
  }

  /* Quadra inteira, proporção 2:1, acima da marca. */
  .court {
    display: block;
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 1;
    margin-bottom: 40px;
    border: 2px solid var(--sc-line-strong);
    border-radius: 4px;
  }

  .mid {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--sc-line-strong);
  }

  .circle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 30%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border: 2px solid var(--sc-line-strong);
    border-radius: 50%;
  }

  .brand {
    font-size: 96px;
  }

  .tagline {
    font-size: 18px;
    margin-top: 14px;
  }

  .form-side {
    padding: 64px;
  }

  .form {
    max-width: 360px;
  }
}
</style>
