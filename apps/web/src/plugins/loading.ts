// src/plugins/loading.ts
import { reactive } from 'vue';
import type { App } from 'vue';

interface LoadingState {
  [key: string]: boolean;
}

class LoadingManager {
  private state: LoadingState = reactive({});

  isLoading(key: string): boolean {
    return this.state[key] || false;
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.state[key] = true;
    try {
      return await fn();
    } finally {
      this.state[key] = false;
    }
  }

  setLoading(key: string, value: boolean) {
    this.state[key] = value;
  }
}

const loadingManager = new LoadingManager();

export default {
  install(app: App) {
    app.config.globalProperties.$load = loadingManager;
  },
};

export { loadingManager, LoadingManager };
