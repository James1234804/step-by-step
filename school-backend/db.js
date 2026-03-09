 const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'school.db'  // this creates the school.db file in your folder
});

module.exports = sequelize;