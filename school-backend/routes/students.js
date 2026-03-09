 const express = require('express');
const router = express.Router();
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Student = sequelize.define('Student', {
  name: DataTypes.STRING,
  age: DataTypes.INTEGER,
  class_id: DataTypes.INTEGER
});

// Get all students
router.get('/', async (req, res) => {
  const students = await Student.findAll();
  res.json(students);
});

// Add student
router.post('/', async (req, res) => {
  const student = await Student.create(req.body);
  res.json(student);
});

// Update student
router.put('/:id', async (req, res) => {
  await Student.update(req.body, { where: { id: req.params.id } });
  res.json({ message: 'Student updated' });
});

// Delete student
router.delete('/:id', async (req, res) => {
  await Student.destroy({ where: { id: req.params.id } });
  res.json({ message: 'Student deleted' });
});

module.exports = router;