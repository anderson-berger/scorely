<template>
  <q-page class="q-pa-sm">
    <div class="security-page q-pa-xs">
      <div class="row q-col-gutter-md">
        <div class="col-12">
          <ProfilePasswordForm
            :form="passwordForm"
            :loading="changingPassword"
            :can-change="canChangePassword"
            @update:form="passwordForm = $event"
            @change-password="changePassword"
          />
        </div>

        <div class="col-12">
          <ProfileDangerZone
            @export-data="exportData"
            @confirm-delete-account="showDeleteDialog = true"
          />
        </div>
      </div>

      <DeleteAccountDialog
        :show="showDeleteDialog"
        :confirmation="deleteConfirmation"
        @update:show="showDeleteDialog = $event"
        @update:confirmation="deleteConfirmation = $event"
        @cancel="showDeleteDialog = false"
        @confirm="deleteAccount"
      />
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ProfilePasswordForm from 'src/pages/app/profile/profile-page/ProfilePasswordForm.vue';
import ProfileDangerZone from 'src/pages/app/profile/profile-page/ProfileDangerZone.vue';
import DeleteAccountDialog from 'src/pages/app/profile/profile-page/DeleteAccountDialog.vue';

export default defineComponent({
  name: 'SecurityPage',

  components: {
    ProfilePasswordForm,
    ProfileDangerZone,
    DeleteAccountDialog,
  },

  data() {
    return {
      passwordForm: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      },
      changingPassword: false,
      showDeleteDialog: false,
      deleteConfirmation: '',
    };
  },

  computed: {
    canChangePassword(): boolean {
      return (
        this.passwordForm.currentPassword.length > 0 &&
        this.passwordForm.newPassword.length >= 8 &&
        this.passwordForm.newPassword === this.passwordForm.confirmPassword
      );
    },
  },

  methods: {
    async changePassword() {
      this.changingPassword = true;
      try {
        // TODO: integrar com API de alteração de senha
        this.$q.notify({ type: 'positive', message: 'Senha alterada com sucesso' });
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
      } catch {
        this.$q.notify({ type: 'negative', message: 'Erro ao alterar senha' });
      } finally {
        this.changingPassword = false;
      }
    },

    exportData() {
      // TODO: integrar com API de exportação de dados
      this.$q.notify({ type: 'info', message: 'Exportação de dados será implementada em breve' });
    },

    async deleteAccount() {
      try {
        // TODO: integrar com API de exclusão de conta
        this.$q.notify({ type: 'positive', message: 'Conta excluída com sucesso' });
      } catch {
        this.$q.notify({ type: 'negative', message: 'Erro ao excluir conta' });
      } finally {
        this.showDeleteDialog = false;
        this.deleteConfirmation = '';
      }
    },
  },
});
</script>

<style scoped>
.security-page {
  max-width: 1024px;
  margin: 0 auto;
}
</style>
