import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { searchCategories } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const q = searchParams.get('q');
  const limit = searchParams.get('limit') || '50';
  const caseSensitive = searchParams.get('caseSensitive') || 'false';

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required parameter: type' }, { status: 400 });
  }

  if (!q) {
    return NextResponse.json({ success: false, error: 'Missing required parameter: q (query)' }, { status: 400 });
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const results = await searchCategories(type as TaxonomyType, q, {
      caseSensitive: caseSensitive === 'true',
      limit: parseInt(limit, 10),
    });

    return NextResponse.json({ success: true, type, query: q, results, count: results.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
