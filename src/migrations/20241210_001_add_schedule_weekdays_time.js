'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add weekdays column - array of integers (0-6 for Sunday-Saturday)
    await queryInterface.addColumn('Schedules', 'weekdays', {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: true,
      defaultValue: null,
    });

    // Add time_slots column - JSONB for multiple time windows
    // e.g., [{"start": "06:00", "end": "10:00"}, {"start": "18:00", "end": "22:00"}]
    await queryInterface.addColumn('Schedules', 'time_slots', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('Schedules', ['weekdays'], {
      name: 'schedules_weekdays_idx',
      using: 'GIN', // GIN index for array columns
    });

    await queryInterface.addIndex('Schedules', ['time_slots'], {
      name: 'schedules_time_slots_idx',
      using: 'GIN', // GIN index for JSONB columns
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('Schedules', 'schedules_time_slots_idx');
    await queryInterface.removeIndex('Schedules', 'schedules_weekdays_idx');
    await queryInterface.removeColumn('Schedules', 'time_slots');
    await queryInterface.removeColumn('Schedules', 'weekdays');
  }
};

