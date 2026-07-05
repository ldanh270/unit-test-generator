// test-fixtures/user.controller.js
import User from '../models/User.js';
import { sendEmail, verifyEmail } from '../services/email.service.js';
import * as bcrypt from 'bcrypt';
import express from 'express';

const router = express.Router();

export async function getUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export const createUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });
    await sendEmail(email, 'Welcome!');
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const internalHelper = () => {
  console.log('Should not be exported');
};

router.get('/users/:id', getUser);
router.post('/users', createUser);
// Route chaining with middleware (just to see if it breaks anything)
router.route('/users/verify').post(verifyEmail);

export default router;
