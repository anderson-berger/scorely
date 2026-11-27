import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import type {
  GroupJoinMode,
  GroupModality,
  GroupPermission,
  GroupTier,
  PublicGroupId,
} from '@scorely/contracts';

/** O grupo como fica no banco (`META`): `id` é o uuid do sistema, `publicId` o código (GRV-08). Interno da api. */
export interface StoredGroup {
  id: GroupId;
  publicId: PublicGroupId;
  name: string;
  /** Modo de entrada (GRV-25): nasce `invite`. */
  joinMode: GroupJoinMode;
  /** Modalidade (GRV-52): nasce `mixed`. */
  modality: GroupModality;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Ids das mídias do logo e da capa (GRV-09): só quando há imagem; a URL é montada na resposta (MID-12). */
  logoMediaId?: string | undefined;
  coverMediaId?: string | undefined;
}

/** A participação (GRV-02), `GROUP#<id> / MEMBER#<userId>`. */
export interface StoredMembership {
  groupId: GroupId;
  userId: UserId;
  /** Como participa (GRV-17). */
  tier: GroupTier;
  /** O cargo (GRV-40): `owner`, `everyone` ou o id de um cargo criado. Um id que já não está nos cargos vale `everyone` (GRV-47). */
  role: string;
  /** A data de entrada (GRV-22, 29). */
  createdAt: string;
  /** O convite pelo qual entrou ou subiu, quando houve (GRV-29). */
  inviteId?: string | undefined;
  /** Quem criou esse convite (GRV-29): guardado aqui para não sumir com o convite. */
  invitedBy?: UserId | undefined;
}

/** Um cargo criado (GRV-44), dentro do item `ROLES`. */
export interface StoredRole {
  id: string;
  name: string;
  permissions: GroupPermission[];
}

/** Os cargos do grupo (GRV-40), `GROUP#<id> / ROLES`: os criados, do mais alto ao mais baixo, e as permissões do Todos. */
export interface StoredRoles {
  roles: StoredRole[];
  everyonePermissions: GroupPermission[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** O pedido para entrar num grupo aberto (GRV-27), `GROUP#<groupId> / REQUEST#<userId>`. Entidade de relação. */
export interface StoredJoinRequest {
  groupId: GroupId;
  userId: UserId;
  createdAt: string;
  /** Quando vence (GRV-27): 90 dias depois do `createdAt`. O vencido é ignorado ao ler (o `ttl` atrasa, ADR 0004). */
  expiresAt: string;
}

/**
 * Resultado de aceitar (GRV-28): `request_gone` = o pedido não existe mais (cancelado, recusado, vencido ou aceito
 * por outra pessoa); `already_member` = a pessoa já participa (entrou por um convite antes): o pedido foi apagado e
 * nada mais; `group_full` = o grupo tem o máximo de participantes (GRV-54): nada muda.
 */
export type ApproveRequestResult = 'ok' | 'request_gone' | 'already_member' | 'group_full';

/** Para quem é o convite pessoal (GRV-23). */
export type InviteTarget = { userId: UserId } | { email: string };

/** O convite como fica no banco (GRV-18), `GROUP#<groupId> / INVITE#<id>`. Interno da api. */
export interface StoredInvite {
  id: string;
  groupId: GroupId;
  /** O token do link; segredo: só sai para quem tem `members.invite`. */
  token: string;
  createdBy: UserId;
  tier: GroupTier;
  /** Quando deixa de valer (ISO), só com prazo (ADR 0004). */
  expiresAt?: string | undefined;
  maxUses?: number | undefined;
  uses: number;
  revokedAt?: string | undefined;
  declinedAt?: string | undefined;
  /** Para quem é, no convite pessoal (GRV-23). O email vai normalizado. */
  target?: InviteTarget | undefined;
  /** Epoch em segundos: 30 dias depois de deixar de valer (GRV-19). Só limpa a tabela, quem vale é o resto. */
  ttl?: number | undefined;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Quem entrou por um convite (GRV-19). */
export interface StoredInviteUse {
  groupId: GroupId;
  inviteId: string;
  userId: UserId;
  createdAt: string;
}

/** O que entrar por um convite faz com a participação (GRV-22): entra como novo ou sobe de reserva para membro. */
export type JoinAction = 'join' | 'promote';

/**
 * Resultado da gravação de entrar: `invite_stale` = o convite deixou de valer ou mudou desde a leitura (o service relê
 * e decide o motivo); `membership_stale` = a participação mudou desde a leitura (o service relê e decide de novo);
 * `group_full` = o grupo tem o máximo de participantes (GRV-54): nada muda, nem o uso do convite.
 */
export type JoinByInviteResult = 'ok' | 'invite_stale' | 'membership_stale' | 'group_full';

/** Resultado de passar o grupo (GRV-49): `conflict` = alguma das duas participações mudou desde a leitura. */
export type TransferGroupResult = 'ok' | 'conflict';

/** Resultado da criação: o lookup do id público já existia (o uuid é novo, só ele pode colidir). */
export type CreateGroupResult = 'created' | 'public_id_taken';
