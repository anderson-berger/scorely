<template>
  <div class="avatar-upload-container">
    <q-avatar :size="size" class="avatar-profile">
      <img :src="displayImage" :alt="alt" />
    </q-avatar>

    <q-btn
      round
      dense
      :color="buttonColor"
      :icon="buttonIcon"
      class="avatar-edit-btn"
      @click="triggerFileInput"
    >
      <q-tooltip>{{ tooltip }}</q-tooltip>
    </q-btn>

    <!-- Input file escondido -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleFileChange"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'AvatarUpload',

  props: {
    avatar: {
      type: String as () => string | undefined,
      default: undefined,
    },
    size: {
      type: String,
      default: '120px',
    },
    alt: {
      type: String,
      default: 'Avatar',
    },
    tooltip: {
      type: String,
      default: 'Alterar foto',
    },
    buttonColor: {
      type: String,
      default: 'primary',
    },
    buttonIcon: {
      type: String,
      default: 'photo_camera',
    },
    maxSize: {
      type: Number,
      default: 2 * 1024 * 1024, // 2MB
    },
  },

  emits: ['update:file'],

  data() {
    return {
      previewUrl: null as string | null,
      selectedFile: null as File | null,
    };
  },

  computed: {
    displayImage(): string {
      return this.previewUrl ?? this.avatar ?? 'https://cdn.quasar.dev/img/avatar.png';
    },
  },

  methods: {
    triggerFileInput() {
      (this.$refs.fileInput as HTMLInputElement | undefined)?.click();
    },

    handleFileChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) return;

      // Validar tipo
      if (!file.type.startsWith('image/')) {
        this.$q.notify({
          type: 'negative',
          message: 'Por favor, selecione apenas arquivos de imagem',
        });
        return;
      }

      // Validar tamanho
      if (file.size > this.maxSize) {
        const maxSizeMB = (this.maxSize / (1024 * 1024)).toFixed(1);

        this.$q.notify({
          type: 'negative',
          message: `A imagem deve ter no máximo ${maxSizeMB}MB`,
        });

        return;
      }

      this.clearPreview();

      this.previewUrl = URL.createObjectURL(file);
      this.selectedFile = file;

      this.$emit('update:file', file);

      target.value = '';
    },

    clearPreview() {
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = null;
      }
      this.selectedFile = null;
    },

    getSelectedFile(): File | null {
      return this.selectedFile;
    },

    reset() {
      this.clearPreview();
    },
  },

  beforeUnmount() {
    this.clearPreview();
  },
});
</script>

<style scoped>
.avatar-upload-container {
  position: relative;
  display: inline-block;
}

.avatar-edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.avatar-profile img {
  object-fit: cover;
}
</style>
