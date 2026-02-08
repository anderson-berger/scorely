<template>
  <q-page class="q-pa-sm">
    <div v-if="originalUser && userDraft" class="perfil-page q-pa-xs">
      <div class="row q-col-gutter-xs">
        <div class="col-12">
          <ProfilePersonalDataForm
            :user="userDraft"
            :original-user="originalUser"
            :has-changes="hasChanges"
            :avatar-file="avatarFile"
            @update:user="userDraft = $event"
            @update:avatar-file="avatarFile = $event"
            @save="saveUser"
          />
        </div>

        <!-- <div class="col-12">
        <ProfilePasswordForm
          :form="passwordForm"
          :loading="changingPassword"
          :can-change="canChangePassword"
          @update:form="passwordForm = $event"
          @change-password="changePassword"
        />
      </div>

      <div class="col-12">
        <ProfilePreferences
          :preferences="preferences"
          @update:preferences="preferences = $event"
          @toggle-dark-mode="toggleDarkMode"
        />
      </div>

      <div class="col-12">
        <ProfileDangerZone
          @export-data="exportData"
          @confirm-delete-account="confirmDeleteAccount"
        />
      </div> -->
      </div>

      <!-- <DeleteAccountDialog
      :show="showDeleteDialog"
      :confirmation="deleteConfirmation"
      @update:show="showDeleteDialog = $event"
      @update:confirmation="deleteConfirmation = $event"
      @cancel="showDeleteDialog = false"
      @confirm="deleteAccount"
    />  -->
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ProfilePersonalDataForm from 'src/pages/app/perfil/perfil-page/ProfilePersonalDataForm.vue';
import UserContext from 'src/services/context/UserContext';
import FileService from 'src/services/api/FileService';
import UserService from 'src/services/api/UserService';
import type { User } from '@scorely/api/modules/user/user.schemas';

export default defineComponent({
  name: 'PerfilPage',

  components: { ProfilePersonalDataForm },

  data() {
    return {
      originalUser: undefined as User | undefined,
      userDraft: undefined as User | undefined,
      avatarFile: undefined as File | undefined,
    };
  },

  computed: {
    hasChanges(): boolean {
      if (!this.originalUser || !this.userDraft) return false;

      // Mudança no avatar
      if (this.avatarFile) return true;

      // Mudanças nos campos
      return JSON.stringify(this.originalUser) !== JSON.stringify(this.userDraft);
    },
  },

  methods: {
    async saveUser() {
      await this.$load.execute('save-user', async () => {
        if (!this.userDraft) return;

        // Upload do avatar se houver
        if (this.avatarFile) {
          const key = await FileService.uploadFile(this.avatarFile);
          this.userDraft.avatar = key;
        }

        // Só atualiza se tiver mudanças
        if (!this.hasChanges) return;

        // Atualiza no backend
        await UserService.update(this.userDraft);

        // Atualiza o contexto global
        await this.loadUser();
      });
    },

    async loadUser() {
      await this.$load.execute('load-perfil-page', async () => {
        await UserContext.load(true);
        const user = UserContext.get();
        if (!user) return;

        this.originalUser = structuredClone(user);
        this.userDraft = structuredClone(user);
        this.avatarFile = undefined;
      });
    },
  },

  async created() {
    this.$q.loadingBar.start();
    await this.loadUser();
    this.$q.loadingBar.stop();
  },
});
</script>

<style scoped>
.perfil-page {
  max-width: 1024px; /* ajuste aqui: 720 / 900 / 1024 */
  margin: 0 auto; /* centraliza */
}
</style>
