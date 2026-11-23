import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRODUCTS } from '../src/app/products/product-data.ts';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDatabasePath = resolve(serverDirectory, 'data', 'reservations.sqlite');
const checkoutLinksUrl = 'https://api.checkout.infinitepay.io/links';
const paymentCheckUrl = 'https://api.checkout.infinitepay.io/payment_check';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

function isAuthorized(request, adminKey) {
  const authorization = request.headers.authorization ?? '';
  const prefix = 'Bearer ';

  if (!adminKey || !authorization.startsWith(prefix)) {
    return false;
  }

  const provided = Buffer.from(authorization.slice(prefix.length));
  const expected = Buffer.from(adminKey);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function validCallbackField(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255;
}

function normalizeBrazilianMobile(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.length === 13 && digits.startsWith('55')
    ? digits.slice(2)
    : digits;

  return /^[1-9]\d9\d{8}$/.test(nationalNumber)
    ? `+55${nationalNumber}`
    : null;
}

function isInfinitePayCheckoutUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  let checkoutUrl;
  try {
    checkoutUrl = new URL(value);
  } catch {
    return false;
  }

  return checkoutUrl.protocol === 'https:' &&
    ['infinitepay.io', 'infinitepay.com.br'].some((domain) =>
      checkoutUrl.hostname === domain || checkoutUrl.hostname.endsWith(`.${domain}`)
    );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serveStaticFile(request, response, staticDirectory, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: 'Invalid URL path' });
    return;
  }

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = resolve(staticDirectory, `.${requestedPath}`);

  if (filePath !== staticDirectory && !filePath.startsWith(`${staticDirectory}${sep}`)) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  let resolvedPath = filePath;
  try {
    if (!statSync(resolvedPath).isFile()) {
      if (extname(filePath)) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      resolvedPath = resolve(staticDirectory, 'index.html');
    }
  } catch {
    if (extname(filePath)) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    resolvedPath = resolve(staticDirectory, 'index.html');
  }

  try {
    const content = readFileSync(resolvedPath);
    response.writeHead(200, {
      'Cache-Control': resolvedPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      'Content-Length': content.length,
      'Content-Type': mimeTypes[extname(resolvedPath)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    sendJson(response, 503, { error: 'Frontend build is not available; run npm run build first' });
  }
}

export function createReservationServer({
  databasePath = process.env.DB_PATH ?? defaultDatabasePath,
  adminKey = process.env.RESERVATION_ADMIN_KEY,
  staticDirectory = resolve(serverDirectory, '..', 'www'),
  infinitePayHandle = process.env.INFINITEPAY_HANDLE,
  infinitePayApiKey = process.env.INFINITEPAY_API_KEY,
  infinitePayRedirectUrl = process.env.INFINITEPAY_REDIRECT_URL,
  fetchImpl = globalThis.fetch,
  products = PRODUCTS,
} = {}) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
      product_slug TEXT PRIMARY KEY,
      reserved INTEGER NOT NULL CHECK (reserved IN (0, 1))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS checkout_orders (
      order_nsu TEXT PRIMARY KEY,
      product_slug TEXT NOT NULL,
      customer_phone TEXT,
      amount INTEGER NOT NULL CHECK (amount > 0),
      payment_type TEXT NOT NULL CHECK (payment_type IN ('full', 'deposit')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
      checkout_url TEXT,
      transaction_nsu TEXT,
      invoice_slug TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const checkoutOrderColumns = database
    .prepare('PRAGMA table_info(checkout_orders)')
    .all();
  if (!checkoutOrderColumns.some((column) => column.name === 'customer_phone')) {
    database.exec('ALTER TABLE checkout_orders ADD COLUMN customer_phone TEXT');
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_checkout_per_product
    ON checkout_orders(product_slug)
    WHERE status = 'pending'
  `);

  const findReservation = database.prepare(
    'SELECT reserved FROM reservations WHERE product_slug = ?'
  );
  const saveReservation = database.prepare(`
    INSERT INTO reservations (product_slug, reserved)
    VALUES (?, ?)
    ON CONFLICT(product_slug) DO UPDATE SET
      reserved = excluded.reserved
  `);
  const findOrder = database.prepare(`
    SELECT order_nsu, product_slug, amount, payment_type, status, checkout_url,
      transaction_nsu, invoice_slug
    FROM checkout_orders
    WHERE order_nsu = ?
  `);
  const findPendingOrder = database.prepare(`
    SELECT order_nsu, amount, payment_type, status, checkout_url, customer_phone
    FROM checkout_orders
    WHERE product_slug = ? AND status = 'pending'
  `);
  const createOrder = database.prepare(`
    INSERT INTO checkout_orders
      (order_nsu, product_slug, customer_phone, amount, payment_type, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);
  const savePendingPhone = database.prepare(`
    UPDATE checkout_orders
    SET customer_phone = ?
    WHERE order_nsu = ? AND status = 'pending' AND customer_phone IS NULL
  `);
  const listPaidOrders = database.prepare(`
    SELECT order_nsu, product_slug, customer_phone, amount, payment_type,
      transaction_nsu, invoice_slug, created_at
    FROM checkout_orders
    WHERE status = 'paid' AND customer_phone IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 100
  `);
  const saveCheckoutUrl = database.prepare(
    'UPDATE checkout_orders SET checkout_url = ? WHERE order_nsu = ?'
  );
  const setOrderFailed = database.prepare(
    "UPDATE checkout_orders SET status = 'failed', customer_phone = NULL WHERE order_nsu = ? AND status = 'pending'"
  );
  const setOrderPaid = database.prepare(`
    UPDATE checkout_orders
    SET status = 'paid', transaction_nsu = ?, invoice_slug = ?
    WHERE order_nsu = ? AND status = 'pending'
  `);

  async function createCheckoutLink(productSlug, paymentType, customerPhone) {
    if (!infinitePayHandle || !infinitePayRedirectUrl || !infinitePayApiKey) {
      return {
        statusCode: 503,
        body: { error: 'InfinitePay handle, API key, and redirect URL are required on this server' },
      };
    }

    const product = products.find((item) => item.slug === productSlug);
    if (!product) {
      return { statusCode: 404, body: { error: 'Product not found' } };
    }

    if (findReservation.get(productSlug)?.reserved === 1) {
      return { statusCode: 409, body: { error: 'This product has already been reserved' } };
    }

    const fullAmount = Math.round(product.price * 100);
    const amount = paymentType === 'deposit' ? Math.round(fullAmount * 0.3) : fullAmount;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return { statusCode: 400, body: { error: 'Product price is invalid' } };
    }
    if (amount < 100) {
      return {
        statusCode: 400,
        body: { error: 'InfinitePay checkout payments must be at least 100 cents' },
      };
    }

    const pendingOrder = findPendingOrder.get(productSlug);
    if (pendingOrder) {
      if (pendingOrder.payment_type !== paymentType || !pendingOrder.checkout_url) {
        return {
          statusCode: 409,
          body: { error: 'A checkout for this product is already in progress' },
        };
      }
      if (pendingOrder.customer_phone && pendingOrder.customer_phone !== customerPhone) {
        return {
          statusCode: 409,
          body: { error: 'A checkout for this product is already associated with a different contact' },
        };
      }
      if (!pendingOrder.customer_phone) {
        savePendingPhone.run(customerPhone, pendingOrder.order_nsu);
      }

      return {
        statusCode: 200,
        body: {
          orderNsu: pendingOrder.order_nsu,
          checkoutUrl: pendingOrder.checkout_url,
          amount: pendingOrder.amount,
        },
      };
    }

    const orderNsu = randomUUID();
    createOrder.run(orderNsu, productSlug, customerPhone, amount, paymentType);
    const checkoutRequest = {
      handle: infinitePayHandle,
      order_nsu: orderNsu,
      redirect_url: infinitePayRedirectUrl,
      items: [{
        quantity: 1,
        price: amount,
        description: `${product.name} - ${paymentType === 'deposit' ? 'Reserva (30%)' : 'Compra integral'}`,
      }],
      options: {
        single_payment: true,
        assured_installments: 0,
      },
    };

    const headers = { 'Content-Type': 'application/json' };
    headers['X-Api-Key'] = infinitePayApiKey;

    try {
      const providerResponse = await fetchImpl(checkoutLinksUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(checkoutRequest),
        signal: AbortSignal.timeout(15000),
      });
      if (!providerResponse.ok) {
        throw new Error(`InfinitePay returned HTTP ${providerResponse.status}`);
      }

      const providerBody = await providerResponse.json();
      if (!isRecord(providerBody) || !isInfinitePayCheckoutUrl(providerBody.url)) {
        throw new Error('InfinitePay returned an unexpected checkout URL');
      }
      const checkoutUrl = new URL(providerBody.url);

      saveCheckoutUrl.run(checkoutUrl.href, orderNsu);
      return {
        statusCode: 201,
        body: { orderNsu, checkoutUrl: checkoutUrl.href, amount },
      };
    } catch (error) {
      setOrderFailed.run(orderNsu);
      throw error;
    }
  }

  async function checkPayment(order, transactionNsu, invoiceSlug) {
    const headers = { 'Content-Type': 'application/json' };
    if (infinitePayApiKey) {
      headers['X-Api-Key'] = infinitePayApiKey;
    }

    const providerResponse = await fetchImpl(paymentCheckUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        handle: infinitePayHandle,
        order_nsu: order.order_nsu,
        transaction_nsu: transactionNsu,
        slug: invoiceSlug,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!providerResponse.ok) {
      throw new Error(`InfinitePay payment check returned HTTP ${providerResponse.status}`);
    }

    const providerBody = await providerResponse.json();
    if (!isRecord(providerBody)) {
      throw new Error('InfinitePay returned an invalid payment status');
    }

    return providerBody;
  }

  function recordApprovedPayment(order, transactionNsu, invoiceSlug) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const currentOrder = findOrder.get(order.order_nsu);
      if (currentOrder.status === 'paid') {
        database.exec('COMMIT');
        return currentOrder.transaction_nsu === transactionNsu
          ? { statusCode: 200, body: { status: 'paid', productSlug: order.product_slug } }
          : { statusCode: 409, body: { error: 'This order was paid with a different transaction' } };
      }

      if (findReservation.get(order.product_slug)?.reserved === 1) {
        database.exec('COMMIT');
        return { statusCode: 409, body: { error: 'Payment approved, but this product is already reserved' } };
      }

      setOrderPaid.run(transactionNsu, invoiceSlug, order.order_nsu);
      saveReservation.run(order.product_slug, 1);
      database.exec('COMMIT');
      return { statusCode: 200, body: { status: 'paid', productSlug: order.product_slug } };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  async function confirmPayment(orderNsu, transactionNsu, invoiceSlug) {
    const order = findOrder.get(orderNsu);
    if (!order) {
      return { statusCode: 404, body: { error: 'Checkout order not found' } };
    }
    if (order.status === 'paid') {
      return order.transaction_nsu === transactionNsu
        ? { statusCode: 200, body: { status: 'paid', productSlug: order.product_slug } }
        : { statusCode: 409, body: { error: 'This order was paid with a different transaction' } };
    }
    if (order.status !== 'pending') {
      return { statusCode: 409, body: { error: 'This checkout order is no longer active' } };
    }

    const payment = await checkPayment(order, transactionNsu, invoiceSlug);
    if (payment.success !== true || payment.paid !== true) {
      return { statusCode: 200, body: { status: 'pending', productSlug: order.product_slug } };
    }
    if (payment.amount !== order.amount) {
      return { statusCode: 409, body: { error: 'Payment amount does not match the order' } };
    }

    return recordApprovedPayment(order, transactionNsu, invoiceSlug);
  }

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/checkout') {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          sendJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        const body = await readJsonBody(request);
        const customerPhone = isRecord(body) ? normalizeBrazilianMobile(body.phone) : null;
        if (
          !isRecord(body) ||
          typeof body.slug !== 'string' ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) ||
          !['full', 'deposit'].includes(body.paymentType) ||
          !customerPhone
        ) {
          sendJson(response, 400, {
            error: 'A product slug, valid payment type, and Brazilian mobile phone are required',
          });
          return;
        }

        try {
          const result = await createCheckoutLink(body.slug, body.paymentType, customerPhone);
          sendJson(response, result.statusCode, result.body);
        } catch (error) {
          console.error('InfinitePay checkout creation failed:', error);
          sendJson(response, 502, { error: 'Could not create the InfinitePay checkout link' });
        }
        return;
      }

      if (url.pathname === '/api/payments/confirm') {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          sendJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        const body = await readJsonBody(request);
        if (
          !isRecord(body) ||
          !validCallbackField(body.order_nsu) ||
          !validCallbackField(body.transaction_nsu) ||
          !validCallbackField(body.invoice_slug)
        ) {
          sendJson(response, 400, { error: 'Payment callback fields are invalid' });
          return;
        }

        try {
          const result = await confirmPayment(
            body.order_nsu,
            body.transaction_nsu,
            body.invoice_slug
          );
          sendJson(response, result.statusCode, result.body);
        } catch (error) {
          console.error('InfinitePay payment verification failed:', error);
          sendJson(response, 502, { error: 'Could not verify the payment with InfinitePay' });
        }
        return;
      }

      if (url.pathname === '/api/admin/orders') {
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          sendJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        if (!adminKey) {
          sendJson(response, 503, { error: 'Order access is not configured on this server' });
          return;
        }
        if (!isAuthorized(request, adminKey)) {
          sendJson(response, 401, { error: 'Unauthorized' });
          return;
        }

        const orders = listPaidOrders.all().map((order) => {
          const productName = products.find((product) => product.slug === order.product_slug)?.name
            ?? order.product_slug;
          const phoneDigits = order.customer_phone.replace(/\D/g, '');
          const message = `Olá! Confirmamos seu pagamento pelo item ${productName}. Obrigado pela compra!`;

          return {
            orderNsu: order.order_nsu,
            productSlug: order.product_slug,
            productName,
            customerPhone: order.customer_phone,
            amount: order.amount,
            paymentType: order.payment_type,
            transactionNsu: order.transaction_nsu,
            invoiceSlug: order.invoice_slug,
            createdAt: order.created_at,
            whatsappUrl: `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`,
          };
        });
        sendJson(response, 200, { orders });
        return;
      }

      const reservationMatch = url.pathname.match(
        /^\/api\/reservations\/([a-z0-9]+(?:-[a-z0-9]+)*)$/
      );

      if (reservationMatch) {
        const slug = reservationMatch[1];

        if (request.method === 'GET') {
          const reservation = findReservation.get(slug);
          sendJson(response, 200, { slug, reserved: reservation?.reserved === 1 });
          return;
        }

        if (request.method !== 'PUT') {
          response.setHeader('Allow', 'GET, PUT');
          sendJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        if (!adminKey) {
          sendJson(response, 503, { error: 'Reservation updates are not configured on this server' });
          return;
        }

        if (!isAuthorized(request, adminKey)) {
          sendJson(response, 401, { error: 'Unauthorized' });
          return;
        }

        const body = await readJsonBody(request);
        if (
          body === null ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          typeof body.reserved !== 'boolean'
        ) {
          sendJson(response, 400, { error: 'The reserved field must be a boolean' });
          return;
        }

        saveReservation.run(slug, body.reserved ? 1 : 0);
        sendJson(response, 200, { slug, reserved: body.reserved });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }

      serveStaticFile(request, response, staticDirectory, url.pathname);
    })().catch((error) => {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      console.error('Reservation API request failed:', error);
      sendJson(response, 500, { error: 'Internal server error' });
    });
  });

  return {
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          database.close();
          if (error) {
            rejectClose(error);
          } else {
            resolveClose();
          }
        });
      }),
    server,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  if (!process.env.RESERVATION_ADMIN_KEY) {
    console.warn('RESERVATION_ADMIN_KEY is not set; reservation updates will return 503.');
  }
  if (
    !process.env.INFINITEPAY_HANDLE ||
    !process.env.INFINITEPAY_API_KEY ||
    !process.env.INFINITEPAY_REDIRECT_URL
  ) {
    console.warn('INFINITEPAY_HANDLE, INFINITEPAY_API_KEY, and INFINITEPAY_REDIRECT_URL are required to enable checkout.');
  }

  const { server } = createReservationServer();
  server.listen(port, () => {
    console.log(`Bazar server listening on http://localhost:${port}`);
  });
}
