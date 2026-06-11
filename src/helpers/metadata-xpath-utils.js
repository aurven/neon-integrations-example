const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const xpath = require('xpath');

/**
 * Apply a list of xpath-based set/unset changes to an ObjectMetadata XML
 * string and return the updated XML string.
 *
 * changes: [{ xpath: string, action: 'set' | 'unset', value?: string }]
 *
 * - 'set' replaces the matched element's text content with `value`.
 * - 'unset' clears the matched element's text content.
 * - An xpath matching no node is skipped (logged as a warning).
 * - An xpath matching multiple nodes applies to the first match only.
 */
function applyMetadataChanges(xmlString, changes) {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');

    for (const change of changes) {
        const nodes = xpath.select(change.xpath, doc);

        if (!nodes || nodes.length === 0) {
            console.warn(`⚠️ applyMetadataChanges: xpath matched no node, skipping: ${change.xpath}`);
            continue;
        }

        const node = nodes[0];
        const value = change.action === 'unset' ? '' : (change.value ?? '');
        setNodeText(node, value);
    }

    return new XMLSerializer().serializeToString(doc);
}

function setNodeText(node, value) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
    if (value !== '') {
        node.appendChild(node.ownerDocument.createTextNode(value));
    }
}

module.exports = {
    applyMetadataChanges
};
