 const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Store = sequelize.define('Store', {
    key: { type: DataTypes.STRING, unique: true },
    value: { type: DataTypes.TEXT }
}, { freezeTableName: false, tableName: 'Stores' });

Store.sync();
module.exports = Store;