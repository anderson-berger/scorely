<template>
  <div class="perfil-page q-pa-lg">
    <h4 class="text-h5 q-mt-none q-mb-lg">Meu Perfil</h4>

    <div class="row q-col-gutter-lg">
      <!-- Coluna esquerda: Avatar e info básica -->
      <div class="col-12 col-md-4">
        <q-card dark class="card-dark">
          <q-card-section class="text-center">
            <!-- Avatar com upload -->
            <div class="avatar-container q-mb-md">
              <q-avatar size="120px" class="avatar-profile">
                <img :src="user.avatar || defaultAvatar" />
              </q-avatar>
              <q-btn
                round
                dense
                color="primary"
                icon="photo_camera"
                class="avatar-edit-btn"
                @click="changeAvatar"
              >
                <q-tooltip>Alterar foto</q-tooltip>
              </q-btn>
            </div>

            <div class="text-h6">{{ user.name }}</div>
            <div class="text-grey-5">{{ user.email }}</div>

            <q-separator dark class="q-my-md" />

            <div class="text-left">
              <div class="row items-center q-mb-sm">
                <q-icon name="event" size="20px" class="q-mr-sm text-grey-5" />
                <span class="text-grey-4">Membro desde {{ user.createdAt }}</span>
              </div>
              <div class="row items-center">
                <q-icon name="groups" size="20px" class="q-mr-sm text-grey-5" />
                <span class="text-grey-4">{{ user.teamsCount }} times</span>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Coluna direita: Formulários -->
      <div class="col-12 col-md-8">
        <!-- Dados Pessoais -->
        <q-card dark class="card-dark q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Dados Pessoais</div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.name"
                  dark
                  filled
                  label="Nome completo"
                  :rules="[(v) => !!v || 'Nome é obrigatório']"
                />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.nickname"
                  dark
                  filled
                  label="Nickname / Gamertag"
                  hint="Como você quer ser chamado"
                />
              </div>

              <div class="col-12">
                <q-input v-model="form.email" dark filled label="E-mail" type="email" disable />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.phone"
                  dark
                  filled
                  label="Telefone"
                  mask="(##) #####-####"
                />
              </div>

              <div class="col-12 col-sm-6">
                <q-input v-model="form.birthdate" dark filled label="Data de nascimento" type="date">
                  <template v-slot:prepend>
                    <q-icon name="event" />
                  </template>
                </q-input>
              </div>

              <div class="col-12">
                <q-input
                  v-model="form.bio"
                  dark
                  filled
                  label="Bio"
                  type="textarea"
                  rows="3"
                  hint="Fale um pouco sobre você"
                  counter
                  maxlength="200"
                />
              </div>
            </div>

            <div class="row justify-end q-mt-md">
              <q-btn
                color="primary"
                label="Salvar alterações"
                :loading="saving"
                @click="saveProfile"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Alterar Senha -->
        <q-card dark class="card-dark q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Alterar Senha</div>

            <div class="row q-col-gutter-md">
              <div class="col-12">
                <q-input
                  v-model="passwordForm.currentPassword"
                  dark
                  filled
                  label="Senha atual"
                  :type="showCurrentPassword ? 'text' : 'password'"
                >
                  <template v-slot:append>
                    <q-icon
                      :name="showCurrentPassword ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showCurrentPassword = !showCurrentPassword"
                    />
                  </template>
                </q-input>
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="passwordForm.newPassword"
                  dark
                  filled
                  label="Nova senha"
                  :type="showNewPassword ? 'text' : 'password'"
                  :rules="[
                    (v) => !v || v.length >= 8 || 'Mínimo 8 caracteres',
                  ]"
                >
                  <template v-slot:append>
                    <q-icon
                      :name="showNewPassword ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showNewPassword = !showNewPassword"
                    />
                  </template>
                </q-input>
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="passwordForm.confirmPassword"
                  dark
                  filled
                  label="Confirmar nova senha"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  :rules="[
                    (v) => v === passwordForm.newPassword || 'Senhas não conferem',
                  ]"
                >
                  <template v-slot:append>
                    <q-icon
                      :name="showConfirmPassword ? 'visibility_off' : 'visibility'"
                      class="cursor-pointer"
                      @click="showConfirmPassword = !showConfirmPassword"
                    />
                  </template>
                </q-input>
              </div>
            </div>

            <div class="row justify-end q-mt-md">
              <q-btn
                color="primary"
                label="Alterar senha"
                :loading="changingPassword"
                :disable="!canChangePassword"
                @click="changePassword"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- Preferências -->
        <q-card dark class="card-dark q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-md">Preferências</div>

            <q-list>
              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Notificações por e-mail</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    Receber atualizações de times e campeonatos
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="preferences.emailNotifications" color="primary" />
                </q-item-section>
              </q-item>

              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Notificações push</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    Receber notificações no navegador
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="preferences.pushNotifications" color="primary" />
                </q-item-section>
              </q-item>

              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Perfil público</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    Permitir que outros usuários vejam seu perfil
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="preferences.publicProfile" color="primary" />
                </q-item-section>
              </q-item>

              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Tema escuro</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    Usar tema escuro na interface
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="preferences.darkMode" color="primary" @update:model-value="toggleDarkMode" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <!-- Zona de Perigo -->
        <q-card dark class="card-dark border-negative">
          <q-card-section>
            <div class="text-subtitle1 text-negative q-mb-md">Zona de Perigo</div>

            <div class="row items-center justify-between q-mb-md">
              <div>
                <div class="text-body1">Exportar dados</div>
                <div class="text-caption text-grey-5">
                  Baixe uma cópia de todos os seus dados
                </div>
              </div>
              <q-btn outline color="primary" label="Exportar" icon="download" @click="exportData" />
            </div>

            <q-separator dark class="q-my-md" />

            <div class="row items-center justify-between">
              <div>
                <div class="text-body1">Excluir conta</div>
                <div class="text-caption text-grey-5">
                  Esta ação é irreversível. Todos os seus dados serão perdidos.
                </div>
              </div>
              <q-btn color="negative" label="Excluir conta" icon="delete_forever" @click="confirmDeleteAccount" />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Dialog de confirmação de exclusão -->
    <q-dialog v-model="showDeleteDialog" persistent>
      <q-card dark style="min-width: 350px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
          <span class="text-h6">Excluir conta</span>
        </q-card-section>

        <q-card-section>
          <p>Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.</p>
          <p class="text-grey-5">Digite <strong>EXCLUIR</strong> para confirmar:</p>
          <q-input v-model="deleteConfirmation" dark filled dense />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn
            flat
            label="Excluir"
            color="negative"
            :disable="deleteConfirmation !== 'EXCLUIR'"
            @click="deleteAccount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface User {
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  teamsCount: number;
}

interface ProfileForm {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  birthdate: string;
  bio: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface Preferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  publicProfile: boolean;
  darkMode: boolean;
}

export default defineComponent({
  name: 'PerfilPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {
      defaultAvatar: 'https://cdn.quasar.dev/img/avatar.png',

      user: {
        name: 'João Silva',
        email: 'joao@email.com',
        avatar: null,
        createdAt: 'Jan 2024',
        teamsCount: 3,
      } as User,

      form: {
        name: 'João Silva',
        nickname: 'joaosilva',
        email: 'joao@email.com',
        phone: '',
        birthdate: '',
        bio: '',
      } as ProfileForm,

      passwordForm: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      } as PasswordForm,

      preferences: {
        emailNotifications: true,
        pushNotifications: false,
        publicProfile: true,
        darkMode: true,
      } as Preferences,

      // UI states
      saving: false,
      changingPassword: false,
      showCurrentPassword: false,
      showNewPassword: false,
      showConfirmPassword: false,
      showDeleteDialog: false,
      deleteConfirmation: '',
    };
  },

  computed: {
    canChangePassword(): boolean {
      return (
        !!this.passwordForm.currentPassword &&
        !!this.passwordForm.newPassword &&
        this.passwordForm.newPassword.length >= 8 &&
        this.passwordForm.newPassword === this.passwordForm.confirmPassword
      );
    },
  },

  methods: {
    changeAvatar() {
      // TODO: Implementar upload de avatar
      this.$q.notify({
        message: 'Upload de avatar em desenvolvimento',
        color: 'info',
      });
    },

    async saveProfile() {
      this.saving = true;
      try {
        // TODO: Chamar API para salvar perfil
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.$q.notify({
          message: 'Perfil atualizado com sucesso!',
          color: 'positive',
        });
      } catch (error) {
        this.$q.notify({
          message: 'Erro ao salvar perfil',
          color: 'negative',
        });
      } finally {
        this.saving = false;
      }
    },

    async changePassword() {
      this.changingPassword = true;
      try {
        // TODO: Chamar API para alterar senha
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.$q.notify({
          message: 'Senha alterada com sucesso!',
          color: 'positive',
        });
        this.passwordForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        };
      } catch (error) {
        this.$q.notify({
          message: 'Erro ao alterar senha',
          color: 'negative',
        });
      } finally {
        this.changingPassword = false;
      }
    },

    toggleDarkMode(value: boolean) {
      this.$q.dark.set(value);
    },

    exportData() {
      // TODO: Implementar exportação de dados
      this.$q.notify({
        message: 'Exportação de dados em desenvolvimento',
        color: 'info',
      });
    },

    confirmDeleteAccount() {
      this.deleteConfirmation = '';
      this.showDeleteDialog = true;
    },

    async deleteAccount() {
      try {
        // TODO: Chamar API para excluir conta
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.$q.notify({
          message: 'Conta excluída com sucesso',
          color: 'positive',
        });
        this.$router.push({ name: 'public.home' });
      } catch (error) {
        this.$q.notify({
          message: 'Erro ao excluir conta',
          color: 'negative',
        });
      }
    },
  },

  created() {
    // Sincroniza dark mode com preferência
    this.preferences.darkMode = this.$q.dark.isActive;
  },

  mounted() {},
});
</script>

<style scoped>
.perfil-page {
  max-width: 1200px;
  margin: 0 auto;
}

.card-dark {
  background: #2b2d31;
}

.avatar-container {
  position: relative;
  display: inline-block;
}

.avatar-profile {
  border: 4px solid #5865f2;
}

.avatar-edit-btn {
  position: absolute;
  bottom: 0;
  right: 0;
}

.border-negative {
  border: 1px solid var(--q-negative);
}
</style>
