const path = require('path')
const { Sequelize } = require('sequelize')

const config = {
    dialect: 'sqlite',
    storage: path.resolve(__dirname,'backend_service.db')
}

const sequelize = new Sequelize(config)

module.exports = sequelize; 