import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { OrganizationType } from './Organizations/types';
import type { ArticleOutline, ArticleSourcesUsed } from './PromptArticles/types';
import type { StoredProviderKey } from './Settings/types';
import type { ChatbotId } from './shared/ChatbotId';
import type { ProviderId } from './shared/ProviderId';
import type { PageHeading } from '@/libs/utils/urlAnalysis';
import type { CollectionSchedule } from '@/libs/collection/schedule';

// Shared column conventions (see docs/adr/0006-sqlite-with-drizzle.md):
// - UUID primary keys kept as TEXT.
// - Timestamps stored as ISO 8601 strings.
// - `updated_at` uses `$onUpdate` in place of the Postgres `update_updated_at` triggers.
//
// `id` is not marked `.notNull()` here because drizzle-kit@1.0.0-rc.4 does not emit `NOT NULL`
// for a `text().primaryKey()` column regardless — SQLite otherwise allows a non-INTEGER primary
// key to be NULL (and repeated). The initial migration's `PRIMARY KEY` lines were hand-edited to
// add `NOT NULL`; if that migration is ever regenerated, redo the same hand-edit or this
// protection silently disappears. This isn't only a risk for regenerating *this* migration:
// drizzle-kit's SQLite strategy for many future alters is to recreate the table from the
// snapshot (which still records `notNull: false` for `id`), so a later migration can drop the
// constraint even without anyone touching this file. `tests/unit/database/schema.test.ts` asserts
// `pragma table_info` reports `notnull = 1` for `id` on every table so a regression fails loudly.
const idColumn = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAtColumn = () =>
  text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString());

const updatedAtColumn = () =>
  text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString());

export const organizations = sqliteTable(
  'organizations',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    type: text('type').$type<OrganizationType>().notNull(),
    url: text('url'),
    name: text('name'),
    icon_url: text('icon_url'),
  },
  (table) => [check('organizations_type_check', sql`${table.type} in ('agency', 'in-house')`)]
);

// Singleton settings row (provider keys and enabled Chatbots for this single-user install).
// One JSON column per concern
// rather than 13 enumerated columns (3 providers x key/status/validatedAt, plus per-Chatbot
// flags): matches this file's existing JSON-column convention, and adding a fourth provider or
// Chatbot becomes a value change here rather than a migration.
export const settings = sqliteTable('settings', {
  id: idColumn(),
  created_at: createdAtColumn(),
  updated_at: updatedAtColumn(),
  provider_keys: text('provider_keys', { mode: 'json' })
    .$type<Partial<Record<ProviderId, StoredProviderKey>>>()
    .notNull()
    .default({}),
  // `null` means "the user has never touched this toggle" (every fresh install), distinct from
  // `[]`, a deliberate "turn everything off" — see libs/database/Settings/queries.ts, whose
  // `getEffectiveEnabledChatbotIds()` treats `null` as "default to every Chatbot with a key" and
  // `[]` as "none", rather than collapsing both to the same empty array.
  enabled_chatbots: text('enabled_chatbots', { mode: 'json' }).$type<ChatbotId[]>(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    url: text('url').notNull(),
    name: text('name').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull(),
    icon_url: text('icon_url'),
    hostname: text('hostname').notNull().default(''),
    prompts_updated_at: text('prompts_updated_at'),
    is_paused: integer('is_paused', { mode: 'boolean' }).notNull().default(false),
    is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    target_location: text('target_location'),
    // `null` = no schedule (the default): this Project collects only when the user asks (ADR
    // 0002). Set = it collects on its own while the app is open (ADR 0011).
    collection_schedule: text('collection_schedule', { mode: 'json' }).$type<CollectionSchedule>(),
  },
  (table) => [index('projects_is_archived_created_at_idx').on(table.is_archived, table.created_at)]
);

export const competitors = sqliteTable(
  'competitors',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    url: text('url').notNull(),
    name: text('name'),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull(),
    icon_url: text('icon_url'),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull().default(''),
    is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('competitors_project_id_is_archived_updated_at_idx').on(
      table.project_id,
      table.is_archived,
      table.updated_at
    ),
    uniqueIndex('competitors_project_id_url_is_active_uidx')
      .on(table.project_id, table.url)
      .where(sql`${table.is_archived} = 0`),
    uniqueIndex('competitors_project_id_name_is_active_uidx')
      .on(table.project_id, table.name)
      .where(sql`${table.is_archived} = 0 and ${table.name} is not null`),
  ]
);

export const topics = sqliteTable(
  'topics',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    name: text('name').notNull(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('topics_project_id_is_archived_idx').on(table.project_id, table.is_archived)]
);

export const prompts = sqliteTable(
  'prompts',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    name: text('name').notNull(),
    topic_id: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('prompts_project_id_is_archived_updated_at_idx').on(
      table.project_id,
      table.is_archived,
      table.updated_at
    ),
    index('prompts_project_id_is_archived_created_at_idx').on(
      table.project_id,
      table.is_archived,
      table.created_at
    ),
    index('prompts_topic_id_idx').on(table.topic_id),
  ]
);

export const collectionRuns = sqliteTable(
  'collection_runs',
  {
    id: idColumn(),
    status: text('status').notNull(),
    // `'all' | 'projects'` (see `CollectionRunScope`). `'all'` means the Run covered every eligible
    // Project and is what the 7-day cadence clock anchors on. Deliberately has NO CHECK constraint,
    // unlike `status` above: adding one forces drizzle-kit to rebuild this table (`CREATE __new_x` /
    // `INSERT SELECT` / `DROP TABLE` / `RENAME`), and that `DROP TABLE` runs inside the migration
    // transaction — where `PRAGMA foreign_keys` (set ON for every connection, see
    // `libs/database/client.ts`) cannot be turned off — which would cascade-delete every
    // `collection_run_items` row and NULL every `prompt_responses.run_id`. The `'all'` default
    // backfills pre-existing rows, whose true scope is unknowable; this is behaviourally identical
    // to the documented "no app-wide Run yet → anchor on the most recent completed Run of any scope"
    // fallback.
    scope: text('scope').notNull().default('all'),
    started_at: text('started_at'),
    finished_at: text('finished_at'),
    items_total: integer('items_total').notNull().default(0),
    items_completed: integer('items_completed').notNull().default(0),
    items_failed: integer('items_failed').notNull().default(0),
    error: text('error'),
    created_at: createdAtColumn(),
  },
  (table) => [
    check(
      'collection_runs_status_check',
      sql`${table.status} in ('pending', 'running', 'completed', 'failed', 'cancelled')`
    ),
    index('collection_runs_status_created_at_idx').on(table.status, table.created_at),
  ]
);

export const promptResponses = sqliteTable(
  'prompt_responses',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    text: text('text').notNull(),
    chatbot_id: text('chatbot_id').$type<ChatbotId>().notNull(),
    prompt_id: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    model_id: text('model_id').notNull(),
    brand_ids_ranking: text('brand_ids_ranking', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    sentiment: text('sentiment', { mode: 'json' }).$type<Record<string, -2 | -1 | 0 | 1 | 2>>(),
    run_id: text('run_id').references(() => collectionRuns.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'prompt_responses_chatbot_id_check',
      sql`${table.chatbot_id} in ('chatgpt', 'perplexity', 'google-ai-overview')`
    ),
    index('prompt_responses_project_id_created_at_idx').on(table.project_id, table.created_at),
    index('prompt_responses_prompt_id_created_at_idx').on(table.prompt_id, table.created_at),
    index('prompt_responses_run_id_idx').on(table.run_id),
  ]
);

export const sources = sqliteTable(
  'sources',
  {
    id: idColumn(),
    created_at: createdAtColumn(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prompt_id: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    prompt_response_id: text('prompt_response_id')
      .notNull()
      .references(() => promptResponses.id, { onDelete: 'cascade' }),
    is_cited: integer('is_cited', { mode: 'boolean' }).notNull(),
    position: integer('position').notNull(),
    clean_url: text('clean_url').notNull(),
    url: text('url').notNull(),
    hostname: text('hostname').notNull(),
    raw_url: text('raw_url'),
    title: text('title'),
    description: text('description'),
    headings: text('headings', { mode: 'json' }).$type<PageHeading[]>(),
    brand_ids_ranking: text('brand_ids_ranking', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index('sources_project_id_created_at_idx').on(table.project_id, table.created_at),
    index('sources_prompt_response_id_position_idx').on(table.prompt_response_id, table.position),
    index('sources_prompt_id_idx').on(table.prompt_id),
  ]
);

export const promptArticles = sqliteTable(
  'prompt_articles',
  {
    id: idColumn(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prompt_id: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    opportunity_id: text('opportunity_id'),
    opportunity_type: text('opportunity_type').notNull(),
    target_source_clean_url: text('target_source_clean_url'),
    outline: text('outline', { mode: 'json' }).$type<ArticleOutline>().notNull(),
    article_markdown: text('article_markdown'),
    outline_model_id: text('outline_model_id').notNull(),
    created_at: createdAtColumn(),
    updated_at: updatedAtColumn(),
    user_edited_outline: text('user_edited_outline', { mode: 'json' }).$type<ArticleOutline>(),
    user_edited_article_markdown: text('user_edited_article_markdown'),
    sources_used: text('sources_used', { mode: 'json' }).$type<ArticleSourcesUsed>(),
    outline_used: text('outline_used', { mode: 'json' }).$type<ArticleOutline>(),
    article_model_id: text('article_model_id'),
    target_word_count: integer('target_word_count').notNull().default(1500),
    style_guide: text('style_guide'),
    pages_to_link: text('pages_to_link', { mode: 'json' }).$type<string[]>().notNull().default([]),
    target_keywords: text('target_keywords', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    check(
      'prompt_articles_target_word_count_range',
      sql`${table.target_word_count} between 300 and 5000`
    ),
    index('prompt_articles_project_id_prompt_id_opportunity_type_idx').on(
      table.project_id,
      table.prompt_id,
      table.opportunity_type,
      table.target_source_clean_url,
      table.created_at
    ),
    index('prompt_articles_project_id_prompt_id_updated_at_idx').on(
      table.project_id,
      table.prompt_id,
      table.updated_at
    ),
    index('prompt_articles_project_id_opportunity_id_updated_at_idx').on(
      table.project_id,
      table.opportunity_id,
      table.updated_at
    ),
  ]
);

export const collectionRunItems = sqliteTable(
  'collection_run_items',
  {
    id: idColumn(),
    run_id: text('run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prompt_id: text('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    chatbot_id: text('chatbot_id').$type<ChatbotId>().notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    started_at: text('started_at'),
    finished_at: text('finished_at'),
    created_at: createdAtColumn(),
  },
  (table) => [
    check(
      'collection_run_items_chatbot_id_check',
      sql`${table.chatbot_id} in ('chatgpt', 'perplexity', 'google-ai-overview')`
    ),
    check(
      'collection_run_items_status_check',
      sql`${table.status} in ('pending', 'running', 'completed', 'failed', 'cancelled')`
    ),
    index('collection_run_items_run_id_status_idx').on(table.run_id, table.status),
  ]
);
