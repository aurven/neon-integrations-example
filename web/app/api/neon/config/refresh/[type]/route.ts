import { NextRequest, NextResponse } from 'next/server';
import { refreshConfig, ConfigType } from '../../../../../../lib/integrations/neon-config/service';

const VALID_TYPES: ConfigType[] = ['usersGroups', 'workflows', 'contentTypes'];

export const runtime = 'nodejs';

export async function POST(
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
    await refreshConfig(type as ConfigType);
    return NextResponse.json({ success: true, type, refreshed: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
