import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const extractionStatusEnum = pgEnum("extraction_status", [
  "queued",
  "running",
  "paused",
  "finished",
  "cancelled",
  "error",
]);

export const messageTipoEnum = pgEnum("message_tipo", [
  "dm",
  "comment",
  "storie",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "running",
  "paused",
  "finished",
  "cancelled",
]);

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "pending",
  "sent",
  "error",
  "skipped",
]);

/* ---------- Better Auth ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ---------- App ---------- */

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  keyHash: text("key_hash").notNull(),
  /** AES-GCM da chave em texto — só o dono autenticado pode revelar/copiar. */
  keyEncrypted: text("key_encrypted"),
  label: varchar("label", { length: 80 }).default("default"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const igSessions = pgTable("ig_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  sessionid: text("sessionid").notNull(),
  csrftoken: text("csrftoken"),
  dsUserId: text("ds_user_id"),
  mid: text("mid"),
  igDid: text("ig_did"),
  rur: text("rur"),
  userAgent: text("user_agent"),
  igUsername: varchar("ig_username", { length: 120 }),
  igUserPk: text("ig_user_pk"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 160 }).notNull(),
  perfilAlvoUsername: varchar("perfil_alvo_username", { length: 120 }).notNull(),
  perfilAlvoPk: text("perfil_alvo_pk").notNull().default("0"),
  perfilAlvoFullName: varchar("perfil_alvo_full_name", { length: 160 }),
  perfilAlvoIsPrivate: boolean("perfil_alvo_is_private").default(false),
  perfilAlvoSeguidores: integer("perfil_alvo_seguidores").default(0),
  status: extractionStatusEnum("status").notNull().default("running"),
  capturados: integer("capturados").notNull().default(0),
  maxId: text("max_id"),
  erroMensagem: text("erro_mensagem"),
  limite: integer("limite"),
  delayMinMs: integer("delay_min_ms"),
  delayMaxMs: integer("delay_max_ms"),
  claimedAt: timestamp("claimed_at"),
  iniciadoEm: timestamp("iniciado_em").notNull().defaultNow(),
  finalizadoEm: timestamp("finalizado_em"),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pk: text("pk").notNull(),
    username: varchar("username", { length: 120 }).notNull(),
    fullName: varchar("full_name", { length: 160 }),
    isPrivate: boolean("is_private").default(false),
    isVerified: boolean("is_verified").default(false),
    isBusiness: boolean("is_business").default(false),
    extractionId: uuid("extraction_id").references(() => extractions.id, {
      onDelete: "set null",
    }),
    capturadoEm: timestamp("capturado_em").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leads_user_pk_uidx").on(t.userId, t.pk)],
);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tipo: messageTipoEnum("tipo").notNull().default("dm"),
  titulo: varchar("titulo", { length: 120 }).notNull(),
  texto: text("texto").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 160 }).notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  minDelayMin: integer("min_delay_min").notNull().default(3),
  maxDelayMin: integer("max_delay_min").notNull().default(8),
  comentar: boolean("comentar").notNull().default(false),
  seguir: boolean("seguir").notNull().default(false),
  curtir: boolean("curtir").notNull().default(false),
  storie: boolean("storie").notNull().default(false),
  ignorarRespRapida: boolean("ignorar_resp_rapida").notNull().default(false),
  ignorarRespSegundos: integer("ignorar_resp_segundos").default(30),
  scheduleStart: varchar("schedule_start", { length: 8 }),
  scheduleEnd: varchar("schedule_end", { length: 8 }),
  scheduleTz: varchar("schedule_tz", { length: 64 }).default("America/Sao_Paulo"),
  scheduleDays: jsonb("schedule_days").$type<number[]>().default([1, 2, 3, 4, 5]),
  messageIds: jsonb("message_ids").$type<string[]>().default([]),
  commentIds: jsonb("comment_ids").$type<string[]>().default([]),
  storieIds: jsonb("storie_ids").$type<string[]>().default([]),
  total: integer("total").notNull().default(0),
  enviados: integer("enviados").notNull().default(0),
  erros: integer("erros").notNull().default(0),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  iniciadoEm: timestamp("iniciado_em"),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});

export const campaignDispatches = pgTable("campaign_dispatches", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  leadUsername: varchar("lead_username", { length: 120 }).notNull(),
  mensagemRender: text("mensagem_render"),
  comentarioRender: text("comentario_render"),
  storieRender: text("storie_render"),
  status: dispatchStatusEnum("status").notNull().default("pending"),
  followStatus: varchar("follow_status", { length: 40 }),
  likeStatus: varchar("like_status", { length: 40 }),
  comentarioStatus: varchar("comentario_status", { length: 40 }),
  storieStatus: varchar("storie_status", { length: 40 }),
  erroMensagem: text("erro_mensagem"),
  enviadoEm: timestamp("enviado_em"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const agentSettings = pgTable(
  "agent_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    ativo: boolean("ativo").notNull().default(false),
    webhookSecret: text("webhook_secret").notNull(),
    verifyToken: text("verify_token").notNull(),
    metaIgBusinessId: text("meta_ig_business_id"),
    metaAccessToken: text("meta_access_token"),
    prompt: text("prompt"),
    responderTodos: boolean("responder_todos").notNull().default(false),
    responderProspeccao: boolean("responder_prospeccao").notNull().default(true),
    totalMensagens: integer("total_mensagens").notNull().default(0),
    ultimaMsgEm: timestamp("ultima_msg_em"),
    atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_settings_webhook_secret_uidx").on(t.webhookSecret),
    uniqueIndex("agent_settings_verify_token_uidx").on(t.verifyToken),
  ],
);
