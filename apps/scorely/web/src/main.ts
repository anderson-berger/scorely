import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import '@scorely/web/src/css/app.scss';
import App from '@scorely/web/src/App.vue';
import { router } from '@scorely/web/src/app/router';
import { i18n } from '@scorely/web/src/i18n';
import { onSessionExpired } from '@scorely/web/src/lib/http';
import { applyPreferences } from '@scorely/web/src/lib/preferences';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { useNotificationsStore } from '@scorely/web/src/modules/notifications/notifications.store';
import { createPinia } from 'pinia';
import { Dialog, Notify, Quasar } from 'quasar';
import { createApp } from 'vue';

const app = createApp(App)
  .use(Quasar, {
    plugins: { Notify, Dialog },
    // Tema escuro só (plano 008, D1); avisos com texto escuro sobre as cores claras do tema.
    config: { dark: true, notify: { textColor: 'dark' } },
  })
  .use(createPinia())
  .use(router)
  .use(i18n);

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
