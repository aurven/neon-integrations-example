export const METADATA_XPATHS = {
  printSection: '/ObjectMetadata/DistributionChannels/Print/PrintSection',
  printPriority: '/ObjectMetadata/DistributionChannels/Print/PrintPriority',
  issueDate: '/ObjectMetadata/DistributionChannels/Print/PrintIssueDate',
  printIssueDate: '/ObjectMetadata/DistributionChannels/Print/PrintIssueDate',
  printDiffusion: '/ObjectMetadata/Diffusion/Diff_Print',
};

const DATE_FIELDS = new Set(['issueDate', 'printIssueDate']);

// 'yyyy-mm-dd' -> 'yyyymmdd'
export function isoDateToNeon(iso) {
  return iso.replace(/-/g, '');
}

// Build a { xpath, action, value? } change for POST /utilities/metadata/update.
// Returns null if `field` has no known xpath mapping.
export function buildMetadataChange(field, value) {
  const xpath = METADATA_XPATHS[field];
  if (!xpath) return null;

  if (value === null || value === undefined || value === '') {
    return { xpath, action: 'unset' };
  }

  if (DATE_FIELDS.has(field)) {
    return { xpath, action: 'set', value: isoDateToNeon(value) };
  }

  return { xpath, action: 'set', value: String(value) };
}
