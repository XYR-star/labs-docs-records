const state = {
  entries: [],
  locations: [],
  inventory: [],
  selectedLocationId: null,
  selectedSlot: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showShell() {
  $('[data-view="login"]').classList.add('hidden');
  $('[data-view="shell"]').classList.remove('hidden');
}

function renderList(target, items, render) {
  const node = $(target);
  node.innerHTML = items.length
    ? items.map(render).join('')
    : '<div class="list-item"><p>暂无数据</p></div>';
}

function tagsHtml(tags = []) {
  return `<div class="pill-row">${tags.map((tag) => `<span class="pill">${tag}</span>`).join('')}</div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  $('#metric-entries').textContent = data.entries;
  $('#metric-events').textContent = data.events;
  $('#metric-inventory').textContent = data.inventory;
  renderList('#low-stock-list', data.low_stock, (item) => `
    <article class="list-item">
      <div><h3>${item.name}</h3><p>${item.quantity} ${item.unit || ''}</p></div>
      <span class="pill">${item.status}</span>
    </article>
  `);
}

async function loadEntries(q = '') {
  state.entries = await api(`/api/entries${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderList('#entries-list', state.entries, (entry) => `
    <article class="list-item">
      <h3>${entry.title}</h3>
      <p>${new Date(entry.occurred_at).toLocaleString()} · ${entry.status}</p>
      <p>${entry.body.slice(0, 220)}</p>
      ${tagsHtml(entry.tags)}
    </article>
  `);
  const select = $('#attachment-entry');
  select.innerHTML = '<option value="">不关联记录</option>' +
    state.entries.map((entry) => `<option value="${entry.id}">${entry.title}</option>`).join('');
}

async function loadEvents() {
  const events = await api('/api/events');
  renderList('#events-list', events, (event) => `
    <article class="list-item">
      <h3>${event.title}</h3>
      <p>${event.kind} · ${new Date(event.occurred_at).toLocaleString()}</p>
      <p>${event.body}</p>
    </article>
  `);
}

async function loadLocations() {
  state.locations = await api('/api/locations');
  const options = '<option value="">顶层位置</option>' +
    state.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#location-parent').innerHTML = options;
  $('#inventory-location').innerHTML = '<option value="">未指定</option>' +
    state.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#location-count').textContent = `${state.locations.length} 个位置`;
  renderLocationTree();
  if (!state.selectedLocationId && state.locations.length) {
    const firstBox = state.locations.find((location) => location.layout_type === 'grid') || state.locations[0];
    await selectLocation(firstBox.id);
  } else if (state.selectedLocationId) {
    await selectLocation(state.selectedLocationId);
  }
}

async function loadInventory(q = '') {
  state.inventory = await api(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  renderList('#inventory-list', state.inventory, (item) => `
    <article class="list-item">
      <h3>${item.name}</h3>
      <p>${item.type} · ${item.identifier || '无编号'} · ${item.quantity} ${item.unit || ''}</p>
      <p>${item.location_name || '未指定位置'}${item.slot_code ? ` / ${item.slot_code}` : ''} · ${item.status}</p>
      ${tagsHtml(item.tags)}
    </article>
  `);
}

function locationDepth(location, byId) {
  let depth = 0;
  let current = location;
  const seen = new Set();
  while (current?.parent_id && byId.has(current.parent_id) && !seen.has(current.parent_id)) {
    seen.add(current.parent_id);
    depth += 1;
    current = byId.get(current.parent_id);
  }
  return depth;
}

function renderLocationTree() {
  const byId = new Map(state.locations.map((location) => [location.id, location]));
  const sorted = [...state.locations].sort((a, b) => {
    const depthA = locationDepth(a, byId);
    const depthB = locationDepth(b, byId);
    return depthA - depthB || a.name.localeCompare(b.name);
  });

  $('#locations-list').innerHTML = sorted.map((location) => {
    const depth = locationDepth(location, byId);
    const icon = location.layout_type === 'grid' ? '▦' : location.kind === 'freezer' ? '▤' : '□';
    const active = location.id === state.selectedLocationId ? ' active' : '';
    return `
      <button class="tree-node${active}" data-location-id="${location.id}" style="--depth:${depth}">
        <span>${icon}</span>
        <strong>${escapeHtml(location.name)}</strong>
        <small>${escapeHtml(location.kind)}${location.layout_type === 'grid' ? ` · ${location.rows}x${location.columns}` : ''}</small>
      </button>
    `;
  }).join('') || '<p class="muted-text">暂无位置</p>';

  $$('.tree-node').forEach((button) => {
    button.addEventListener('click', () => selectLocation(button.dataset.locationId));
  });
}

async function selectLocation(locationId) {
  state.selectedLocationId = locationId;
  state.selectedSlot = null;
  renderLocationTree();
  const location = state.locations.find((item) => item.id === locationId);
  if (!location) return;

  $('#selected-location-name').textContent = location.name;
  $('#selected-location-meta').textContent = `${location.kind}${location.layout_type === 'grid' ? ` · ${location.rows} x ${location.columns}` : ''}`;
  $('#slot-detail').innerHTML = '<p class="muted-text">点击一个孔位查看样本和历史。</p>';

  if (location.layout_type !== 'grid') {
    const children = state.locations.filter((item) => item.parent_id === location.id);
    $('#storage-grid').className = 'storage-grid-empty';
    $('#storage-grid').innerHTML = children.length
      ? children.map((child) => `<button class="child-location" data-location-id="${child.id}">${escapeHtml(child.name)}<span>${escapeHtml(child.kind)}</span></button>`).join('')
      : '这个位置下还没有子位置。';
    $$('.child-location').forEach((button) => {
      button.addEventListener('click', () => selectLocation(button.dataset.locationId));
    });
    return;
  }

  const view = await api(`/api/locations/${location.id}/view`);
  renderStorageGrid(view);
}

function renderStorageGrid(view) {
  const grid = $('#storage-grid');
  grid.className = 'box-grid';
  grid.style.setProperty('--columns', view.columns);
  grid.innerHTML = view.slots.map((slot) => `
    <button class="slot-cell ${slot.state}" data-slot-code="${slot.code}">
      <span class="slot-code">${slot.code}</span>
      <strong>${slot.item ? escapeHtml(slot.item.name) : ''}</strong>
      <small>${slot.item ? `${slot.item.quantity} ${slot.item.unit || ''}` : '空'}</small>
    </button>
  `).join('');

  $$('.slot-cell').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = view.slots.find((item) => item.code === button.dataset.slotCode);
      showSlotDetail(slot);
    });
  });
}

async function showSlotDetail(slot) {
  state.selectedSlot = slot;
  if (!slot.item) {
    $('#slot-detail').innerHTML = `
      <div class="empty-slot">
        <span class="slot-badge">${slot.code}</span>
        <h4>空孔位</h4>
        <p>可在库存表单中选择当前盒子，并填入 ${slot.code} 存入样本。</p>
        <button id="use-slot-button" class="ghost">填入库存表单</button>
      </div>
    `;
    $('#use-slot-button').addEventListener('click', () => {
      $('#inventory-location').value = state.selectedLocationId;
      document.querySelector('#inventory-form [name="slot_code"]').value = slot.code;
      document.querySelector('[data-tab="inventory"]').click();
      document.querySelector('#inventory-form [name="name"]').focus();
    });
    return;
  }

  const movements = await api(`/api/inventory/${slot.item.id}/movements`);
  $('#slot-detail').innerHTML = `
    <div class="slot-record">
      <span class="slot-badge">${slot.code}</span>
      <h4>${escapeHtml(slot.item.name)}</h4>
      <p>${escapeHtml(slot.item.type)} · ${escapeHtml(slot.item.identifier || '无编号')}</p>
      <p>${slot.item.quantity} ${escapeHtml(slot.item.unit || '')} · ${escapeHtml(slot.item.status)}</p>
    </div>
    <div class="movement-list">
      ${movements.map((movement) => `
        <article>
          <strong>${escapeHtml(movement.action)}</strong>
          <p>${new Date(movement.created_at).toLocaleString()}</p>
          <p>${escapeHtml(movement.from_location_name || '')}${movement.from_slot_code ? ` / ${movement.from_slot_code}` : ''} → ${escapeHtml(movement.to_location_name || '')}${movement.to_slot_code ? ` / ${movement.to_slot_code}` : ''}</p>
          ${movement.note ? `<p>${escapeHtml(movement.note)}</p>` : ''}
        </article>
      `).join('') || '<p class="muted-text">暂无历史</p>'}
    </div>
  `;
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadEntries(),
    loadEvents(),
    loadLocations(),
    loadInventory()
  ]);
}

function formJson(form) {
  const data = Object.fromEntries(new FormData(form));
  if (data.tags) data.tags = data.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  return data;
}

function bindForms() {
  $('#location-kind').addEventListener('change', (event) => {
    if (event.target.value === 'box') {
      $('#location-layout').value = 'grid';
      document.querySelector('#location-form [name="rows"]').value = 8;
      document.querySelector('#location-form [name="columns"]').value = 12;
    }
  });

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(formJson(event.currentTarget))
      });
      showShell();
      await refreshAll();
    } catch (error) {
      $('#login-message').textContent = error.message;
    }
  });

  $('#entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/entries', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadEntries()]);
  });

  $('#event-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/events', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadEvents()]);
  });

  $('#location-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/locations', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    $('#location-layout').value = 'none';
    await Promise.all([loadLocations(), loadInventory()]);
  });

  $('#inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    await Promise.all([loadDashboard(), loadInventory()]);
  });

  $('#attachment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/attachments', { method: 'POST', body: new FormData(event.currentTarget) });
    event.currentTarget.reset();
    $('#files-message').textContent = '附件已上传到数据盘。';
  });

  $('#external-link-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/external-links', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
    event.currentTarget.reset();
    $('#files-message').textContent = '外部云盘链接已保存。';
  });
}

function bindNavigation() {
  $$('.nav-button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.nav-button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const tab = button.dataset.tab;
      $('#page-title').textContent = button.textContent;
      $$('.tab-panel').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.panel !== tab);
      });
    });
  });

  $('#entry-search-button').addEventListener('click', () => loadEntries($('#entry-search').value));
  $('#inventory-search-button').addEventListener('click', () => loadInventory($('#inventory-search').value));
  $('#export-button').addEventListener('click', async () => {
    const result = await api('/api/export/manifest', { method: 'POST', body: '{}' });
    alert(`已导出：${result.filename}`);
  });
  $('#logout-button').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' });
    location.reload();
  });
}

bindForms();
bindNavigation();

api('/api/dashboard')
  .then(async () => {
    showShell();
    await refreshAll();
  })
  .catch(() => {});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}
