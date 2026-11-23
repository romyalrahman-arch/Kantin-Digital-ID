const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inisialisasi Database SQLite
const db = new DatabaseSync(path.join(DATA_DIR, 'kantin.db'));

// Setup Tabel
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    img TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER
  );
`);

// Cek antrean awal
const qRow = db.prepare("SELECT value FROM settings WHERE key = 'current_queue'").get();
if (!qRow) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('current_queue', '1')").run();
}

// Cek produk default
const countRow = db.prepare("SELECT COUNT(*) as count FROM products").get();
if (countRow.count === 0) {
  const defaultProducts = [
    { id: 'p1', name: 'Nasi Goreng Spesial + Telur Mata Sapi', price: 20000, img: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' },
    { id: 'p2', name: 'Burger Daging Keju Lumer', price: 25000, img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' },
    { id: 'p3', name: 'Ayam Geprek Sambal Bawang', price: 18000, img: 'https://images.unsplash.com/photo-1626082895617-2c6ad3ef5eb9?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' },
    { id: 'p4', name: 'Es Kopi Susu Aren Gula Asli', price: 12000, img: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' },
    { id: 'p5', name: 'Es Teh Manis Jumbo Segar', price: 5000, img: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' },
    { id: 'p6', name: 'Salad Buah Premium Kekinian', price: 15000, img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80' }
  ];
  const insertStmt = db.prepare("INSERT INTO products (id, name, price, img, created_at) VALUES (?, ?, ?, ?, ?)");
  for (const p of defaultProducts) {
    insertStmt.run(p.id, p.name, p.price, p.img, Date.now());
  }
}

// SSE (Server-Sent Events) Subscribers untuk sinkronisasi Real-time
const sseClients = new Set();

function broadcastEvent(eventType, payload) {
  const data = JSON.stringify({ type: eventType, data: payload, timestamp: Date.now() });
  for (const client of sseClients) {
    try {
      client.write(`event: ${eventType}\ndata: ${data}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Helper membaca JSON dari request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) { // Max 20MB (untuk foto menu Base64)
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // 1. SSE Realtime Endpoint
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 2. API GET /api/products
    if (pathname === '/api/products' && req.method === 'GET') {
      const rows = db.prepare("SELECT * FROM products ORDER BY created_at ASC").all();
      return sendJson(res, 200, rows);
    }

    // 3. API POST /api/products
    if (pathname === '/api/products' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name || !body.price) {
        return sendJson(res, 400, { error: 'Nama dan harga wajib diisi' });
      }
      const id = 'p_' + Date.now();
      const price = parseInt(body.price, 10);
      const img = body.img || 'https://placehold.co/600x400/f8fafc/94a3b8?text=Foto+Menu';
      const createdAt = Date.now();

      db.prepare("INSERT INTO products (id, name, price, img, created_at) VALUES (?, ?, ?, ?, ?)").run(
        id, body.name, price, img, createdAt
      );

      const newProduct = { id, name: body.name, price, img, created_at: createdAt };
      broadcastEvent('products_updated', { action: 'add', product: newProduct });
      return sendJson(res, 201, newProduct);
    }

    // 4. API DELETE /api/products/:id
    if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/products/', '');
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
      broadcastEvent('products_updated', { action: 'delete', id });
      return sendJson(res, 200, { success: true, id });
    }

    // 5. API GET /api/orders
    if (pathname === '/api/orders' && req.method === 'GET') {
      const rows = db.prepare("SELECT * FROM orders WHERE status != 'archived' ORDER BY created_at ASC").all();
      const orders = rows.map(r => ({
        ...r,
        items: JSON.parse(r.items)
      }));
      return sendJson(res, 200, orders);
    }

    // 6. API POST /api/orders
    if (pathname === '/api/orders' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.items || !body.items.length) {
        return sendJson(res, 400, { error: 'Keranjang kosong' });
      }

      // Hitung / dapatkan nomor antrean berikutnya
      const qRow = db.prepare("SELECT value FROM settings WHERE key = 'current_queue'").get();
      let currentQ = qRow ? parseInt(qRow.value, 10) : 1;
      const orderId = String(currentQ).padStart(3, '0');

      // Update antrean berikutnya
      let nextQ = currentQ + 1;
      if (nextQ > 999) nextQ = 1;
      db.prepare("UPDATE settings SET value = ? WHERE key = 'current_queue'").run(String(nextQ));

      const createdAt = Date.now();
      const status = 'processing';
      const itemsJson = JSON.stringify(body.items);
      const total = parseInt(body.total, 10);
      const method = body.method || 'Tunai';

      db.prepare("INSERT INTO orders (id, items, total, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        orderId, itemsJson, total, method, status, createdAt
      );

      const orderData = {
        id: orderId,
        items: body.items,
        total: total,
        method: method,
        status: status,
        time: createdAt
      };

      // Broadcast ke seluruh layar Admin & Kasir secara real-time!
      broadcastEvent('order_created', orderData);
      return sendJson(res, 201, orderData);
    }

    // 7. API PATCH /api/orders/:id/status
    if (pathname.startsWith('/api/orders/') && pathname.endsWith('/status') && req.method === 'PATCH') {
      const parts = pathname.split('/');
      const id = parts[3];
      const body = await parseBody(req);
      const newStatus = body.status; // 'processing', 'ready', 'archived'

      if (!['processing', 'ready', 'archived'].includes(newStatus)) {
        return sendJson(res, 400, { error: 'Status tidak valid' });
      }

      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(newStatus, id);

      const updated = { id, status: newStatus };
      broadcastEvent('order_status_changed', updated);
      return sendJson(res, 200, { success: true, ...updated });
    }

    // 8. API Admin PIN Verify
    if (pathname === '/api/admin/verify' && req.method === 'POST') {
      const body = await parseBody(req);
      const pin = body.pin;
      // Default PIN admin adalah 1234
      const correctPin = process.env.ADMIN_PIN || '1234';
      if (pin === correctPin) {
        return sendJson(res, 200, { success: true, message: 'PIN Benar' });
      } else {
        return sendJson(res, 401, { success: false, error: 'PIN Admin salah! (Default: 1234)' });
      }
    }

    // 9. API Reset Data
    if (pathname === '/api/reset' && req.method === 'POST') {
      db.prepare("DELETE FROM orders").run();
      db.prepare("UPDATE settings SET value = '1' WHERE key = 'current_queue'").run();
      broadcastEvent('app_reset', {});
      return sendJson(res, 200, { success: true, message: 'Data pesanan dan antrean direset' });
    }

    // 10. Serve Static Files (Frontend UI)
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    
    // Keamanan path traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback ke index.html
        filePath = path.join(PUBLIC_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500);
          return res.end('Internal Server Error');
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

// Ping interval untuk menjaga koneksi SSE
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 15000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 KANTIN CERDAS SERVER BERJALAN!`);
  console.log(`📡 Local:   http://localhost:${PORT}`);
  console.log(`🔑 PIN Admin Default: 1234`);
  console.log(`⚡ Real-time SSE Sync: AKTIF`);
  console.log(`📦 Database: SQLite (data/kantin.db)`);
  console.log(`=======================================================`);
});
