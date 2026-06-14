import { NextResponse } from 'next/server';
import { getAvailableConfigs, loadFromCache, ConfigType, ConfigData, ConfigMeta } from '../../../../lib/integrations/neon-config/service';

function buildStats(type: ConfigType, data: ConfigData): Record<string, number> {
  if (type === 'usersGroups') {
    const d = data as { users?: unknown[]; groups?: unknown[] };
    return {
      userCount: Array.isArray(d.users) ? d.users.length : 0,
      groupCount: Array.isArray(d.groups) ? d.groups.length : 0,
    };
  }
  if (type === 'workflows') {
    const d = data as { workflows?: unknown[] };
    return { workflowCount: Array.isArray(d.workflows) ? d.workflows.length : 0 };
  }
  const d = data as { types?: unknown[] };
  return { typeCount: Array.isArray(d.types) ? d.types.length : 0 };
}

export const runtime = 'nodejs';

export async function GET() {
  try {
    const available = getAvailableConfigs();
    const configs: Record<string, unknown> = {};

    for (const [type, meta] of Object.entries(available) as [ConfigType, ConfigMeta][]) {
      try {
        const cached = await loadFromCache(type);
        configs[type] = {
          ...meta,
          cached: !!cached,
          lastUpdated: cached?.lastUpdated || null,
          stats: cached ? buildStats(type, cached) : null,
        };
      } catch {
        configs[type] = { ...meta, cached: false, lastUpdated: null, stats: null };
      }
    }

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
