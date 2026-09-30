import { NextResponse } from 'next/server';
import { refreshAll } from '../../../../../lib/integrations/neon-config/service';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const results = await refreshAll();
    return NextResponse.json({
      success: true,
      message: 'Neon config refresh completed',
      refreshed: results.refreshed,
      errors: results.errors,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
