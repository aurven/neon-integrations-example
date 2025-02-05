async function jsonToXml({ json, excludeAttributes = [], excludeTags = [] }) {
    function convertNode(node) {
        let xmlString = '';

        if (excludeTags.includes(node.nodeType)) {
            return '';
        } else if (node.nodeType === 'plainText') {
            return node.value || '';
        } else {

            if (node.nodeType === 'anchor') {
                xmlString += `<a`;
            } else {
                // Start opening tag with nodeType (except plainText, which is handled differently)
                xmlString += `<${node.nodeType}`;
            }
    
            // Add attributes if they exist, excluding any specified
            if (node.attributes) {
                for (const [key, value] of Object.entries(node.attributes)) {
                    if (!excludeAttributes.includes(key)) {
                        xmlString += ` ${key}="${value}"`;
                    }
                }
            }
    
            // Handle anchor tag closing and children
            if (node.nodeType === 'anchor') {
                xmlString += '>';
                if (node.elements) {
                    node.elements.forEach(child => {
                        xmlString += convertNode(child);
                    });
                }
                xmlString += `</a>`;  // Closing anchor tag
            } else {
                // Otherwise, close the tag for non-anchor nodes
                xmlString += ">";
    
                // Add elements if they exist (recursive processing of children)
                if (node.elements && node.elements.length > 0) {
                    node.elements.forEach(child => {
                        xmlString += convertNode(child);
                    });
                }
            }
        }

        // Close the tag if it's not an anchor
        if (node.nodeType !== 'anchor') {
            xmlString += `</${node.nodeType}>`;
        }

        return xmlString;
    }

    // Start conversion from the root node
    return convertNode(json.content.data);
}

module.exports = {
    jsonToXml
};