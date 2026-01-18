import { FastifyRequest, FastifyReply } from 'fastify';
import User from '../models/User';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
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
    const { email, password } = req.body as any;
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
  } catch (error) {
    reply.code(500).send({ message: 'Server error' });
  }
};



