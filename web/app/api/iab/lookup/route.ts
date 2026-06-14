import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../lib/integrations/iab-taxonomies/service';
import { getLabels, getHierarchy, HierarchyResult } from '../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { type?: string; ids?: unknown; hierarchy?: boolean };
  const { type, ids, hierarchy = false } = body;

  if (!type) {
    return NextResponse.json({ success: false, error: 'Missing required field: type' }, { status: 400 });
  }

  if (!ids) {
    return NextResponse.json({ success: false, error: 'Missing required field: ids' }, { status: 400 });
  }

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const idArray = Array.isArray(ids) ? ids : [ids];

  if (idArray.length === 0) {
    return NextResponse.json({ success: false, error: 'IDs array cannot be empty' }, { status: 400 });
  }

  try {
    if (hierarchy) {
      const results: HierarchyResult[] = [];

      for (const id of idArray) {
        const hierarchyData = await getHierarchy(type as TaxonomyType, id);
        if (hierarchyData) results.push(hierarchyData);
      }

      return NextResponse.json({
        success: true,
        type,
        hierarchy: true,
        results,
        totalRequested: idArray.length,
        totalFound: results.length,
      });
    }

    const result = await getLabels(type as TaxonomyType, idArray);

    return NextResponse.json({ success: true, type, hierarchy: false, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
