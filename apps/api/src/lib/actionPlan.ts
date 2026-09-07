import { prisma } from './prisma.js';
import { calculateReadinessScore, type ReadinessScoreResult } from './readinessScore.js';

export type ActionPlanItem = {
  id: string;
  title: string;
  description: string;
  category: 'profile' | 'creditData' | 'utilization' | 'derogatory' | 'activity' | 'education' | 'dispute' | 'funding' | 'business';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dueDate?: Date;
  completedAt?: Date;
  source: 'readiness_score' | 'analysis' | 'manual' | 'system';
  estimatedImpact?: string;
  createdAt: Date;
};

export type ActionPlan = {
  items: ActionPlanItem[];
  generatedAt: string;
  readinessScore: number;
  readinessLabel: string;
  nextCheckInDue: string;
};

// Map readiness recommendations to structured action items
function readinessActionsToPlanItems(
  readiness: ReadinessScoreResult,
  existingTasks: Array<{ title: string; completed: boolean }>
): Omit<ActionPlanItem, 'id' | 'createdAt'>[] {
  const items: Omit<ActionPlanItem, 'id' | 'createdAt'>[] = [];
  const existingTitles = new Set(existingTasks.map(t => t.title.toLowerCase()));

  // Profile actions
  const profileScore = readiness.categories.find(c => c.key === 'profile')?.score;
  if (profileScore !== undefined && profileScore < 15) {
    const title = 'Complete profile setup';
    if (!existingTitles.has(title.toLowerCase())) {
      items.push({
        title,
        description: 'Add your current address and complete onboarding so CredX can evaluate readiness accurately.',
        category: 'profile',
        priority: 'critical',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Improves profile foundation score'
      });
    }
  }

  // Credit report actions
  const creditDataScore = readiness.categories.find(c => c.key === 'creditData')?.score;
  if (creditDataScore !== undefined && creditDataScore < 20) {
    const title = 'Upload current credit report';
    if (!existingTitles.has(title.toLowerCase())) {
      items.push({
        title,
        description: 'Upload a current credit report from all three bureaus for accurate analysis.',
        category: 'creditData',
        priority: 'critical',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Enables full credit analysis and dispute identification'
      });
    }
  }

  // Utilization actions
  const utilScore = readiness.categories.find(c => c.key === 'utilization')?.score;
  if (utilScore !== undefined && utilScore < 15) {
    const title = 'Reduce revolving utilization';
    if (!existingTitles.has(title.toLowerCase())) {
      items.push({
        title,
        description: 'Pay down revolving balances before statement close to improve utilization ratio.',
        category: 'utilization',
        priority: 'high',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Can significantly improve readiness score'
      });
    }
  }

  // Derogatory actions
  const deroScore = readiness.categories.find(c => c.key === 'derogatory')?.score;
  if (deroScore !== undefined && deroScore < 20) {
    const title = 'Review derogatory items';
    if (!existingTitles.has(title.toLowerCase())) {
      items.push({
        title,
        description: 'Review negative items for accuracy. Document any inaccuracies for potential disputes.',
        category: 'derogatory',
        priority: 'high',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Addresses factors limiting readiness'
      });
    }
  }

  // Education actions
  const educationScore = readiness.categories.find(c => c.key === 'education')?.score;
  if (educationScore !== undefined && educationScore < 10) {
    const title = 'Complete Learning Center module';
    if (!existingTitles.has(title.toLowerCase())) {
      items.push({
        title,
        description: 'Start with Credit Fundamentals to build knowledge for better decisions.',
        category: 'education',
        priority: 'medium',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Builds financial literacy foundation'
      });
    }
  }

  // Add next best actions from readiness score
  for (const action of readiness.nextBestActions.slice(0, 3)) {
    const title = action.length > 80 ? action.slice(0, 80) + '...' : action;
    if (!existingTitles.has(title.toLowerCase()) && !items.find(i => i.title.toLowerCase() === title.toLowerCase())) {
      items.push({
        title,
        description: action,
        category: 'activity',
        priority: 'medium',
        status: 'pending',
        source: 'readiness_score',
        estimatedImpact: 'Recommended based on current readiness profile'
      });
    }
  }

  return items;
}

export async function generateActionPlan(clientId: string): Promise<ActionPlan> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      progress: true,
      tasks: true,
      creditReports: { include: { tradelines: true } }
    }
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const readiness = calculateReadinessScore(client);
  const existingTasks = client.tasks || [];

  // Generate new plan items from readiness
  const newItems = readinessActionsToPlanItems(readiness, existingTasks);

  // Create tasks in database
  const createdItems: ActionPlanItem[] = [];
  for (const item of newItems) {
    const task = await prisma.task.create({
      data: {
        clientId,
        title: item.title,
        description: item.description,
        completed: false,
        dueAt: item.dueDate
      }
    });

    createdItems.push({
      id: task.id,
      title: task.title,
      description: task.description || '',
      category: item.category,
      priority: item.priority,
      status: item.status,
      dueDate: task.dueAt || undefined,
      source: item.source,
      estimatedImpact: item.estimatedImpact,
      createdAt: task.createdAt
    });
  }

  // Include existing incomplete tasks
  const existingItems: ActionPlanItem[] = existingTasks
    .filter(t => !t.completed)
    .map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      category: 'activity' as const,
      priority: 'medium' as const,
      status: 'pending' as const,
      source: 'manual' as const,
      createdAt: t.createdAt
    }));

  // Calculate next check-in (7 days from now)
  const nextCheckInDue = new Date();
  nextCheckInDue.setDate(nextCheckInDue.getDate() + 7);

  return {
    items: [...existingItems, ...createdItems],
    generatedAt: new Date().toISOString(),
    readinessScore: readiness.score,
    readinessLabel: readiness.label,
    nextCheckInDue: nextCheckInDue.toISOString()
  };
}

export async function getActionPlan(clientId: string): Promise<ActionPlan> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      tasks: { orderBy: { createdAt: 'desc' } },
      readinessSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const latestSnapshot = client.readinessSnapshots[0];
  const tasks = client.tasks || [];

  const items: ActionPlanItem[] = tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    category: 'activity',
    priority: 'medium',
    status: t.completed ? 'completed' : 'pending',
    dueDate: t.dueAt || undefined,
    completedAt: t.completed ? t.updatedAt : undefined,
    source: 'manual',
    createdAt: t.createdAt
  }));

  const nextCheckInDue = new Date();
  nextCheckInDue.setDate(nextCheckInDue.getDate() + 7);

  return {
    items,
    generatedAt: latestSnapshot?.createdAt.toISOString() || new Date().toISOString(),
    readinessScore: latestSnapshot?.score || 0,
    readinessLabel: (latestSnapshot?.label as ActionPlan['readinessLabel']) || 'Needs Foundation',
    nextCheckInDue: nextCheckInDue.toISOString()
  };
}

export async function completeActionItem(taskId: string, clientId: string): Promise<ActionPlanItem> {
  const task = await prisma.task.update({
    where: { id: taskId, clientId },
    data: { completed: true, updatedAt: new Date() }
  });

  // Create activity event
  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'action_completed',
      message: `Completed: ${task.title}`,
      metadata: { taskId: task.id }
    }
  });

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    category: 'activity',
    priority: 'medium',
    status: 'completed',
    completedAt: task.updatedAt,
    source: 'manual',
    createdAt: task.createdAt
  };
}

export async function skipActionItem(taskId: string, clientId: string, reason?: string): Promise<ActionPlanItem> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, clientId } });
  if (!existing) {
    throw new Error('Task not found');
  }

  const task = await prisma.task.update({
    where: { id: taskId, clientId },
    data: {
      completed: false,
      description: reason ? `${existing.description || ''} (Skipped: ${reason})` : existing.description,
      updatedAt: new Date()
    }
  });

  await prisma.activityEvent.create({
    data: {
      clientId,
      type: 'action_skipped',
      message: `Skipped: ${task.title}${reason ? ` - ${reason}` : ''}`,
      metadata: { taskId: task.id, reason }
    }
  });

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    category: 'activity',
    priority: 'medium',
    status: 'skipped',
    source: 'manual',
    createdAt: task.createdAt
  };
}
