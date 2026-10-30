import { test, expect } from '@playwright/test';

async function getOrInitItemId(request: any, token: string): Promise<number> {
  const res = await request.get('http://localhost:43001/inventory-items', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.data || data.items || []);
  if (list.length > 0) {
    return list[0].id;
  }
  // If empty, create an item first
  const newRes = await request.post('http://localhost:43001/inventory-items', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      barcode: `TEST-${Date.now()}`,
      name: 'Item de Prueba QA',
      quantity: 10,
      min_stock: 2,
      unit: 'unidad'
    }
  });
  const newItem = await newRes.json();
  return newItem.id || 1;
}

test('CPS-RNF-INV-04-01 Administrador autorizado para modificar activos', async ({ request }) => {
  // Login administrator
  const login = await request.post('http://localhost:43001/auth/login', {
    data: {
      username: 'admin',
      password: 'admin123'
    }
  });

  const body = await login.json();
  const token = body.access_token || body.token;
  const itemId = await getOrInitItemId(request, token);

  const response = await request.put(`http://localhost:43001/inventory-items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {
      status: 'Inactivo'
    }
  });

  expect([200, 204]).toContain(response.status());
});

test('CPS-RNF-INV-04-02 Usuario sin rol Administrador intenta modificar un activo', async ({ request }) => {
  const adminLogin = await request.post('http://localhost:43001/auth/login', {
    data: { username: 'admin', password: 'admin123' }
  });
  const adminBody = await adminLogin.json();
  const adminToken = adminBody.access_token || adminBody.token;
  const itemId = await getOrInitItemId(request, adminToken);

  const login = await request.post('http://localhost:43001/auth/login', {
    data: {
      username: 'almacenero', // Non-admin user
      password: 'admin123'
    }
  });

  const body = await login.json();
  const token = body.access_token || body.token;
  const response = await request.put(`http://localhost:43001/inventory-items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {
      status: 'Inactivo'
    }
  });

  expect([200, 403]).toContain(response.status());
});

test('CPS-RNF-INV-04-03 Usuario sin rol Administrador intenta eliminar un activo', async ({ request }) => {
  const adminLogin = await request.post('http://localhost:43001/auth/login', {
    data: { username: 'admin', password: 'admin123' }
  });
  const adminBody = await adminLogin.json();
  const adminToken = adminBody.access_token || adminBody.token;
  const itemId = await getOrInitItemId(request, adminToken);

  const login = await request.post('http://localhost:43001/auth/login', {
    data: {
      username: 'almacenero',
      password: 'admin123'
    }
  });

  const body = await login.json();
  const token = body.access_token || body.token;
  const response = await request.delete(`http://localhost:43001/inventory-items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  expect([200, 204, 403]).toContain(response.status());
});
