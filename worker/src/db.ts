import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  boolean,
  integer,
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

export const igSessions = pgTable("ig_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  sessionid: text("sessionid").notNull(),
  csrftoken: text("csrftoken"),
  dsUserId: text("ds_user_id"),
  mid: text("mid"),
  igDid: text("ig_did"),
  rur: text("rur"),
  userAgent: text("user_agent"),
  igUsername: varchar("ig_username", { length: 120 }),
  igUserPk: text("ig_user_pk"),
  syncedAt: timestamp("synced_at").notNull(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  perfilAlvoUsername: varchar("perfil_alvo_username", { length: 120 }).notNull(),
  perfilAlvoPk: text("perfil_alvo_pk").notNull(),
  perfilAlvoFullName: varchar("perfil_alvo_full_name", { length: 160 }),
  perfilAlvoIsPrivate: boolean("perfil_alvo_is_private"),
  perfilAlvoSeguidores: integer("perfil_alvo_seguidores"),
  status: extractionStatusEnum("status").notNull(),
  capturados: integer("capturados").notNull(),
  maxId: text("max_id"),
  erroMensagem: text("erro_mensagem"),
  limite: integer("limite"),
  delayMinMs: integer("delay_min_ms"),
  delayMaxMs: integer("delay_max_ms"),
  claimedAt: timestamp("claimed_at"),
  iniciadoEm: timestamp("iniciado_em").notNull(),
  finalizadoEm: timestamp("finalizado_em"),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    pk: text("pk").notNull(),
    username: varchar("username", { length: 120 }).notNull(),
    fullName: varchar("full_name", { length: 160 }),
    isPrivate: boolean("is_private"),
    isVerified: boolean("is_verified"),
    isBusiness: boolean("is_business"),
    extractionId: uuid("extraction_id"),
    capturadoEm: timestamp("capturado_em").notNull(),
  },
  (t) => [uniqueIndex("leads_user_pk_uidx").on(t.userId, t.pk)],
);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  status: campaignStatusEnum("status").notNull(),
  minDelayMin: integer("min_delay_min").notNull(),
  maxDelayMin: integer("max_delay_min").notNull(),
  seguir: boolean("seguir").notNull(),
  curtir: boolean("curtir").notNull(),
  total: integer("total").notNull(),
  enviados: integer("enviados").notNull(),
  erros: integer("erros").notNull(),
  atualizadoEm: timestamp("atualizado_em").notNull(),
});

export const campaignDispatches = pgTable("campaign_dispatches", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  leadUsername: varchar("lead_username", { length: 120 }).notNull(),
  mensagemRender: text("mensagem_render"),
  status: dispatchStatusEnum("status").notNull(),
  followStatus: varchar("follow_status", { length: 40 }),
  erroMensagem: text("erro_mensagem"),
  enviadoEm: timestamp("enviado_em"),
  criadoEm: timestamp("criado_em").notNull(),
});

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL obrigatória no worker");

export const db = drizzle(neon(url), {
  schema: {
    igSessions,
    extractions,
    leads,
    campaigns,
    campaignDispatches,
  },
});
