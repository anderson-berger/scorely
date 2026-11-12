import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import App from '@base/web/src/App.vue';
import { router } from '@base/web/src/app/router';
import { createPinia } from 'pinia';
import { Notify, Quasar } from 'quasar';
import { createApp } from 'vue';

createApp(App).use(Quasar, { plugins: { Notify } }).use(createPinia()).use(router).mount('#app');
