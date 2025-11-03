
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@flashsale.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';

// Postgres pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) { cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g,'_')); }
});
const upload = multer({ storage });

async function ensureTables(){
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      image TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      items JSONB,
      total_cents INTEGER,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      email TEXT,
      amount_cents INTEGER,
      message TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}

function requireAuth(req,res,next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'Unauthorized'});
  const token = auth.split(' ')[1];
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    if(payload && payload.role === 'admin') return next();
    return res.status(403).json({error:'Forbidden'});
  }catch(e){ return res.status(401).json({error:'Invalid token'}) }
}

app.use('/admin/static', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req,res)=>{ res.sendFile(path.join(__dirname,'admin','index.html')); });

app.post('/api/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  if(email === ADMIN_EMAIL && password === ADMIN_PASSWORD){
    const token = jwt.sign({ role:'admin', email }, JWT_SECRET, { expiresIn:'7d' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/products', async (req,res)=>{
  const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/products', requireAuth, upload.single('image'), async (req,res)=>{
  const { title, description, price, stock } = req.body;
  let imagePath = req.body.image || null;
  if(req.file) imagePath = '/uploads/' + req.file.filename;
  const price_cents = Math.round(Number(price || 0) * 100);
  const q = 'INSERT INTO products(title,description,price_cents,stock,image) VALUES($1,$2,$3,$4,$5) RETURNING *';
  const vals = [title, description, price_cents, Number(stock||0), imagePath];
  const { rows } = await pool.query(q, vals);
  res.json(rows[0]);
});

app.put('/api/products/:id', requireAuth, upload.single('image'), async (req,res)=>{
  const id = req.params.id;
  const { title, description, price, stock } = req.body;
  let imagePath = req.body.image || null;
  if(req.file) imagePath = '/uploads/' + req.file.filename;
  const price_cents = price ? Math.round(Number(price) * 100) : undefined;
  const q = 'UPDATE products SET title=COALESCE($1,title), description=COALESCE($2,description), price_cents=COALESCE($3,price_cents), stock=COALESCE($4,stock), image=COALESCE($5,image) WHERE id=$6 RETURNING *';
  const vals = [title || null, description || null, price_cents || null, (stock!==undefined?Number(stock):null), imagePath || null, id];
  const { rows } = await pool.query(q, vals);
  res.json(rows[0]);
});

app.delete('/api/products/:id', requireAuth, async (req,res)=>{
  const id = req.params.id;
  await pool.query('DELETE FROM products WHERE id=$1', [id]);
  res.json({ success:true });
});

app.post('/api/orders/checkout', async (req,res)=>{
  const { items } = req.body;
  const line_items = [];
  for(const it of items){
    const { rows } = await pool.query('SELECT * FROM products WHERE id=$1', [it.id]);
    const p = rows[0];
    if(!p) return res.status(400).json({ error: 'Product not found' });
    line_items.push({
      price_data: {
        currency: 'usd',
        product_data: { name: p.title },
        unit_amount: p.price_cents
      },
      quantity: it.quantity || 1
    });
  }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items,
    mode: 'payment',
    success_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '?checkout=success',
    cancel_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '?checkout=cancel'
  });
  res.json({ url: session.url });
});

app.post('/api/donations/checkout', async (req,res)=>{
  const { amount, name } = req.body;
  const amt = Math.round(Number(amount) * 100);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price_data:{ currency:'usd', product_data:{ name: 'Donation' }, unit_amount: amt }, quantity:1 }],
    mode: 'payment',
    success_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '?donation=success',
    cancel_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '?donation=cancel'
  });
  res.json({ url: session.url });
});

app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req,res)=>{
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event;
  try{
    if(secret){
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } else {
      event = req.body;
    }
  }catch(err){
    console.error('Webhook error', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if(event.type === 'checkout.session.completed'){
    console.log('Checkout complete', event.id);
  }

  res.json({ received:true });
});

app.use('/uploads', express.static(uploadsDir));
app.get('/', (req,res)=> res.json({ ok:true, msg:'FlashSale backend' }));

(async ()=>{
  try{
    await pool.connect();
    await ensureTables();
    app.listen(PORT, ()=> console.log('Server listening on', PORT));
  }catch(e){
    console.error('Startup error', e);
    process.exit(1);
  }
})();
