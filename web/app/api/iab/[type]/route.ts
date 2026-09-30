import { NextRequest, NextResponse } from 'next/server';
import { getTaxonomy, TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyTree, getTaxonomyStats } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'flat';
  const maxDepth = searchParams.get('maxDepth');

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    if (format === 'tree') {
      const tree = await getTaxonomyTree(type as TaxonomyType, maxDepth ? parseInt(maxDepth, 10) : null);
      const stats = await getTaxonomyStats(type as TaxonomyType);

      return NextResponse.json({ success: true, type, version: stats.version, format: 'tree', data: tree, stats });
    }

    const taxonomy = await getTaxonomy(type as TaxonomyType);

    return NextResponse.json({
      success: true,
      type,
      version: taxonomy.version,
      format: 'flat',
      data: taxonomy.categories,
      index: taxonomy.index,
      totalCategories: taxonomy.totalCategories,
      lastUpdated: taxonomy.lastUpdated,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
