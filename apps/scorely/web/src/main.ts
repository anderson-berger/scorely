import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import { createPinia } from 'pinia';
import { Notify, Quasar } from 'quasar';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './app/router';
import { i18n } from './i18n';
import { onSessionExpired } from './lib/http';
import { applyPreferences } from './lib/preferences';
import { useAuthStore } from './modules/auth/auth.store';
import { useNotificationsStore } from './modules/notifications/notifications.store';

const app = createApp(App).use(Quasar, { plugins: { Notify } }).use(createPinia()).use(router).use(i18n);

// Refresh token inválido/expirado: limpa o estado e volta para o login.
onSessionExpired(() => {
  useNotificationsStore().reset();
  useAuthStore().reset();
  const redirect = router.currentRoute.value.fullPath;
  void router.replace({ name: 'login', query: redirect !== '/' ? { redirect } : {} });
});

// Antes do login: idioma salvo neste navegador ou o do navegador; fuso detectado. O perfil sobrescreve no loadMe.
applyPreferences();
app.mount('#app');
