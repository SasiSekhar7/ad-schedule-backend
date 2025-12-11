/**
 * Simple migration runner script
 * 
 * Usage: node src/migrations/run-migrations.js [up|down]
 */

const path = require('path');
const fs = require('fs');
const sequelize = require('../db');
const { Sequelize, DataTypes } = require('sequelize');

// Migration tracking table
const createMigrationTable = async (queryInterface) => {
  const tableExists = await queryInterface.showAllTables();
  if (!tableExists.includes('SequelizeMeta')) {
    await queryInterface.createTable('SequelizeMeta', {
      name: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      executed_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      }
    });
    console.log('Created SequelizeMeta table');
  }
};

// Get executed migrations
const getExecutedMigrations = async (queryInterface) => {
  try {
    const [results] = await queryInterface.sequelize.query(
      'SELECT name FROM "SequelizeMeta" ORDER BY name'
    );
    return results.map(r => r.name);
  } catch (error) {
    return [];
  }
};

// Record migration as executed
const recordMigration = async (queryInterface, name) => {
  await queryInterface.sequelize.query(
    `INSERT INTO "SequelizeMeta" (name, executed_at) VALUES ('${name}', NOW())`
  );
};

// Remove migration record
const removeMigrationRecord = async (queryInterface, name) => {
  await queryInterface.sequelize.query(
    `DELETE FROM "SequelizeMeta" WHERE name = '${name}'`
  );
};

// Get migration files
const getMigrationFiles = () => {
  const migrationsPath = __dirname;
  const files = fs.readdirSync(migrationsPath)
    .filter(f => f.endsWith('.js') && f !== 'run-migrations.js')
    .sort();
  return files;
};

const runMigrations = async (direction = 'up') => {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.\n');

    await createMigrationTable(queryInterface);
    
    const migrationFiles = getMigrationFiles();
    const executedMigrations = await getExecutedMigrations(queryInterface);
    
    console.log(`Found ${migrationFiles.length} migration files.`);
    console.log(`Already executed: ${executedMigrations.length} migrations.\n`);

    if (direction === 'up') {
      // Run pending migrations
      const pendingMigrations = migrationFiles.filter(f => !executedMigrations.includes(f));
      
      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to run.');
        return;
      }

      console.log(`Running ${pendingMigrations.length} pending migrations...\n`);

      for (const file of pendingMigrations) {
        console.log(`Migrating: ${file}`);
        const migration = require(path.join(__dirname, file));
        await migration.up(queryInterface, Sequelize);
        await recordMigration(queryInterface, file);
        console.log(`✓ Completed: ${file}\n`);
      }

      console.log('All migrations completed successfully!');

    } else if (direction === 'down') {
      // Rollback last migration
      if (executedMigrations.length === 0) {
        console.log('No migrations to rollback.');
        return;
      }

      const lastMigration = executedMigrations[executedMigrations.length - 1];
      console.log(`Rolling back: ${lastMigration}`);
      
      const migration = require(path.join(__dirname, lastMigration));
      await migration.down(queryInterface, Sequelize);
      await removeMigrationRecord(queryInterface, lastMigration);
      
      console.log(`✓ Rolled back: ${lastMigration}`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Parse command line args
const direction = process.argv[2] || 'up';

if (!['up', 'down'].includes(direction)) {
  console.log('Usage: node run-migrations.js [up|down]');
  console.log('  up   - Run pending migrations (default)');
  console.log('  down - Rollback last migration');
  process.exit(1);
}

runMigrations(direction);

