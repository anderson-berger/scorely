import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import { createPinia } from 'pinia';
import { Notify, Quasar } from 'quasar';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './app/router';

createApp(App).use(Quasar, { plugins: { Notify } }).use(createPinia()).use(router).mount('#app');
