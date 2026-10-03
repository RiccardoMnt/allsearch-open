import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { getDatabase } from '../client';
import { projects } from '../schema';
import { ProjectRow } from './types';

type InsertProjectRowInput = Omit<
  ProjectRow,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'is_paused'
  | 'is_archived'
  | 'prompts_updated_at'
  | 'collection_schedule'
>;
type UpdateProjectRowInput = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;

export async function getProjectRowWithId(id: string): Promise<ProjectRow | undefined> {
  const db = await getDatabase();
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0];
}

export async function getProjectRows(includeArchived = false): Promise<ProjectRow[]> {
  const db = await getDatabase();
  const conditions = [];
  if (!includeArchived) conditions.push(eq(projects.is_archived, false));
  return db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(asc(projects.created_at));
}

export async function insertProjectRow(input: InsertProjectRowInput): Promise<ProjectRow> {
  const db = await getDatabase();
  const [row] = await db.insert(projects).values(input).returning();
  if (!row) throw new Error('Insert into projects returned no row');
  return row;
}

export async function updateProjectRow(
  id: string,
  values: Partial<UpdateProjectRowInput>
): Promise<ProjectRow> {
  const db = await getDatabase();
  const [row] = await db.update(projects).set(values).where(eq(projects.id, id)).returning();
  if (!row) throw new Error(`No projects row found for id ${id}`);
  return row;
}

export async function deleteProjectRow(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete(projects).where(eq(projects.id, id));
}
