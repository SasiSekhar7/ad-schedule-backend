'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CarouselItems', {
      carousel_item_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      carousel_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Carousels',
          key: 'carousel_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      ad_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Ads',
          key: 'ad_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('CarouselItems', ['carousel_id']);
    await queryInterface.addIndex('CarouselItems', ['ad_id']);
    await queryInterface.addIndex('CarouselItems', ['display_order']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('CarouselItems');
  }
};

