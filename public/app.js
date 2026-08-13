let CONFIG = {};
let currentType = null;
let offset = 0;
const PAGE_SIZE = 20;
let loading = false;
let allLoaded = false;
let editingId = null;

const authArea = document.getElementById('authArea');
const appMain = document.getElementById('appMain');
const loggedOutMsg = document.getElementById('loggedOutMsg');
const objectSelect = document.getElementById('objectSelect');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const tableWrapper = document.getElementById('tableWrapper');
const loadingIndicator = document.getElementById('loadingIndicator');
const endIndicator = document.getElementById('endIndicator');
const newRecordBtn = document.getElementById('newRecordBtn');
const recordModal = document.getElementById('recordModal');
const recordForm = document.getElementById('recordForm');
const modalTitle = document.getElementById('modalTitle');
const saveRecordBtn = document.getElementById('saveRecordBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');

async function init() {
  const meRes = await fetch('/api/me');
  const me = await meRes.json();

  if (!me.loggedIn) {
    authArea.innerHTML = `<a class="btn" href="/login">Login with Salesforce</a>`;
    appMain.classList.add('hidden');
    loggedOutMsg.classList.remove('hidden');
    return;
  }

  authArea.innerHTML = `<a class="btn" href="/logout">Logout</a>`;
  appMain.classList.remove('hidden');
  loggedOutMsg.classList.add('hidden');

  const configRes = await fetch('/api/config');
  CONFIG = await configRes.json();

  objectSelect.innerHTML = Object.keys(CONFIG)
    .map(key => `<option value="${key}">${CONFIG[key].label}</option>`)
    .join('');

  objectSelect.addEventListener('change', () => loadObjectType(objectSelect.value));
  loadObjectType(objectSelect.value);
}

function loadObjectType(type) {
  currentType = type;
  offset = 0;
  allLoaded = false;
  tableBody.innerHTML = '';
  renderTableHead(type);
  endIndicator.classList.add('hidden');
  loadMoreRecords();
}

function renderTableHead(type) {
  const fields = CONFIG[type].fields;
  tableHead.innerHTML = `<tr>${fields.map(f => `<th>${f}</th>`).join('')}<th>Actions</th></tr>`;
}

async function loadMoreRecords() {
  if (loading || allLoaded || !currentType) return;
  loading = true;
  loadingIndicator.classList.remove('hidden');

  try {
    const res = await fetch(`/api/objects/${currentType}?offset=${offset}&limit=${PAGE_SIZE}`);
    if (!res.ok) throw new Error('Failed to load records');
    const data = await res.json();
    const records = data.records || [];

    records.forEach(rec => renderRow(rec));

    offset += records.length;
    if (records.length < PAGE_SIZE) {
      allLoaded = true;
      endIndicator.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    alert('Error loading records: ' + err.message);
  } finally {
    loading = false;
    loadingIndicator.classList.add('hidden');
  }
}

function renderRow(record) {
  const fields = CONFIG[currentType].fields;
  const tr = document.createElement('tr');
  tr.dataset.id = record.Id;

  tr.innerHTML = fields.map(f => `<td>${record[f] ?? ''}</td>`).join('') +
    `<td>
      <button class="view-btn">View</button>
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </td>`;

  tr.querySelector('.view-btn').addEventListener('click', () => openViewModal(record));
  tr.querySelector('.edit-btn').addEventListener('click', () => openEditModal(record));
  tr.querySelector('.delete-btn').addEventListener('click', () => deleteRecord(record.Id));

  tableBody.appendChild(tr);
}

tableWrapper.addEventListener('scroll', () => {
  const { scrollTop, scrollHeight, clientHeight } = tableWrapper;
  if (scrollTop + clientHeight >= scrollHeight - 50) {
    loadMoreRecords();
  }
});

newRecordBtn.addEventListener('click', () => openCreateModal());

function openCreateModal() {
  editingId = null;
  modalTitle.textContent = `New ${CONFIG[currentType].label}`;
  buildForm({}, false);
  saveRecordBtn.classList.remove('hidden');
  recordModal.classList.remove('hidden');
}

function openEditModal(record) {
  editingId = record.Id;
  modalTitle.textContent = `Edit ${CONFIG[currentType].label}`;
  buildForm(record, false);
  saveRecordBtn.classList.remove('hidden');
  recordModal.classList.remove('hidden');
}

function openViewModal(record) {
  editingId = null;
  modalTitle.textContent = `View ${CONFIG[currentType].label}`;
  // Show ALL fields (not just editable ones) in read-only mode
  buildForm(record, true, CONFIG[currentType].fields);
  saveRecordBtn.classList.add('hidden');
  recordModal.classList.remove('hidden');
}

function buildForm(record, readOnly = false, fieldsOverride = null) {
  const fields = fieldsOverride || CONFIG[currentType].editableFields;
  const required = CONFIG[currentType].requiredFields || [];

  recordForm.innerHTML = fields.map(f => `
    <label>${f}${required.includes(f) ? ' *' : ''}
      <input name="${f}" value="${record[f] ?? ''}"
        ${required.includes(f) ? 'required' : ''}
        ${readOnly ? 'readonly' : ''} />
    </label>
  `).join('');
}

cancelModalBtn.addEventListener('click', () => {
  recordModal.classList.add('hidden');
});

saveRecordBtn.addEventListener('click', async () => {
  const formData = new FormData(recordForm);
  const body = {};
  formData.forEach((value, key) => {
    if (value !== '') body[key] = value;
  });

  try {
    let res;
    if (editingId) {
      res = await fetch(`/api/objects/${currentType}/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch(`/api/objects/${currentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(JSON.stringify(errData));
    }

    recordModal.classList.add('hidden');
    loadObjectType(currentType);
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
});

async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;
  try {
    const res = await fetch(`/api/objects/${currentType}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    loadObjectType(currentType);
  } catch (err) {
    alert(err.message);
  }
}

init();
