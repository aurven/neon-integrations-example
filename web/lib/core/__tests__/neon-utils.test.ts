import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowTransitionTo, nextStepAssignmentBodyGenerator } from '../neon-utils';
import { getNextSteps, nextStepAssignment } from '../neon-bo-api-v3';

vi.mock('../neon-bo-api-v3', () => ({
  getNextSteps: vi.fn(),
  nextStepAssignment: vi.fn(),
}));

const mockGetNextSteps = getNextSteps as unknown as ReturnType<typeof vi.fn>;
const mockNextStepAssignment = nextStepAssignment as unknown as ReturnType<typeof vi.fn>;

describe('workflowTransitionTo', () => {
  beforeEach(() => {
    mockGetNextSteps.mockReset();
    mockNextStepAssignment.mockReset();
  });

  it('is a no-op when the node is already in the target state of the target workflow', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'Title' },
        associatedWorkflow: { processInstance: { processName: 'Story', state: 'Edit' }, steps: [] },
      },
    });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Edit' });

    expect(mockNextStepAssignment).not.toHaveBeenCalled();
  });

  it('transitions via the associated workflow when the state differs', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'My Story' },
        associatedWorkflow: {
          processInstance: { processName: 'Story', state: 'Created' },
          steps: [{ name: 'edit-step', state: { name: 'Edit' } }],
        },
      },
    });
    mockNextStepAssignment.mockResolvedValue({ status: 200 });

    await workflowTransitionTo({
      familyRef: 'fam-1',
      targetWorkflowName: 'Story',
      targetStateName: 'Edit',
      principals: ['user-1'],
      comment: 'go',
    });

    expect(mockNextStepAssignment).toHaveBeenCalledWith('fam-1', {
      workflowAssignment: {
        title: 'My Story',
        comment: 'go',
        principals: ['user-1'],
        prioprity: 0,
      },
      workflowStep: {
        connectorName: 'edit-step',
        workflowName: 'Story',
      },
    });
  });

  it('falls back to availableWorkflows when there is no associated workflow', async () => {
    mockGetNextSteps.mockResolvedValue({
      data: {
        node: { familyRef: 'fam-1', title: 'My Story' },
        associatedWorkflow: {},
        availableWorkflows: [
          {
            processInstance: { processName: 'Story' },
            steps: [{ name: 'ready-step', state: { name: 'Ready' } }],
          },
        ],
      },
    });
    mockNextStepAssignment.mockResolvedValue({ status: 200 });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Ready' });

    expect(mockNextStepAssignment).toHaveBeenCalledWith(
      'fam-1',
      expect.objectContaining({ workflowStep: { connectorName: 'ready-step', workflowName: 'Story' } })
    );
  });

  it('does nothing when the node familyRef does not match', async () => {
    mockGetNextSteps.mockResolvedValue({ data: { node: { familyRef: 'other' } } });

    await workflowTransitionTo({ familyRef: 'fam-1', targetWorkflowName: 'Story', targetStateName: 'Edit' });

    expect(mockNextStepAssignment).not.toHaveBeenCalled();
  });
});

describe('nextStepAssignmentBodyGenerator', () => {
  it('returns undefined when no matching step is found', () => {
    const result = nextStepAssignmentBodyGenerator({
      getNextStepsResult: {
        node: { familyRef: 'fam-1', title: 'Title' },
        associatedWorkflow: { processInstance: { processName: 'Story' }, steps: [] },
      },
      targetWorkflowName: 'Story',
      targetStateName: 'Ready',
      priority: 0,
      principals: [],
      comment: '',
    });

    expect(result).toBeUndefined();
  });
});
