import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { validateIds } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { type?: string; ids?: unknown };
  const { type, ids } = body;

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required field: type' }, { status: 400 });
  }

  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid field: ids (must be an array)' },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const validation = await validateIds(type as TaxonomyType, ids);
    return NextResponse.json({ success: true, type, ...validation });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
