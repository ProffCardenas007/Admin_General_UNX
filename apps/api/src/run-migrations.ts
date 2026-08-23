import { join } from 'path';

type MigrationModule = { run: () => Promise<void> };

const MIGRATION_SCRIPTS = [
  'migrate-task-activity.js',
  'migrate-task-timer.js',
  'migrate-class-schedule.js',
  'migrate-class-planning.js',
  'migrate-class-subjects.js',
];

export async function runStartupMigrations() {
  for (const script of MIGRATION_SCRIPTS) {
    const scriptPath = join(__dirname, '..', 'scripts', script);
    const { run } = require(scriptPath) as MigrationModule;
    await run();
  }
}
