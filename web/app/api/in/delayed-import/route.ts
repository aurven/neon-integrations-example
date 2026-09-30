import { NextRequest, NextResponse } from 'next/server';
import { validatePayload, createJob, listJobs } from '../../../../lib/integrations/delayed-importer/service';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const validation = validatePayload(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = createJob(body);
  return NextResponse.json(result, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
