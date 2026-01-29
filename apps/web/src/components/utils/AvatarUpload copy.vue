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
    modelValue: {
      type: String,
      default: '',
    },
    defaultAvatar: {
      type: String,
      default: 'https://cdn.quasar.dev/img/avatar.png',
    },
    size: {
      type: String,
      default: '120px',
    },
    buttonColor: {
      type: String,
      default: 'primary',
    },
    buttonIcon: {
      type: String,
      default: 'photo_camera',
    },
    tooltip: {
      type: String,
      default: 'Alterar foto',
    },
    alt: {
      type: String,
      default: 'Avatar',
    },
    maxSize: {
      type: Number,
      default: 5 * 1024 * 1024, // 5MB
    },
  },

  emits: ['update:modelValue', 'file-selected', 'error'],

  data() {
    return {
      previewUrl: null as string | null,
      selectedFile: null as File | null,
    };
  },

  computed: {
    displayImage(): string {
      if (this.previewUrl) return this.previewUrl;
      if (this.modelValue) return this.modelValue;
      return this.defaultAvatar;
    },
  },

  beforeUnmount() {
    this.clearPreview();
  },

  methods: {
    triggerFileInput() {
      const input = this.$refs.fileInput as HTMLInputElement;
      input?.click();
    },

    handleFileChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) return;

      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        this.$emit('error', {
          type: 'invalid-type',
          message: 'Por favor, selecione apenas arquivos de imagem',
        });
        return;
      }

      // Validar tamanho
      if (file.size > this.maxSize) {
        const maxSizeMB = (this.maxSize / (1024 * 1024)).toFixed(1);
        this.$emit('error', {
          type: 'file-too-large',
          message: `A imagem deve ter no máximo ${maxSizeMB}MB`,
        });
        return;
      }

      // Limpar preview anterior
      this.clearPreview();

      // Criar preview URL
      this.previewUrl = URL.createObjectURL(file);
      this.selectedFile = file;

      // Emitir o arquivo para o componente pai
      this.$emit('file-selected', file);

      // Limpar o input para permitir selecionar o mesmo arquivo novamente
      target.value = '';
    },

    clearPreview() {
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = null;
      }
      this.selectedFile = null;
    },

    // Método público para pegar o arquivo selecionado
    getSelectedFile(): File | null {
      return this.selectedFile;
    },

    // Método público para resetar o componente
    reset() {
      this.clearPreview();
      this.$emit('update:modelValue', '');
    },
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
