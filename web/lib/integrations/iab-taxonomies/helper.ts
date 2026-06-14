import { getTaxonomy, TaxonomyType } from './service';

export interface LabelResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

export interface GetLabelsResult {
  found: LabelResult[];
  notFound: string[];
  total: number;
  foundCount: number;
  notFoundCount: number;
}

export interface HierarchyEntry {
  id: string;
  name: string;
  level: number;
}

export interface HierarchyResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  tiers: string[];
  extension?: string;
  hierarchy: HierarchyEntry[];
  depth: number;
}

export interface SearchResult {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  tiers: string[];
}

export interface ValidateIdsResult {
  valid: string[];
  invalid: string[];
  isValid: boolean;
  validCount: number;
  invalidCount: number;
}

export interface ChildCategory {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  hasChildren: boolean;
}

export interface TaxonomyStats {
  version: string;
  type: TaxonomyType;
  totalCategories: number;
  rootCategories: number;
  maxDepth: number;
  lastUpdated: string;
}

export interface TaxonomyTreeNode {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  depth: number;
  children: TaxonomyTreeNode[];
}

export async function getLabel(type: TaxonomyType, id: string | number): Promise<LabelResult | null> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const categoryInfo = taxonomy.index[idStr];

    if (!categoryInfo) return null;

    return { id: idStr, name: categoryInfo.name, path: categoryInfo.path, parentId: categoryInfo.parentId };
  } catch (error) {
    throw new Error(`Failed to get label for ${type}/${id}: ${(error as Error).message}`);
  }
}

export async function getLabels(type: TaxonomyType, ids: (string | number)[]): Promise<GetLabelsResult> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const found: LabelResult[] = [];
    const notFound: string[] = [];

    for (const id of ids) {
      const idStr = String(id);
      const categoryInfo = taxonomy.index[idStr];

      if (categoryInfo) {
        found.push({ id: idStr, name: categoryInfo.name, path: categoryInfo.path, parentId: categoryInfo.parentId });
      } else {
        notFound.push(idStr);
      }
    }

    return { found, notFound, total: ids.length, foundCount: found.length, notFoundCount: notFound.length };
  } catch (error) {
    throw new Error(`Failed to get labels for ${type}: ${(error as Error).message}`);
  }
}

export async function getHierarchy(type: TaxonomyType, id: string | number): Promise<HierarchyResult | null> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const idStr = String(id);
    const category = taxonomy.categories.find((cat) => String(cat.id) === idStr);

    if (!category) return null;

    const hierarchy: HierarchyEntry[] = [];
    let currentId: string | null = category.id;
    let maxDepth = 10;

    while (currentId && maxDepth > 0) {
      const current = taxonomy.categories.find((cat) => String(cat.id) === String(currentId));
      if (!current) break;

      hierarchy.unshift({ id: current.id, name: current.name, level: hierarchy.length });

      currentId = current.parentId;
      maxDepth--;
    }

    return {
      id: category.id,
      name: category.name,
      path: taxonomy.index[idStr].path,
      parentId: category.parentId,
      tiers: category.tiers,
      extension: category.extension,
      hierarchy,
      depth: hierarchy.length,
    };
  } catch (error) {
    throw new Error(`Failed to get hierarchy for ${type}/${id}: ${(error as Error).message}`);
  }
}

export async function searchCategories(
  type: TaxonomyType,
  query: string,
  options: { caseSensitive?: boolean; limit?: number } = {}
): Promise<SearchResult[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const { caseSensitive = false, limit = 50 } = options;
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const results: SearchResult[] = [];

    for (const category of taxonomy.categories) {
      const categoryName = caseSensitive ? category.name : category.name.toLowerCase();
      const categoryPath = taxonomy.index[category.id].path;
      const categoryPathLower = caseSensitive ? categoryPath : categoryPath.toLowerCase();

      if (categoryName.includes(searchQuery) || categoryPathLower.includes(searchQuery)) {
        results.push({
          id: category.id,
          name: category.name,
          path: categoryPath,
          parentId: category.parentId,
          tiers: category.tiers,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to search ${type} taxonomy: ${(error as Error).message}`);
  }
}

export async function validateIds(type: TaxonomyType, ids: (string | number)[]): Promise<ValidateIdsResult> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.index) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const id of ids) {
      const idStr = String(id);
      if (taxonomy.index[idStr]) {
        valid.push(idStr);
      } else {
        invalid.push(idStr);
      }
    }

    return { valid, invalid, isValid: invalid.length === 0, validCount: valid.length, invalidCount: invalid.length };
  } catch (error) {
    throw new Error(`Failed to validate IDs for ${type}: ${(error as Error).message}`);
  }
}

export async function getChildren(
  type: TaxonomyType,
  parentId: string | number | null = null
): Promise<ChildCategory[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const parentIdStr = parentId ? String(parentId) : null;

    const children = taxonomy.categories.filter((cat) => {
      if (parentIdStr === null) {
        return cat.parentId === null || cat.parentId === '';
      }
      return String(cat.parentId) === parentIdStr;
    });

    return children.map((cat) => ({
      id: cat.id,
      name: cat.name,
      path: taxonomy.index[cat.id].path,
      parentId: cat.parentId,
      hasChildren: taxonomy.categories.some((c) => String(c.parentId) === String(cat.id)),
    }));
  } catch (error) {
    throw new Error(`Failed to get children for ${type}/${parentId}: ${(error as Error).message}`);
  }
}

export async function getTaxonomyStats(type: TaxonomyType): Promise<TaxonomyStats> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const rootCount = taxonomy.categories.filter((cat) => !cat.parentId || cat.parentId === '').length;

    let maxDepth = 0;
    for (const cat of taxonomy.categories) {
      if (cat.tiers && cat.tiers.length > maxDepth) {
        maxDepth = cat.tiers.length;
      }
    }

    return {
      version: taxonomy.version,
      type: taxonomy.taxonomy,
      totalCategories: taxonomy.totalCategories,
      rootCategories: rootCount,
      maxDepth,
      lastUpdated: taxonomy.lastUpdated,
    };
  } catch (error) {
    throw new Error(`Failed to get stats for ${type}: ${(error as Error).message}`);
  }
}

export async function getTaxonomyTree(type: TaxonomyType, maxDepth: number | null = null): Promise<TaxonomyTreeNode[]> {
  try {
    const taxonomy = await getTaxonomy(type);

    if (!taxonomy || !taxonomy.categories) {
      throw new Error(`Taxonomy ${type} not available`);
    }

    const categoryMap = new Map<string, TaxonomyTreeNode>();
    taxonomy.categories.forEach((cat) => {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        path: taxonomy.index[cat.id].path,
        parentId: cat.parentId,
        depth: cat.tiers ? cat.tiers.length : 0,
        children: [],
      });
    });

    const rootNodes: TaxonomyTreeNode[] = [];

    categoryMap.forEach((node) => {
      if (maxDepth !== null && node.depth > maxDepth) return;

      if (!node.parentId || node.parentId === '') {
        rootNodes.push(node);
      } else {
        const parent = categoryMap.get(node.parentId);
        if (parent) parent.children.push(node);
      }
    });

    return rootNodes;
  } catch (error) {
    throw new Error(`Failed to get tree for ${type}: ${(error as Error).message}`);
  }
}
