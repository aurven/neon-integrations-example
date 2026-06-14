import { NextRequest, NextResponse } from 'next/server';
import { TaxonomyType } from '../../../../../lib/integrations/iab-taxonomies/service';
import { getChildren } from '../../../../../lib/integrations/iab-taxonomies/helper';

const VALID_TYPES: TaxonomyType[] = ['content', 'audience', 'adproduct'];

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId');

  if (!VALID_TYPES.includes(type as TaxonomyType)) {
    return NextResponse.json(
      { success: false, error: `Invalid taxonomy type. Valid types: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const children = await getChildren(type as TaxonomyType, parentId || null);
    return NextResponse.json({ success: true, type, parentId: parentId || null, children, count: children.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
