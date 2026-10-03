import { NextResponse, NextRequest } from 'next/server';
import { updateProjectRow } from '@/libs/database/Projects/queries';
import { SetCollectionScheduleBodySchema } from './types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    if (!projectId) return new Response('Missing projectId', { status: 400 });

    const { schedule } = SetCollectionScheduleBodySchema.parse(await req.json());

    const updatedProject = await updateProjectRow(projectId, { collection_schedule: schedule });
    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
