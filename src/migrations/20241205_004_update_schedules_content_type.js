'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if ad_id column exists (for existing installations)
    const tableInfo = await queryInterface.describeTable('Schedules');
    
    // Add content_id column if it doesn't exist
    if (!tableInfo.content_id) {
      await queryInterface.addColumn('Schedules', 'content_id', {
        type: Sequelize.UUID,
        allowNull: true, // Initially allow null for migration
      });
    }

    // Add content_type column if it doesn't exist
    if (!tableInfo.content_type) {
      await queryInterface.addColumn('Schedules', 'content_type', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'ad',
      });
    }

    // If ad_id exists, migrate data to content_id
    if (tableInfo.ad_id) {
      // Copy ad_id values to content_id
      await queryInterface.sequelize.query(`
        UPDATE "Schedules" 
        SET content_id = ad_id, content_type = 'ad' 
        WHERE ad_id IS NOT NULL AND content_id IS NULL
      `);

      // Now make content_id NOT NULL
      await queryInterface.changeColumn('Schedules', 'content_id', {
        type: Sequelize.UUID,
        allowNull: false,
      });

      // Drop the old ad_id column
      await queryInterface.removeColumn('Schedules', 'ad_id');
    } else {
      // No ad_id column, just make content_id required
      await queryInterface.changeColumn('Schedules', 'content_id', {
        type: Sequelize.UUID,
        allowNull: false,
      });
    }

    // Add indexes
    await queryInterface.addIndex('Schedules', ['content_id']);
    await queryInterface.addIndex('Schedules', ['content_type']);
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Schedules');

    // Add back ad_id column
    if (!tableInfo.ad_id) {
      await queryInterface.addColumn('Schedules', 'ad_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });

      // Copy content_id back to ad_id where content_type is 'ad'
      await queryInterface.sequelize.query(`
        UPDATE "Schedules" 
        SET ad_id = content_id 
        WHERE content_type = 'ad'
      `);
    }

    // Remove content_type column
    if (tableInfo.content_type) {
      await queryInterface.removeColumn('Schedules', 'content_type');
    }

    // Remove content_id column
    if (tableInfo.content_id) {
      await queryInterface.removeColumn('Schedules', 'content_id');
    }
  }
};

