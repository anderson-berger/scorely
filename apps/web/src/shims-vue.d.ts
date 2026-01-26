import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import type { QVueGlobals } from 'quasar';
import type { LoadingManager } from 'src/plugins/loading';

declare module 'vue' {
  interface ComponentCustomProperties {
    $router: Router;
    $route: RouteLocationNormalizedLoaded;
    $q: QVueGlobals;
    $load: LoadingManager;
  }
}

export {};
