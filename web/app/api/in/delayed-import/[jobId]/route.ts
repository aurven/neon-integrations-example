import { NextRequest, NextResponse } from 'next/server';
import { getJob, cancelJob } from '../../../../../lib/integrations/delayed-importer/service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const result = cancelJob(jobId);

  if (result === null) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if ('error' in result) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
