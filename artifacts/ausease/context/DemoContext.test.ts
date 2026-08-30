import test from 'node:test';
import assert from 'node:assert/strict';
import { getDemoData } from './DemoContext';

test('demo profiles have isolated deterministic operations data', () => {
  const employee = getDemoData('employee');
  const manager = getDemoData('manager');

  assert.equal(employee.profile.displayName, 'Alex Carter');
  assert.equal(manager.profile.displayName, 'Mia Chen');
  assert.notEqual(employee.tasks, manager.tasks);
  employee.tasks[0].done = true;
  assert.equal(manager.tasks[0].done, false);
  assert.equal(employee.presence.allowed, true);
  assert.equal(manager.commandCenter.metrics.tasksTotal, manager.tasks.length);
});

test('viewer demo profile is local and read-only by identity', () => {
  const viewer = getDemoData('viewer');

  assert.equal(viewer.profile.demoKey, 'viewer');
  assert.equal(viewer.profile.role, 'employee');
  assert.equal(viewer.profile.roleLabel, 'Read-only viewer');
  assert.match(viewer.profile.userId, /^demo-/);
});

test('demo data includes written checklists and supports local profile details', () => {
  const edited = getDemoData('employee', {
    displayName: 'Casey Nguyen',
    initials: 'CN',
    roleLabel: 'Opening lead',
  });

  assert.equal(edited.profile.displayName, 'Casey Nguyen');
  assert.equal(edited.profile.initials, 'CN');
  assert.equal(edited.profile.roleLabel, 'Opening lead');
  assert.equal(edited.checklists.length, 3);
  assert.equal(edited.checklists[0].items.length, 4);
  assert.match(edited.checklists[0].items[0].guidance, /exits/i);
  assert.equal(edited.checklists[0].version, 1);
  assert.equal(edited.checklists[0].status, 'published');
  assert.equal(edited.checklists[0].effectiveDate, '2026-08-25');
  assert.ok(edited.checklists[0].assignedStores.includes('demo-pitt-street'));
  assert.ok(edited.checklists[0].assignedRoles.includes('employee'));
  assert.equal(edited.checklists[1].items.filter((item) => item.done).length, 2);
  assert.equal(edited.tasks.every((task) => task.assignee === 'Casey Nguyen'), true);
});