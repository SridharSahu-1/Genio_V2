import { FastifyRequest, FastifyReply } from 'fastify';
import User from '../models/User';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const register = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { username, email, password } = registerSchema.parse(req.body);
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return reply.code(400).send({ message: 'User already exists' });
    }

    const user = await User.create({ username, email, password });

    if (user) {
      const token = req.server.jwt.sign({ id: user._id });
      reply.code(201).send({
        _id: user._id,
        username: user.username,
        email: user.email,
        token,
      });
    } else {
      reply.code(400).send({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    reply.code(400).send({ message: error.message || 'Error registering user' });
  }
};

export const login = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email });

    if (user && (await (user as any).matchPassword(password))) {
      const token = req.server.jwt.sign({ id: user._id });
      reply.send({
        _id: user._id,
        username: user.username,
        email: user.email,
        token,
      });
    } else {
      reply.code(401).send({ message: 'Invalid email or password' });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      reply.code(400).send({ message: error.errors[0]?.message || 'Validation error' });
    } else {
      reply.code(500).send({ message: 'Server error' });
    }
  }
};



