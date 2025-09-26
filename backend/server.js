require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ensureTables, ensureDefaultCategories, ensureCategoryItemsHaveEmployeeId, ensureAssetUsersHasJobTitle, ensureLicenseTables, ensureRequestTables, dropLegacyLaptopAccessoryColumns } = require('./db');
const { ensureDefaultAdmin, loginHandler } = require('./controllers/authController');
const categoriesRouter = require('./routes/categories');
const usersRouter = require('./routes/users');
const requestsRouter = require('./routes/requests');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowNgrok = process.env.CORS_ALLOW_NGROK === undefined || process.env.CORS_ALLOW_NGROK === 'true';

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const u = new URL(origin);
        const isAllowed =
          allowedOrigins.includes(origin) ||
          (allowNgrok && u.hostname.endsWith('ngrok-free.app'));
        return callback(null, isAllowed);
      } catch (e) {
        return callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

app.post('/api/auth/login', loginHandler);
app.use('/api', categoriesRouter);
app.use('/api', usersRouter);
app.use('/api', requestsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureTables();
  await ensureDefaultCategories();
  await ensureCategoryItemsHaveEmployeeId();
  await ensureAssetUsersHasJobTitle();
  await ensureLicenseTables();
  await ensureRequestTables();
  await dropLegacyLaptopAccessoryColumns();
  // No default admin creation; using centralized auth_users
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
