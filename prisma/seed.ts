import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { Role, Priority } from '../generated/prisma/enums.js';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const managerEmail = process.env['SEED_MANAGER_EMAIL'] ?? 'manager@example.com';
  const managerPassword = process.env['SEED_MANAGER_PASSWORD'] ?? 'Manager@123';
  const memberPassword = 'Member@123';

  const hashedManagerPassword = await bcrypt.hash(managerPassword, 10);
  const hashedMemberPassword = await bcrypt.hash(memberPassword, 10);

  // Upsert manager
  const manager = await prisma.user.upsert({
    where: { email: managerEmail },
    update: {},
    create: {
      email: managerEmail,
      name: 'Default Manager',
      password: hashedManagerPassword,
      role: Role.MANAGER,
    },
  });

  // Upsert team member 1
  const member1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Johnson',
      password: hashedMemberPassword,
      role: Role.TEAM_MEMBER,
    },
  });

  // Upsert team member 2
  const member2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Smith',
      password: hashedMemberPassword,
      role: Role.TEAM_MEMBER,
    },
  });

  // Upsert board
  const board = await prisma.board.upsert({
    where: { id: 'seed-board-001' },
    update: {},
    create: {
      id: 'seed-board-001',
      name: 'Sprint 1 - Kanban Board',
      ownerId: manager.id,
    },
  });

  // Add members to board (upsert)
  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: board.id, userId: manager.id } },
    update: {},
    create: { boardId: board.id, userId: manager.id },
  });
  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: board.id, userId: member1.id } },
    update: {},
    create: { boardId: board.id, userId: member1.id },
  });
  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: board.id, userId: member2.id } },
    update: {},
    create: { boardId: board.id, userId: member2.id },
  });

  // Upsert columns
  const todoColumn = await prisma.column.upsert({
    where: { id: 'seed-col-todo' },
    update: {},
    create: { id: 'seed-col-todo', name: 'To Do', boardId: board.id, position: 0, color: '#6366f1' },
  });
  const inProgressColumn = await prisma.column.upsert({
    where: { id: 'seed-col-inprogress' },
    update: {},
    create: { id: 'seed-col-inprogress', name: 'In Progress', boardId: board.id, position: 1, color: '#f59e0b' },
  });
  const doneColumn = await prisma.column.upsert({
    where: { id: 'seed-col-done' },
    update: {},
    create: { id: 'seed-col-done', name: 'Done', boardId: board.id, position: 2, color: '#10b981' },
  });

  // Upsert tags
  const tags = await Promise.all([
    prisma.tag.upsert({ where: { id: 'seed-tag-fe' }, update: {}, create: { id: 'seed-tag-fe', name: 'Frontend', color: '#3b82f6', boardId: board.id } }),
    prisma.tag.upsert({ where: { id: 'seed-tag-be' }, update: {}, create: { id: 'seed-tag-be', name: 'Backend', color: '#8b5cf6', boardId: board.id } }),
    prisma.tag.upsert({ where: { id: 'seed-tag-bug' }, update: {}, create: { id: 'seed-tag-bug', name: 'Bug', color: '#ef4444', boardId: board.id } }),
    prisma.tag.upsert({ where: { id: 'seed-tag-feat' }, update: {}, create: { id: 'seed-tag-feat', name: 'Feature', color: '#10b981', boardId: board.id } }),
    prisma.tag.upsert({ where: { id: 'seed-tag-docs' }, update: {}, create: { id: 'seed-tag-docs', name: 'Docs', color: '#f97316', boardId: board.id } }),
  ]);

  const now = new Date();
  const tasks = [
    { id: 'seed-task-001', title: 'Set up project repository', desc: 'Initialize Git repository and configure CI/CD pipeline', priority: Priority.HIGH, columnId: doneColumn.id, position: 0, assigneeId: manager.id, dueDate: new Date(now.getTime() - 7 * 86400000), tagIds: [tags[1].id, tags[4].id] },
    { id: 'seed-task-002', title: 'Design database schema', desc: 'Create Prisma schema with all models and relations', priority: Priority.HIGH, columnId: doneColumn.id, position: 1, assigneeId: manager.id, dueDate: new Date(now.getTime() - 5 * 86400000), tagIds: [tags[1].id] },
    { id: 'seed-task-003', title: 'Implement authentication module', desc: 'JWT-based auth with access and refresh tokens', priority: Priority.HIGH, columnId: inProgressColumn.id, position: 0, assigneeId: member1.id, dueDate: new Date(now.getTime() + 1 * 86400000), tagIds: [tags[1].id, tags[3].id] },
    { id: 'seed-task-004', title: 'Build Kanban board UI', desc: 'Drag-and-drop board with columns and cards', priority: Priority.MEDIUM, columnId: inProgressColumn.id, position: 1, assigneeId: member1.id, dueDate: new Date(now.getTime() + 3 * 86400000), tagIds: [tags[0].id, tags[3].id] },
    { id: 'seed-task-005', title: 'Fix login page redirect bug', desc: 'After login, users are redirected to 404 instead of dashboard', priority: Priority.HIGH, columnId: inProgressColumn.id, position: 2, assigneeId: member2.id, dueDate: new Date(now.getTime() - 1 * 86400000), tagIds: [tags[0].id, tags[2].id] },
    { id: 'seed-task-006', title: 'Write API documentation', desc: 'Document all endpoints in Swagger and README', priority: Priority.LOW, columnId: todoColumn.id, position: 0, assigneeId: member2.id, dueDate: new Date(now.getTime() + 7 * 86400000), tagIds: [tags[4].id] },
    { id: 'seed-task-007', title: 'Implement task filtering', desc: 'Add filter by priority, assignee, tags, and due date', priority: Priority.MEDIUM, columnId: todoColumn.id, position: 1, assigneeId: member1.id, dueDate: new Date(now.getTime() + 4 * 86400000), tagIds: [tags[0].id, tags[1].id, tags[3].id] },
    { id: 'seed-task-008', title: 'Add real-time notifications', desc: 'WebSocket notifications for task assignments and comments', priority: Priority.LOW, columnId: todoColumn.id, position: 2, assigneeId: member2.id, dueDate: new Date(now.getTime() + 10 * 86400000), tagIds: [tags[3].id] },
    { id: 'seed-task-009', title: 'Performance optimization', desc: 'Optimize database queries and add caching for frequently accessed data', priority: Priority.MEDIUM, columnId: todoColumn.id, position: 3, assigneeId: manager.id, dueDate: new Date(now.getTime() + 14 * 86400000), tagIds: [tags[1].id] },
    { id: 'seed-task-010', title: 'Security audit', desc: 'Review authentication, authorization, and input validation', priority: Priority.HIGH, columnId: todoColumn.id, position: 4, assigneeId: manager.id, dueDate: new Date(now.getTime() + 5 * 86400000), tagIds: [tags[2].id, tags[1].id] },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id,
        title: task.title,
        description: task.desc,
        priority: task.priority,
        columnId: task.columnId,
        position: task.position,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate,
        tags: {
          create: task.tagIds.map((tagId) => ({ tagId })),
        },
      },
    });
  }

  // Add checklist to first in-progress task
  await prisma.checklistItem.upsert({
    where: { id: 'seed-check-001' },
    update: {},
    create: { id: 'seed-check-001', taskId: 'seed-task-003', text: 'Implement register endpoint', done: true, position: 0 },
  });
  await prisma.checklistItem.upsert({
    where: { id: 'seed-check-002' },
    update: {},
    create: { id: 'seed-check-002', taskId: 'seed-task-003', text: 'Implement login endpoint', done: true, position: 1 },
  });
  await prisma.checklistItem.upsert({
    where: { id: 'seed-check-003' },
    update: {},
    create: { id: 'seed-check-003', taskId: 'seed-task-003', text: 'Implement refresh token', done: false, position: 2 },
  });
  await prisma.checklistItem.upsert({
    where: { id: 'seed-check-004' },
    update: {},
    create: { id: 'seed-check-004', taskId: 'seed-task-003', text: 'Write unit tests for auth service', done: false, position: 3 },
  });
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('✅ Seed completed successfully');
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
