import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createReservationServer } from './index.mjs';

const TEST_PRODUCTS = [
  { slug: 'poltrona-nuvem', name: 'Poltrona Nuvem', price: 1890 },
  { slug: 'luminaria-petala', name: 'Luminária Pétala', price: 460 },
  { slug: 'vaso-aurora', name: 'Vaso Aurora', price: 240 },
  { slug: 'mesa-lateral-noa', name: 'Mesa lateral Noa', price: 690 },
];
const TEST_PHONE = '+5547999999999';

describe('reservation API', () => {
  let temporaryDirectory;
  let databasePath;
  let application;
  let baseUrl;
  let fakeProviderFetch;

  function clearProductState(...slugs) {
    const database = new DatabaseSync(databasePath);
    for (const slug of slugs) {
      database.prepare('DELETE FROM checkout_orders WHERE product_slug = ?').run(slug);
      database.prepare('DELETE FROM reservations WHERE product_slug = ?').run(slug);
    }
    database.close();
  }

  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'bazar-reservations-'));
    const staticDirectory = join(temporaryDirectory, 'site');
    await mkdir(join(staticDirectory, 'assets'), { recursive: true });
    await writeFile(join(staticDirectory, 'index.html'), '<app-root></app-root>');
    await writeFile(join(staticDirectory, 'assets', 'sample.svg'), '<svg></svg>');
    databasePath = join(temporaryDirectory, 'reservations.sqlite');
    fakeProviderFetch = async () => {
      throw new Error('Unexpected InfinitePay request');
    };
    application = createReservationServer({
      databasePath,
      adminKey: 'test-reservation-key',
      staticDirectory,
      infinitePayHandle: 'test-handle',
      infinitePayApiKey: 'test-api-key',
      infinitePayRedirectUrl: 'https://shop.example/pagamento/retorno',
      fetchImpl: (...args) => fakeProviderFetch(...args),
      products: TEST_PRODUCTS,
    });
    await new Promise((resolveListen) => {
      application.server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = application.server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('reports an item as available until it is reserved', async () => {
    const response = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      slug: 'poltrona-nuvem',
      reserved: false,
    });
  });

  it('serves the Angular shell for product routes and static assets directly', async () => {
    const routeResponse = await fetch(`${baseUrl}/produto/poltrona-nuvem`);
    assert.equal(routeResponse.status, 200);
    assert.equal(await routeResponse.text(), '<app-root></app-root>');

    const assetResponse = await fetch(`${baseUrl}/assets/sample.svg`);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type'), /image\/svg\+xml/);

    const missingAssetResponse = await fetch(`${baseUrl}/assets/missing.svg`);
    assert.equal(missingAssetResponse.status, 404);
  });

  it('requires server-side authorization to change reservation status', async () => {
    const response = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reserved: true }),
    });

    assert.equal(response.status, 401);
  });

  it('persists authorized reservation changes', async () => {
    const updateResponse = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer test-reservation-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reserved: true }),
    });
    assert.equal(updateResponse.status, 200);

    const statusResponse = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`);
    assert.deepEqual(await statusResponse.json(), {
      slug: 'poltrona-nuvem',
      reserved: true,
    });

    const database = new DatabaseSync(databasePath);
    const columns = database.prepare('PRAGMA table_info(reservations)').all().map((column) => column.name);
    database.close();
    assert.deepEqual(columns, ['product_slug', 'reserved']);
  });

  it('adds the customer phone column when opening a database from an older version', async () => {
    const legacyDatabasePath = join(temporaryDirectory, 'legacy-reservations.sqlite');
    const legacyDatabase = new DatabaseSync(legacyDatabasePath);
    legacyDatabase.exec(`
      CREATE TABLE checkout_orders (
        order_nsu TEXT PRIMARY KEY,
        product_slug TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        payment_type TEXT NOT NULL CHECK (payment_type IN ('full', 'deposit')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
        checkout_url TEXT,
        transaction_nsu TEXT,
        invoice_slug TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    legacyDatabase.close();

    const migratedApp = createReservationServer({
      databasePath: legacyDatabasePath,
      staticDirectory: join(temporaryDirectory, 'site'),
      products: TEST_PRODUCTS,
    });
    await new Promise((resolveListen) => {
      migratedApp.server.listen(0, '127.0.0.1', resolveListen);
    });
    await migratedApp.close();

    const migratedDatabase = new DatabaseSync(legacyDatabasePath);
    const columns = migratedDatabase
      .prepare('PRAGMA table_info(checkout_orders)')
      .all()
      .map((column) => column.name);
    migratedDatabase.close();
    assert.ok(columns.includes('customer_phone'));
  });

  it('rejects invalid reservation values', async () => {
    const response = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer test-reservation-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reserved: 'yes' }),
    });

    assert.equal(response.status, 400);
  });

  it('rejects a null request body instead of treating it as an internal error', async () => {
    const response = await fetch(`${baseUrl}/api/reservations/poltrona-nuvem`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer test-reservation-key',
        'Content-Type': 'application/json',
      },
      body: 'null',
    });

    assert.equal(response.status, 400);
  });

  it('creates full-price and 30% deposit checkout links using catalog prices', async () => {
    clearProductState('poltrona-nuvem', 'luminaria-petala');
    const requests = [];
    fakeProviderFetch = async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        url: 'https://checkout.infinitepay.com.br/test-checkout',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const fullResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'poltrona-nuvem', paymentType: 'full', phone: TEST_PHONE }),
    });
    const fullCheckout = await fullResponse.json();
    assert.equal(fullResponse.status, 201);
    assert.equal(fullCheckout.amount, 189000);

    const depositResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'luminaria-petala', paymentType: 'deposit', phone: TEST_PHONE }),
    });
    const depositCheckout = await depositResponse.json();
    assert.equal(depositResponse.status, 201);
    assert.equal(depositCheckout.amount, 13800);

    const fullPayload = JSON.parse(requests[0].options.body);
    const depositPayload = JSON.parse(requests[1].options.body);
    assert.equal(fullPayload.items[0].price, 189000);
    assert.equal(depositPayload.items[0].price, 13800);
    assert.deepEqual(fullPayload.options, {
      single_payment: true,
      assured_installments: 0,
    });
    assert.equal(fullPayload.redirect_url, 'https://shop.example/pagamento/retorno');
    assert.equal('webhook_url' in fullPayload, false);
    assert.equal(requests[0].options.headers['X-Api-Key'], 'test-api-key');
  });

  it('requires an API key to create a checkout with fee passthrough options', async () => {
    const appWithoutApiKey = createReservationServer({
      databasePath: join(temporaryDirectory, 'without-api-key.sqlite'),
      infinitePayHandle: 'test-handle',
      infinitePayApiKey: '',
      infinitePayRedirectUrl: 'https://shop.example/pagamento/retorno',
      fetchImpl: async () => {
        throw new Error('Checkout must not be sent without the API key');
      },
    });
    await new Promise((resolveListen) => {
      appWithoutApiKey.server.listen(0, '127.0.0.1', resolveListen);
    });

    try {
      const address = appWithoutApiKey.server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'poltrona-nuvem', paymentType: 'full', phone: TEST_PHONE }),
      });

      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /API key/);
    } finally {
      await appWithoutApiKey.close();
    }
  });

  it('requires a valid Brazilian mobile number before creating a checkout', async () => {
    clearProductState('poltrona-nuvem');
    let providerCalls = 0;
    fakeProviderFetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        url: 'https://checkout.infinitepay.com.br/phone-test',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const response = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'poltrona-nuvem',
        paymentType: 'full',
        phone: '(47) 99999-9999',
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(providerCalls, 1);
    clearProductState('poltrona-nuvem');

    const invalidResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'poltrona-nuvem',
        paymentType: 'full',
        phone: '12345',
      }),
    });

    assert.equal(invalidResponse.status, 400);
    assert.match((await invalidResponse.json()).error, /mobile phone/);
    assert.equal(providerCalls, 1);
  });

  it('rejects deposits below R$1.00 without calling InfinitePay', async () => {
    let providerCalls = 0;
    const appWithMinimumAmountProducts = createReservationServer({
      databasePath: join(temporaryDirectory, 'minimum-amount.sqlite'),
      staticDirectory: join(temporaryDirectory, 'site'),
      infinitePayHandle: 'test-handle',
      infinitePayApiKey: 'test-api-key',
      infinitePayRedirectUrl: 'https://shop.example/pagamento/retorno',
      products: [
        {
          slug: 'item-abaixo-do-minimo',
          name: 'Item abaixo do mínimo',
          category: 'Teste',
          price: 3.3,
          summary: '',
          description: '',
          image: '',
          images: [],
          condition: '',
          material: '',
          dimensions: '',
          stock: 1,
        },
        {
          slug: 'item-no-minimo',
          name: 'Item no mínimo',
          category: 'Teste',
          price: 3.34,
          summary: '',
          description: '',
          image: '',
          images: [],
          condition: '',
          material: '',
          dimensions: '',
          stock: 1,
        },
      ],
      fetchImpl: async () => {
        providerCalls += 1;
        return new Response(JSON.stringify({
          url: 'https://checkout.infinitepay.io/minimum-test',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    await new Promise((resolveListen) => {
      appWithMinimumAmountProducts.server.listen(0, '127.0.0.1', resolveListen);
    });

    try {
      const address = appWithMinimumAmountProducts.server.address();
      assert.ok(address && typeof address !== 'string');
      const requestDeposit = (slug) => fetch(`http://127.0.0.1:${address.port}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, paymentType: 'deposit', phone: TEST_PHONE }),
      });

      const belowMinimumResponse = await requestDeposit('item-abaixo-do-minimo');
      assert.equal(belowMinimumResponse.status, 400);
      assert.match((await belowMinimumResponse.json()).error, /at least 100 cents/);
      assert.equal(providerCalls, 0);

      const minimumResponse = await requestDeposit('item-no-minimo');
      assert.equal(minimumResponse.status, 201);
      assert.equal((await minimumResponse.json()).amount, 100);
      assert.equal(providerCalls, 1);
    } finally {
      await appWithMinimumAmountProducts.close();
    }
  });

  it('accepts checkout links on InfinitePay official domains only', async () => {
    clearProductState('vaso-aurora');
    fakeProviderFetch = async () => new Response(JSON.stringify({
      url: 'https://checkout.infinitepay.io/official-checkout',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const acceptedResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'vaso-aurora', paymentType: 'full', phone: TEST_PHONE }),
    });
    assert.equal(acceptedResponse.status, 201);

    clearProductState('mesa-lateral-noa');
    fakeProviderFetch = async () => new Response(JSON.stringify({
      url: 'https://checkout.infinitepay.io.attacker.example/checkout',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const rejectedResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'mesa-lateral-noa', paymentType: 'full', phone: TEST_PHONE }),
    });
    assert.equal(rejectedResponse.status, 502);
  });


  it('reserves an item only after InfinitePay confirms the exact amount as paid', async () => {
    clearProductState('vaso-aurora');
    fakeProviderFetch = async (url, options) => {
      if (url.endsWith('/links')) {
        return new Response(JSON.stringify({
          url: 'https://checkout.infinitepay.com.br/paid-test',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.handle, 'test-handle');
      assert.equal(requestBody.order_nsu.length, 36);
      return new Response(JSON.stringify({
        success: true,
        paid: true,
        amount: 7200,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'vaso-aurora', paymentType: 'deposit', phone: TEST_PHONE }),
    });
    const checkout = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 201);

    const confirmationResponse = await fetch(`${baseUrl}/api/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_nsu: checkout.orderNsu,
        transaction_nsu: 'transaction-123',
        invoice_slug: 'invoice-123',
      }),
    });
    assert.equal(confirmationResponse.status, 200);
    assert.deepEqual(await confirmationResponse.json(), {
      status: 'paid',
      productSlug: 'vaso-aurora',
    });

    const unauthorizedOrdersResponse = await fetch(`${baseUrl}/api/admin/orders`);
    assert.equal(unauthorizedOrdersResponse.status, 401);

    const ordersResponse = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { Authorization: 'Bearer test-reservation-key' },
    });
    assert.equal(ordersResponse.status, 200);
    const { orders } = await ordersResponse.json();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].customerPhone, TEST_PHONE);
    assert.equal(orders[0].productName, 'Vaso Aurora');
    assert.equal(orders[0].invoiceSlug, 'invoice-123');
    const whatsappUrl = new URL(orders[0].whatsappUrl);
    assert.equal(whatsappUrl.host, 'wa.me');
    assert.equal(whatsappUrl.pathname, '/5547999999999');
    assert.match(whatsappUrl.searchParams.get('text'), /Vaso Aurora/);

    const reservationResponse = await fetch(`${baseUrl}/api/reservations/vaso-aurora`);
    assert.deepEqual(await reservationResponse.json(), {
      slug: 'vaso-aurora',
      reserved: true,
    });
  });

  it('reuses an active checkout link instead of creating duplicate payment links', async () => {
    clearProductState('mesa-lateral-noa');
    let linkRequests = 0;
    fakeProviderFetch = async () => {
      linkRequests += 1;
      return new Response(JSON.stringify({
        url: 'https://checkout.infinitepay.com.br/reused-link',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const requestCheckout = (paymentType, phone = TEST_PHONE) => fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'mesa-lateral-noa', paymentType, phone }),
    });
    const firstResponse = await requestCheckout('full');
    const firstCheckout = await firstResponse.json();
    const repeatResponse = await requestCheckout('full');
    const repeatCheckout = await repeatResponse.json();
    const alternateResponse = await requestCheckout('deposit');
    const otherContactResponse = await requestCheckout('full', '+5547998888777');

    assert.equal(firstResponse.status, 201);
    assert.equal(repeatResponse.status, 200);
    assert.equal(firstCheckout.orderNsu, repeatCheckout.orderNsu);
    assert.equal(firstCheckout.checkoutUrl, repeatCheckout.checkoutUrl);
    assert.equal(alternateResponse.status, 409);
    assert.equal(otherContactResponse.status, 409);
    assert.equal(linkRequests, 1);
  });

  it('does not reserve an item when the verified payment amount differs', async () => {
    clearProductState('vaso-aurora');
    fakeProviderFetch = async (url) => new Response(JSON.stringify(
      url.endsWith('/links')
        ? { url: 'https://checkout.infinitepay.com.br/mismatch-test' }
        : { success: true, paid: true, amount: 23999 }
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'vaso-aurora', paymentType: 'full', phone: TEST_PHONE }),
    });
    const checkout = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 201);

    const confirmationResponse = await fetch(`${baseUrl}/api/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_nsu: checkout.orderNsu,
        transaction_nsu: 'transaction-mismatch',
        invoice_slug: 'invoice-mismatch',
      }),
    });
    assert.equal(confirmationResponse.status, 409);

    const availableResponse = await fetch(`${baseUrl}/api/reservations/vaso-aurora`);
    assert.deepEqual(await availableResponse.json(), {
      slug: 'vaso-aurora',
      reserved: false,
    });
  });

  it('keeps an item available while InfinitePay reports payment pending', async () => {
    clearProductState('luminaria-petala');
    fakeProviderFetch = async (url) => new Response(JSON.stringify(
      url.endsWith('/links')
        ? { url: 'https://checkout.infinitepay.com.br/pending-test' }
        : { success: true, paid: false, amount: 46000 }
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'luminaria-petala', paymentType: 'full', phone: TEST_PHONE }),
    });
    const checkout = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 201);

    const confirmationResponse = await fetch(`${baseUrl}/api/payments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_nsu: checkout.orderNsu,
        transaction_nsu: 'transaction-pending',
        invoice_slug: 'invoice-pending',
      }),
    });
    assert.equal(confirmationResponse.status, 200);
    assert.deepEqual(await confirmationResponse.json(), {
      status: 'pending',
      productSlug: 'luminaria-petala',
    });
    const reservationResponse = await fetch(`${baseUrl}/api/reservations/luminaria-petala`);
    assert.deepEqual(await reservationResponse.json(), {
      slug: 'luminaria-petala',
      reserved: false,
    });
  });

});
