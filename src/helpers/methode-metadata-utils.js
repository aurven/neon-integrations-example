const dayjs = require('dayjs');

/**
 * Helpers to build request bodies for Méthode's
 * POST /v3/object/metadata/change/fields endpoint.
 */

/**
 * Build an XPATH for a regular attribute, prefixed with /attributes
 */
function attributePath(xpath) {
    return `/attributes${xpath}`;
}

/**
 * Build an XPATH for a system attribute, prefixed with /sysattributes/props
 */
function sysAttributePath(xpath) {
    return `/sysattributes/props${xpath}`;
}

/**
 * Operator builders - each returns an operator object as expected
 * inside an updateField's "operators" array.
 */
function setOp(xpath, content) {
    return { set: { xpath, content } };
}

function unsetOp(xpath) {
    return { unset: { xpath } };
}

function incOp(xpath, content = '1') {
    return { inc: { xpath, content: String(content) } };
}

function pushOp(xpath, content) {
    return { push: { xpath, content } };
}

function pullFirstOp(xpath) {
    return { pullFirst: { xpath } };
}

function pullLastOp(xpath) {
    return { pullLast: { xpath } };
}

/**
 * Build a single updateField entry: a group of operators applied to a set of source ids.
 */
function buildUpdateField({ sourceIds, operators, length } = {}) {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
        throw new Error('sourceIds must be a non-empty array');
    }
    if (!Array.isArray(operators) || operators.length === 0) {
        throw new Error('operators must be a non-empty array');
    }

    const updateField = { sourceIds, operators };
    if (length !== undefined) {
        updateField.length = length;
    }

    return updateField;
}

/**
 * Build the full request body: { updateFields: [...] }
 */
function buildChangeFieldsBody(updateFields) {
    if (!Array.isArray(updateFields) || updateFields.length === 0) {
        throw new Error('updateFields must be a non-empty array');
    }

    return { updateFields };
}

/**
 * Map a Neon printPriority (1-5, or empty) to Méthode's AutoLayout/LayoutPrio:
 * - A if priority is 3
 * - B if priority is 4 or empty
 * - C otherwise (1, 2, 5)
 */
function mapLayoutPrio(printPriority) {
    const p = (printPriority === undefined || printPriority === null || printPriority === '')
        ? null
        : Number(printPriority);

    if (p === 1 || p === 2 || p === 3) return 'A';
    if (p === 4 || p === null) return 'B';
    return 'C';
}

/**
 * Map a Neon printPriority (1-5, or empty) to Méthode's AutoLayout/BoostPriority:
 * - 2 if priority is 1
 * - 1 if priority is 2
 * - 0 if priority is 3
 * - null (unset) for 4, 5 or empty
 */
function mapBoostPriority(printPriority) {
    const p = (printPriority === undefined || printPriority === null || printPriority === '')
        ? null
        : Number(printPriority);

    if (p === 1) return '2';
    if (p === 2) return '1';
    if (p === 3) return '0';
    return null;
}

/**
 * Build the operators needed to sync Neon's print fields (printPriority,
 * printIssueDate, printSection) onto a Méthode story's metadata/system attributes.
 * Empty source values unset the corresponding Méthode field (except printPriority,
 * which always maps LayoutPrio - empty maps to 'B').
 */
function buildPrintFieldOperators({ printPriority, printIssueDate, printSection } = {}) {
    const operators = [];

    operators.push(setOp(attributePath('/metadata/AutoLayout/LayoutPrio'), mapLayoutPrio(printPriority)));

    const boostPriority = mapBoostPriority(printPriority);
    operators.push(boostPriority !== null
        ? setOp(attributePath('/metadata/AutoLayout/BoostPriority'), boostPriority)
        : unsetOp(attributePath('/metadata/AutoLayout/BoostPriority')));

    if (printIssueDate) {
        operators.push(setOp(sysAttributePath('/productInfo/issueDate'), dayjs(printIssueDate).format('YYYYMMDD')));
    }

    if (printSection) {
        operators.push(setOp(sysAttributePath('/workFolder'), printSection));
    }

    return operators;
}

module.exports = {
    attributePath,
    sysAttributePath,
    setOp,
    unsetOp,
    incOp,
    pushOp,
    pullFirstOp,
    pullLastOp,
    buildUpdateField,
    buildChangeFieldsBody,
    mapLayoutPrio,
    mapBoostPriority,
    buildPrintFieldOperators
};
