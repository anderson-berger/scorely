<script lang="ts">
import type { Group, Member, PlayerPosition } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import PlayerPositions from '../../teams/components/PlayerPositions.vue';
import GroupLinksCard from '../components/GroupLinksCard.vue';
import { memberSections } from '../groups';
import { initials } from '../scoreboard';

interface Section {
  key: 'members' | 'reserves';
  title: string;
  people: Member[];
}

/**
 * Aba Membros (planos 012 e 015 D11; GRP-29): "Membros · N/limite", com o dono no topo, e "Reservas · N/limite".
 * Cada pessoa num bloco, com as posições abaixo do nome (TIM-05). O dono manda os links (012, D7) e, pelo menu "⋮"
 * da pessoa, remove e convida reservas para membro (GRP-40). Quem não é dono sai (GRP-42).
 * Grupo arquivado é só leitura (GRP-37): sem remover, convidar nem sair.
 */
export default defineComponent({
  name: 'GroupMembersPage',

  components: { BottomSheet, GroupLinksCard, PlayerPositions },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    members: { type: Array as PropType<Member[]>, required: true },
    busy: { type: Boolean, default: false },
    isOwner: { type: Boolean, default: false },
    /** TIM-05: posições de cada pessoa (ausente = o esporte não tem posições). */
    playerPositions: {
      type: Object as PropType<Record<string, PlayerPosition[]> | undefined>,
      default: undefined,
    },
    canEditPositions: { type: Boolean, default: false },
  },

  emits: {
    remove: (_member: Member) => true,
    memberInvite: (_member: Member) => true,
    cancelMemberInvite: (_member: Member) => true,
    leaveGroup: () => true,
    editPlayer: (_userId: string) => true,
  },

  data() {
    return { inviting: false };
  },

  computed: {
    /** O dono remove e convida; no grupo arquivado, ninguém (GRP-37). */
    canManage(): boolean {
      return this.isOwner && !this.group.archivedAt;
    },

    /** GRP-42/43: quem não é dono sai do grupo; no arquivado, não (GRP-37). */
    canLeave(): boolean {
      return !this.isOwner && !this.group.archivedAt;
    },

    /** GRP-40: só dá para convidar com lugar de membro livre (o limite vem da api). */
    hasMemberSpot(): boolean {
      return memberSections(this.members).members.length < this.group.maxMembers;
    },

    /** Seção de reservas vazia não aparece. */
    sections(): Section[] {
      const { members, reserves } = memberSections(this.members);
      const all: Section[] = [
        {
          key: 'members',
          title: this.$t('groups.membersSection', { count: members.length, max: this.group.maxMembers }),
          people: members,
        },
        {
          key: 'reserves',
          title: this.$t('groups.reservesSection', { count: reserves.length, max: this.group.maxReserves }),
          people: reserves,
        },
      ];
      return all.filter((s) => s.key === 'members' || s.people.length > 0);
    },
  },

  methods: {
    initials(m: Pick<Member, 'name'>): string {
      return initials(this.personName(m));
    },

    /** TIM-05: tocar na pessoa (ou nas posições dela) abre o painel de posições (só o dono, com o grupo ativo). */
    edit(userId: string) {
      if (this.canEditPositions) this.$emit('editPlayer', userId);
    },

    /** GRP-29, 40: o menu "⋮" da pessoa só aparece com alguma ação (o dono não tem). */
    hasActions(m: Member): boolean {
      return this.canManage && !m.isOwner;
    },

    personName(p: Pick<Member, 'name'>): string {
      return p.name ?? this.$t('groups.unnamed');
    },
  },
});
</script>

<template>
  <div class="sections">
    <section v-for="s in sections" :key="s.key">
      <div class="head">
        <h2 class="sc-section">{{ s.title }}</h2>
        <q-btn
          v-if="canManage && s.key === 'members'"
          flat
          no-caps
          color="primary"
          icon="person_add"
          class="invite"
          :label="$t('groups.invite')"
          @click="inviting = true"
        />
      </div>

      <div class="roster">
        <div
          v-for="m in s.people"
          :key="m.userId"
          class="sc-card member"
          :class="{ 'sc-card--dashed': s.key === 'reserves', 'member--editable': canEditPositions }"
          @click="edit(m.userId)"
        >
          <span class="avatar">{{ initials(m) }}</span>
          <span class="who">
            <span class="mname" :class="{ 'sc-muted': s.key === 'reserves' }">{{ personName(m) }}</span>
            <PlayerPositions
              v-if="playerPositions"
              :positions="playerPositions[m.userId]"
              :editable="canEditPositions"
              :name="personName(m)"
              @edit="edit(m.userId)"
            />
          </span>
          <span v-if="m.isOwner" class="sc-display owner">{{ $t('groups.owner') }}</span>
          <span v-else-if="canManage && m.memberInviteExpiresAt" class="sc-label invited">{{
            $t('groups.memberInvite.sent')
          }}</span>
          <q-btn
            v-if="hasActions(m)"
            flat
            round
            icon="more_vert"
            class="actions"
            :aria-label="$t('groups.memberActions', { name: personName(m) })"
            :disable="busy"
            @click.stop
          >
            <q-menu anchor="bottom right" self="top right">
              <q-list style="min-width: 220px">
                <template v-if="m.role === 'reserve'">
                  <q-item v-if="m.memberInviteExpiresAt" v-close-popup clickable @click="$emit('cancelMemberInvite', m)">
                    <q-item-section avatar><q-icon name="block" /></q-item-section>
                    <q-item-section>{{ $t('groups.memberInvite.cancel') }}</q-item-section>
                  </q-item>
                  <q-item v-else-if="hasMemberSpot" v-close-popup clickable @click="$emit('memberInvite', m)">
                    <q-item-section avatar><q-icon name="upgrade" /></q-item-section>
                    <q-item-section>{{ $t('groups.memberInvite.invite') }}</q-item-section>
                  </q-item>
                </template>
                <q-item v-close-popup clickable class="sc-danger" @click="$emit('remove', m)">
                  <q-item-section avatar><q-icon name="person_remove" /></q-item-section>
                  <q-item-section>{{ $t('groups.removeMember', { name: personName(m) }) }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </div>
    </section>

    <q-btn
      v-if="canLeave"
      flat
      no-caps
      class="sc-btn-outline leave"
      icon="logout"
      :label="$t('groups.leaveGroup')"
      :disable="busy"
      @click="$emit('leaveGroup')"
    />

    <BottomSheet v-if="isOwner" v-model="inviting" :title="$t('groups.invite')">
      <div class="sc-caption hint">{{ $t('groups.inviteHint') }}</div>
      <GroupLinksCard :group="group" :manage="false" />
    </BottomSheet>
  </div>
</template>

<style scoped>
.member--editable {
  cursor: pointer;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.head .sc-section {
  margin-bottom: 0;
}

.invite {
  min-height: 44px;
}

/* Cada pessoa num bloco separado (TIM-05). */
.roster {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 4px 8px 12px;
  border-radius: 12px;
}

.avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--sc-line);
  color: var(--sc-text-2);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.who {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mname {
  min-width: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.owner {
  font-size: 13px;
  font-weight: 700;
  color: var(--sc-accent);
  padding-right: 12px;
}

.actions {
  color: var(--sc-muted);
}

.invited {
  font-size: 11px;
  color: var(--sc-accent);
  white-space: nowrap;
  padding-right: 4px;
}

.leave {
  align-self: flex-start;
  min-height: 44px;
}

.hint {
  margin: 4px 0 12px;
}

/* Desktop: as pessoas em quantas colunas couberem, com espaço entre os blocos (planos 015 D11 e 016 D3; TIM-05). */
@media (min-width: 1024px) {
  .roster {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 10px;
  }
}
</style>
