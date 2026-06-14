import { NextResponse } from 'next/server';
import {
  getAvailableTaxonomies,
  TaxonomyType,
  TaxonomyAvailableMeta,
} from '../../../../lib/integrations/iab-taxonomies/service';
import { getTaxonomyStats } from '../../../../lib/integrations/iab-taxonomies/helper';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const taxonomies = getAvailableTaxonomies();
    const taxonomiesWithStats: Record<string, unknown> = {};

    for (const [type, config] of Object.entries(taxonomies) as [TaxonomyType, TaxonomyAvailableMeta][]) {
      try {
        const stats = await getTaxonomyStats(type);
        taxonomiesWithStats[type] = {
          ...config,
          stats: {
            totalCategories: stats.totalCategories,
            rootCategories: stats.rootCategories,
            maxDepth: stats.maxDepth,
            lastUpdated: stats.lastUpdated,
          },
        };
      } catch {
        taxonomiesWithStats[type] = { ...config, cached: false };
      }
    }

    return NextResponse.json({ success: true, taxonomies: taxonomiesWithStats });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
