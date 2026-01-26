// src/boot/loading.ts
import { boot } from 'quasar/wrappers';
import loadingPlugin, { loadingManager } from 'src/plugins/loading';

export default boot(({ app }) => {
  app.use(loadingPlugin);
});

export { loadingManager };
