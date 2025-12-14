const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Helper to hash/check password (In production, use bcrypt)
const mockHash = (pwd) => pwd; // Simple pass-through for demo

// Auth Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    const username = email.split('@')[0];
    
    // Check existing
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const user = await prisma.user.create({
      data: {
        email,
        password: mockHash(password),
        username,
      },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.password !== mockHash(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Session Routes
app.get('/api/sessions', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const sessions = await prisma.chatSession.findMany({
      where: { userId: String(userId) },
      orderBy: { lastUpdated: 'desc' }
    });

    // Parse messages JSON string back to object
    const parsedSessions = sessions.map(s => ({
      ...s,
      messages: JSON.parse(s.messages),
      lastUpdated: new Date(s.lastUpdated).getTime()
    }));

    res.json(parsedSessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { userId, firstMessage } = req.body;
    const title = firstMessage.content.slice(0, 30) + (firstMessage.content.length > 30 ? '...' : '');

    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: title || 'New Chat',
        messages: JSON.stringify([firstMessage]),
        lastUpdated: new Date(),
      }
    });

    res.json({
      ...session,
      messages: JSON.parse(session.messages),
      lastUpdated: new Date(session.lastUpdated).getTime()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { messages } = req.body;

    await prisma.chatSession.update({
      where: { id },
      data: {
        messages: JSON.stringify(messages),
        lastUpdated: new Date()
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.chatSession.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});