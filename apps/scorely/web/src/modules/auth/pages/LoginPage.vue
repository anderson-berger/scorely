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
        <div class="court" aria-hidden="true"><span class="mid" /><span class="circle" /></div>

        <div class="hero">
          <h1 class="sc-display brand">score<span class="sc-accent">ly</span></h1>
          <div class="tagline">{{ $t('login.tagline') }}</div>
        </div>

        <div class="form">
          <login-email-step v-if="step === 'email'" :initial-email="email" @sent="onSent" />
          <login-code-step
            v-else
            :email="email"
            :resend-in-seconds="resendInSeconds"
            @change-email="step = 'email'"
          />
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
</style>
