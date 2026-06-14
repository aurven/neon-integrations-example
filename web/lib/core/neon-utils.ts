/**
 * Workflow transition helpers, ported from src/helpers/neon-utils.js.
 */
import { getNextSteps, nextStepAssignment } from './neon-bo-api-v3';
import type { NextStepsData, NextStepAssignmentBody, WorkflowStep } from './neon-bo-api-v3';

export interface WorkflowTransitionOptions {
  familyRef?: string;
  targetStateName: string;
  targetWorkflowName?: string | null;
  priority?: number;
  principals?: string[];
  comment?: string;
}

export async function workflowTransitionTo({
  familyRef,
  targetStateName,
  targetWorkflowName = null,
  priority = 0,
  principals = [],
  comment = '',
}: WorkflowTransitionOptions): Promise<unknown> {
  const getNextStepsResult = await getNextSteps(familyRef);
  const nodeData = getNextStepsResult?.data?.node;
  const associatedWorkflow = getNextStepsResult?.data?.associatedWorkflow;

  if (nodeData?.familyRef === familyRef) {
    try {
      if (
        associatedWorkflow?.processInstance?.processName === targetWorkflowName &&
        associatedWorkflow?.processInstance?.state === targetStateName
      ) {
        console.log(
          `Node ${familyRef} is already in the desired state '${targetStateName}' of workflow '${targetWorkflowName}'`
        );
        return;
      }
      const nextStepBody = nextStepAssignmentBodyGenerator({
        getNextStepsResult: getNextStepsResult!.data,
        targetWorkflowName,
        targetStateName,
        priority,
        principals,
        comment,
      });
      console.log(
        `Transitioning node ${familyRef} to state '${targetStateName}' of workflow '${targetWorkflowName}'...`
      );

      if (!nextStepBody) {
        console.error(`Cannot generate next step body for ${familyRef}`);
        return;
      }
      return await nextStepAssignment(familyRef, nextStepBody);
    } catch (error) {
      console.error((error as Error).message);
    }
  } else {
    console.error(`Cannot transition to ${targetStateName} for ${familyRef}`);
  }
}

export interface NextStepAssignmentBodyGeneratorOptions {
  getNextStepsResult: NextStepsData;
  targetWorkflowName?: string | null;
  targetStateName: string;
  priority: number;
  principals: string[];
  comment: string;
}

export function nextStepAssignmentBodyGenerator({
  getNextStepsResult,
  targetWorkflowName,
  targetStateName,
  priority,
  principals,
  comment,
}: NextStepAssignmentBodyGeneratorOptions): NextStepAssignmentBody | undefined {
  let processName = getNextStepsResult.associatedWorkflow?.processInstance?.processName;
  let matchingStep: WorkflowStep | undefined;
  const nodeTitle = getNextStepsResult.node?.title || 'Automatically transitioned by a Neon Integration';

  if (!processName && targetWorkflowName) {
    console.warn(
      `No associated workflow found for this node. Trying to find the workflow by name "${targetWorkflowName}"...`
    );
    const targetWorkflow = getNextStepsResult.availableWorkflows?.find(
      (workflow) => workflow.processInstance?.processName === targetWorkflowName
    );
    if (!targetWorkflow) {
      console.error(`Workflow with name '${targetWorkflowName}' not found`);
      return undefined;
    }
    processName = targetWorkflowName;
    matchingStep = targetWorkflow.steps?.find((step) => step.state.name === targetStateName);
  } else {
    matchingStep = getNextStepsResult.associatedWorkflow?.steps?.find((step) => step.state.name === targetStateName);
  }

  if (!matchingStep) {
    console.error(`Step with state name '${targetStateName}' not found`);
    return undefined;
  }

  return {
    workflowAssignment: {
      title: nodeTitle,
      comment,
      principals,
      prioprity: priority,
    },
    workflowStep: {
      connectorName: matchingStep.name,
      workflowName: processName,
    },
  };
}
