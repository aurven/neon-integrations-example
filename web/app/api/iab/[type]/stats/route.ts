import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyStats } from '../../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const stats = await getTaxonomyStats(type as TaxonomyType);
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
