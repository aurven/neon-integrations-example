const utils = require('./utils.js');
const neon = require('./neon-bo-api.js');

async function workflowTransitionTo({ familyRef, targetStateName, targetWorkflowName = null, priority = 0, principals = [], comment = '' }) {
    const getNextStepsResult = await neon.getNextSteps?.(familyRef);
    const nodeData = getNextStepsResult?.data?.node;
    const associatedWorkflow = getNextStepsResult?.data?.associatedWorkflow;
    const availableWorkflows = getNextStepsResult?.data?.availableWorkflows;

    if (nodeData?.familyRef === familyRef) {
        try {
            if (
                associatedWorkflow?.processInstance?.processName === targetWorkflowName &&
                associatedWorkflow?.processInstance?.state === targetStateName
            ) {
                console.log(`Node ${familyRef} is already in the desired state '${targetStateName}' of workflow '${targetWorkflowName}'`);
                return; 
            }
            const nextStepBody = nextStepAssignmentBodyGenerator({
                getNextStepsResult: getNextStepsResult.data,
                targetWorkflowName: targetWorkflowName,
                targetStateName: targetStateName,
                priority: priority,
                principals: principals,
                comment: comment
            });
            if (!nextStepBody) {
                console.error(`Cannot generate next step body for ${familyRef}`);
                return;
            }
            // console.log(nextStepBody);
            return await neon.nextStepAssignment(familyRef, nextStepBody);
        } catch (error) {
            console.error(error.message);
        }
    } else {
        console.error(`Cannot transition to ${targetStateName} for ${familyRef}`);
    }
}

function nextStepAssignmentBodyGenerator({ getNextStepsResult, targetWorkflowName, targetStateName, priority, principals, comment }) {
    let processName = getNextStepsResult.associatedWorkflow?.processInstance?.processName;
    let matchingStep;
    const nodeTitle = getNextStepsResult.node.title || 'Automatically transitioned by a Neon Integration';

    if (!processName && targetWorkflowName) {
        console.warn(`No associated workflow found for this node. Trying to find the workflow by name "${targetWorkflowName}"...`);
        const targetWorkflow = getNextStepsResult?.availableWorkflows?.find?.(workflow => 
            workflow.processInstance.processName === targetWorkflowName
        );
        if (!targetWorkflow) {
            console.error(`Workflow with name '${targetWorkflowName}' not found`);
            return;
        }
        processName = targetWorkflowName;
        matchingStep = targetWorkflow.steps?.find?.(step =>
            step.state.name === targetStateName
        );
    } else {
        matchingStep = getNextStepsResult.associatedWorkflow?.steps?.find?.(step =>
            step.state.name === targetStateName
        );
    }
    
    if (!matchingStep) {
        console.error(`Step with state name '${targetStateName}' not found`);
        return
    }
    

    const nextStepAssignmentBody = {
        "workflowAssignment": {
            "title": nodeTitle,
            "comment": comment,
            "principals": principals,
            "prioprity": priority
        },
        "workflowStep": {
            "connectorName": matchingStep.name,
            "workflowName": processName
        }
    };

    return nextStepAssignmentBody;
}

async function deleteObjectsByQuery(query) {
    const searchResult = await neon.searchNodes({ query, limit: 100 });
    const nodes = searchResult?.data?.nodes || [];
    console.log(`Found ${nodes.length} nodes to delete`);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        console.log(`Deleting node ${node.familyRef} - ${node.title}`);
        await neon.deleteNode(node.familyRef);
    }
}

module.exports = {
    workflowTransitionTo,
    deleteObjectsByQuery
};