import { NextRequest, NextResponse } from 'next/server';
import { getConfig, ConfigType } from '../../../../../lib/integrations/neon-config/service';

const VALID_TYPES: ConfigType[] = ['usersGroups', 'workflows', 'contentTypes'];

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as ConfigType)) {
    return NextResponse.json(
      { success: false, error: `Invalid config type '${type}'. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const data = await getConfig(type as ConfigType);
    return NextResponse.json({ success: true, type, lastUpdated: data.lastUpdated, source: data.source, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
