import {
  Agent,
  AgentRun,
  addAgentApproval,
  addAgentRun,
  addAgentStep,
  getAgentRuns,
  getAgents,
  saveAgentRuns,
  updateAgent,
} from "./db";
import {
  AgentWorkflowDefinition,
  AgentWorkflowTarget,
  buildAgentOperationKey,
  executeAgentWorkflow,
  findDuplicateRun,
  getAgentWorkflows,
  getWorkflowTargets,
} from "./agentRuntime";

let schedulerTimer: number | undefined;
let tickInProgress = false;

function intervalToMs(agent: Agent) {
  const schedule = agent.schedule;
  const every = Math.max(1, schedule?.intervalEvery || 1);
  const unit = schedule?.intervalUnit || "days";
  if (unit === "seconds") return every * 1000;
  if (unit === "minutes") return every * 60 * 1000;
  if (unit === "hours") return every * 60 * 60 * 1000;
  return every * 24 * 60 * 60 * 1000;
}

function sameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isAgentDue(agent: Agent, now: Date) {
  const schedule = agent.schedule;
  if (!schedule || agent.status !== "Active") return false;
  if ((schedule.maxRuns || 0) > 0 && (schedule.executedRuns || 0) >= (schedule.maxRuns || 0)) return false;

  if (schedule.mode === "monthly") {
    const day = Math.min(Math.max(1, schedule.monthlyDay || 1), daysInMonth(now));
    if (now.getDate() !== day) return false;
    if (schedule.lastRunAt && sameLocalDate(new Date(schedule.lastRunAt), now)) return false;
    return true;
  }

  if (!schedule.lastRunAt) return true;
  const lastRunAt = new Date(schedule.lastRunAt).getTime();
  if (Number.isNaN(lastRunAt)) return true;
  return now.getTime() - lastRunAt >= intervalToMs(agent);
}

function markScheduleAttempted(agent: Agent, now: Date) {
  updateAgent(agent.id, {
    schedule: {
      ...agent.schedule,
      mode: agent.schedule?.mode || "interval",
      lastRunAt: now.toISOString(),
      executedRuns: (agent.schedule?.executedRuns || 0) + 1,
    },
  });
}

function writeFailedRun(agent: Agent, message: string, now: Date) {
  const run = addAgentRun({
    agentId: agent.id,
    taskType: `Scheduled: ${agent.name}`,
    status: "Failed",
    currentStep: "Skipped",
    targetType: "global",
    repeatable: true,
    inputJson: { scheduled: true, schedule: agent.schedule },
    outputJson: { reason: message },
    errorMessage: message,
  });
  addAgentStep({
    runId: run.id,
    stepType: "Thought",
    toolName: "scheduler.skip",
    inputJson: { agentId: agent.id, schedule: agent.schedule },
    outputJson: { message },
    status: "Failed",
  });
  markScheduleAttempted(agent, now);
}

function findRunnableTarget(agent: Agent, workflow: AgentWorkflowDefinition, runs: AgentRun[]) {
  const targets = getWorkflowTargets(workflow, agent);
  for (const target of targets) {
    const operationKey = workflow.repeatable ? undefined : buildAgentOperationKey(workflow, target);
    if (!findDuplicateRun(runs, operationKey)) {
      return { target, operationKey };
    }
  }
  return undefined;
}

async function executeScheduledWorkflow(
  agent: Agent,
  workflow: AgentWorkflowDefinition,
  target: AgentWorkflowTarget,
  operationKey: string | undefined,
  now: Date,
) {
  const run = addAgentRun({
    agentId: agent.id,
    workflowId: workflow.id,
    taskType: `Scheduled: ${workflow.name}: ${target.label}`,
    status: agent.harness === "Human-in-the-loop" ? "Pending" : "Running",
    currentStep: agent.harness === "Human-in-the-loop" ? "Awaiting Approval" : "Executing",
    operationKey,
    operationType: workflow.operationType,
    targetType: target.type,
    targetId: target.id,
    repeatable: workflow.repeatable,
    inputJson: {
      scheduled: true,
      workflowId: workflow.id,
      target,
      requiredTools: workflow.requiredTools,
      agentTools: agent.tools || [],
      schedule: agent.schedule,
    },
  });

  addAgentStep({
    runId: run.id,
    stepType: "Thought",
    toolName: "scheduler.trigger",
    inputJson: { agentId: agent.id, workflowId: workflow.id, target },
    outputJson: {
      role: agent.role,
      requiredTools: workflow.requiredTools,
      harness: agent.harness,
    },
    status: "Success",
  });

  if (agent.harness === "Human-in-the-loop") {
    addAgentApproval({
      runId: run.id,
      actionType: "execute_workflow",
      proposedPayload: {
        agentId: agent.id,
        workflowId: workflow.id,
        target,
        scheduled: true,
      },
      status: "Pending",
    });
    markScheduleAttempted(agent, now);
    return;
  }

  try {
    const result = await executeAgentWorkflow(workflow, target, agent);
    result.steps.forEach((step) => {
      addAgentStep({
        runId: run.id,
        stepType: "Tool",
        toolName: step.toolName,
        inputJson: step.inputJson,
        outputJson: step.outputJson,
        status: step.status,
      });
    });
    saveAgentRuns(getAgentRuns().map((item) =>
      item.id === run.id
        ? {
            ...item,
            status: "Completed" as const,
            currentStep: "Completed",
            outputJson: result.outputJson,
            toolResults: result.steps,
          }
        : item,
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduled agent execution failed.";
    addAgentStep({
      runId: run.id,
      stepType: "Tool",
      toolName: workflow.id,
      outputJson: { error: message },
      status: "Failed",
    });
    saveAgentRuns(getAgentRuns().map((item) =>
      item.id === run.id
        ? { ...item, status: "Failed" as const, currentStep: "Failed", errorMessage: message }
        : item,
    ));
  }

  markScheduleAttempted(agent, now);
}

async function runAgentIfDue(agent: Agent, now: Date) {
  if (!isAgentDue(agent, now)) return;

  const workflows = getAgentWorkflows(agent);
  if (workflows.length === 0) {
    writeFailedRun(agent, "No enabled workflow is available for this agent. Check workflow and tool configuration.", now);
    return;
  }

  const runs = getAgentRuns();
  for (const workflow of workflows) {
    const runnable = findRunnableTarget(agent, workflow, runs);
    if (runnable) {
      await executeScheduledWorkflow(agent, workflow, runnable.target, runnable.operationKey, now);
      return;
    }
  }

  writeFailedRun(agent, "No eligible target is available. Existing non-repeatable work was skipped or no CRM data matches this workflow.", now);
}

async function tickAgentScheduler() {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    const now = new Date();
    for (const agent of getAgents()) {
      await runAgentIfDue(agent, now);
    }
  } finally {
    tickInProgress = false;
  }
}

export function startAgentScheduler() {
  if (schedulerTimer !== undefined) return () => {};
  tickAgentScheduler();
  schedulerTimer = window.setInterval(tickAgentScheduler, 1000);
  return () => {
    if (schedulerTimer !== undefined) {
      window.clearInterval(schedulerTimer);
      schedulerTimer = undefined;
    }
  };
}
