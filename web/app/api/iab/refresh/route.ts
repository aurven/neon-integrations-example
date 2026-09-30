import { NextResponse } from 'next/server';
import { refreshAll } from '../../../../lib/integrations/iab-taxonomies/service';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const results = await refreshAll();
    return NextResponse.json({ success: true, message: 'Taxonomies refresh completed', ...results });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
