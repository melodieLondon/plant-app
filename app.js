// ── state ─────────────────────────────────────────────────────
let plants = [];          // from Google Sheet (name, location, frequency, notes)
let localData = {};       // from storage: { [plantId]: { lastWatered, photos: [{date, dataUrl, label}] } }
let currentFilter = 'all';
let editingPlantId = null;
let pendingFormPhoto = null;  // base64 of photo chosen in add/edit form

// ── boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadLocalData();
  await loadSheet();
}

// ── local storage (photos + last watered) ─────────────────────
async function loadLocalData() {
  try {
    const r = await window.storage.get('plant_local_data');
    localData = r ? JSON.parse(r.value) : {};
  } catch(e) { localData = {}; }
}

async function saveLocalData() {
  try { await window.storage.set('plant_local_data', JSON.stringify(localData)); } catch(e) {}
}

function getLocal(plantId) {
  return localData[plantId] || { lastWatered: null, photos: [] };
}

// ── Google Sheet loader ────────────────────────────────────────
async function loadSheet() {
  showScreen('loading');

  if (!CONFIG.SHEET_CSV_URL || CONFIG.SHEET_CSV_URL === 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    // No sheet — just use any locally-saved plants
    plants = getLocalPlants();
    render();
    return;
  }

  try {
    const url = CONFIG.SHEET_CSV_URL +
      (CONFIG.SHEET_CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    plants = parseCSV(csv);
    // Merge any locally-added plants
    const local = getLocalPlants();
    local.forEach(lp => { if (!plants.find(p => p.id === lp.id)) plants.push(lp); });
    render();
  } catch(err) {
    plants = getLocalPlants();
    render();
    showToast('Could not load sheet — showing local plants');
  }
}

// Plants added manually (no sheet) are stored locally
function getLocalPlants() {
  try {
    const r = localData['__plants__'];
    return r ? JSON.parse(r) : [];
  } catch(e) { return []; }
}

async function saveLocalPlants(list) {
  localData['__plants__'] = JSON.stringify(list);
  await saveLocalData();
}

// ── CSV parser ─────────────────────────────────────────────────
// Columns: name | location | frequency_days | notes
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols.length || cols.every(c => !c.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    if (!row['name']) continue;
    out.push({
      id:        'sheet_' + i,
      name:      row['name'],
      location:  row['location']      || '',
      frequency: parseInt(row['frequency_days'] || row['frequency'] || '7', 10),
      notes:     row['notes']         || '',
      fromSheet: true,
    });
  }
  return out;
}

function parseCSVLine(line) {
  const result = []; let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── status logic ───────────────────────────────────────────────
function getStatus(plant) {
  const local = getLocal(plant.id);
  if (!local.lastWatered) return { label: 'Not set', key: 'soon', days: null };
  const last = new Date(local.lastWatered);
  const now  = new Date();
  const daysSince = Math.floor((now - last) / 86400000);
  const daysLeft  = plant.frequency - daysSince;

  if (daysLeft < 0)  return { label: `Overdue by ${Math.abs(daysLeft)}d`, key: 'overdue', daysLeft };
  if (daysLeft === 0) return { label: 'Water today!', key: 'overdue', daysLeft };
  if (daysLeft <= 2) return { label: `Due in ${daysLeft}d`, key: 'soon', daysLeft };
  return { label: `Due in ${daysLeft}d`, key: 'ok', daysLeft };
}

function statusBadgeHtml(status) {
  const map = { overdue: ['🔴', 'status-overdue'], soon: ['🟡', 'status-soon'], ok: ['🟢', 'status-ok'] };
  const [icon, cls] = map[status.key] || ['⚪', 'status-ok'];
  return `<span class="status-badge ${cls}">${icon} ${status.label}</span>`;
}

// ── render home ────────────────────────────────────────────────
function render() {
  showScreen('home');
  updateHomeSub();

  const grid = document.getElementById('plant-grid');
  const empty = document.getElementById('empty-state');

  let filtered = plants;
  if (currentFilter !== 'all') {
    filtered = plants.filter(p => getStatus(p).key === currentFilter);
  }

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map((p, idx) => {
    const local = getLocal(p.id);
    const status = getStatus(p);
    const latestPhoto = local.photos && local.photos.length
      ? local.photos[local.photos.length - 1].dataUrl : null;
    const imgHtml = latestPhoto
      ? `<img class="plant-card-img" src="${latestPhoto}" alt="${p.name}" loading="lazy" />`
      : `<div class="plant-card-no-img">🪴</div>`;

    return `<div class="plant-card" style="animation-delay:${idx * 0.05}s" onclick="showDetail('${p.id}')">
      ${imgHtml}
      <div class="plant-card-body">
        <div class="plant-card-name">${p.name}</div>
        ${p.location ? `<div class="plant-card-loc">📍 ${p.location}</div>` : ''}
        ${statusBadgeHtml(status)}
      </div>
    </div>`;
  }).join('');
}

function updateHomeSub() {
  const overdue = plants.filter(p => getStatus(p).key === 'overdue').length;
  const soon    = plants.filter(p => getStatus(p).key === 'soon').length;
  let msg = `${plants.length} plant${plants.length !== 1 ? 's' : ''}`;
  if (overdue) msg += ` · ${overdue} overdue`;
  else if (soon) msg += ` · ${soon} due soon`;
  else if (plants.length) msg += ' · all happy 🌿';
  document.getElementById('home-sub').textContent = msg;
}

// ── filter ─────────────────────────────────────────────────────
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === f);
  });
  render();
}

// ── detail screen ──────────────────────────────────────────────
function showDetail(plantId) {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;
  const local = getLocal(plantId);
  const status = getStatus(plant);

  // Hero: latest photo or placeholder
  const latestPhoto = local.photos && local.photos.length
    ? local.photos[local.photos.length - 1].dataUrl : null;
  const heroHtml = latestPhoto
    ? `<img class="detail-hero" src="${latestPhoto}" alt="${plant.name}" />`
    : `<div class="detail-hero-placeholder">🪴</div>`;

  // Watering info
  const lastW = local.lastWatered
    ? new Date(local.lastWatered).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Never recorded';
  const waterIcon = { overdue: '🚨', soon: '💧', ok: '✅' }[status.key] || '💧';

  // Photo timeline (newest first)
  const photos = (local.photos || []).slice().reverse();
  const timelineHtml = photos.length ? `
    <div class="section-heading">Growth timeline</div>
    <div class="timeline">
      ${photos.map(ph => `
        <div class="timeline-item">
          <img class="timeline-img" src="${ph.dataUrl}" alt="" loading="lazy" />
          <div class="timeline-meta">
            <div class="timeline-date">${new Date(ph.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div class="timeline-label">${ph.label || 'Photo added'}</div>
          </div>
        </div>`).join('')}
    </div>` : `<div class="section-heading">Growth timeline</div><p style="font-size:14px;color:var(--ink-light);margin-bottom:1rem;font-weight:300;">No photos yet — add your first one!</p>`;

  document.getElementById('detail-content').innerHTML = `
    ${heroHtml}
    <div class="detail-body">
      <div class="detail-name">${plant.name}</div>
      ${plant.location ? `<div class="detail-loc">📍 ${plant.location}</div>` : ''}

      <div class="watering-card">
        <div class="watering-icon">${waterIcon}</div>
        <div class="watering-info">
          <div class="watering-status">${status.label}</div>
          <div class="watering-next">Last watered: ${lastW}</div>
          <div class="watering-freq">Every ${plant.frequency} day${plant.frequency !== 1 ? 's' : ''}</div>
        </div>
      </div>

      ${plant.notes ? `<p class="detail-notes">${plant.notes}</p>` : ''}

      ${timelineHtml}

      <button class="upload-photo-btn" onclick="triggerPhotoUpload('${plantId}')">
        📷 Add a new photo
        <input type="file" id="photo-upload-${plantId}" accept="image/*" style="display:none"
          onchange="handleTimelinePhoto(this, '${plantId}')" />
      </button>

      <span class="edit-link" onclick="showEditPlant('${plantId}')">Edit plant details</span>
    </div>`;

  document.getElementById('water-btn').onclick = () => waterPlant(plantId);
  showScreen('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function triggerPhotoUpload(plantId) {
  document.getElementById('photo-upload-' + plantId).click();
}

async function handleTimelinePhoto(input, plantId) {
  const file = input.files[0];
  if (!file) return;
  const dataUrl = await readFile(file);
  const compressed = await compressImage(dataUrl, 800);

  if (!localData[plantId]) localData[plantId] = { lastWatered: null, photos: [] };
  localData[plantId].photos.push({
    date: new Date().toISOString(),
    dataUrl: compressed,
    label: 'Growth photo',
  });
  await saveLocalData();
  showToast('Photo added! 🌱');
  showDetail(plantId);
}

// ── water plant ────────────────────────────────────────────────
async function waterPlant(plantId) {
  if (!localData[plantId]) localData[plantId] = { lastWatered: null, photos: [] };
  localData[plantId].lastWatered = new Date().toISOString();
  await saveLocalData();
  showToast('Watered! 💧');
  showDetail(plantId);
  // Update home in background
  updateHomeSub();
}

// ── add / edit plant form ──────────────────────────────────────
function showAddPlant() {
  editingPlantId = null;
  pendingFormPhoto = null;
  document.getElementById('form-title').textContent = 'Add plant';
  document.getElementById('field-name').value = '';
  document.getElementById('field-location').value = '';
  document.getElementById('field-frequency').value = '7';
  document.getElementById('field-last-watered').value = '';
  document.getElementById('field-notes').value = '';
  document.getElementById('form-photo-preview').classList.add('hidden');
  document.getElementById('form-photo-placeholder').style.display = '';
  document.getElementById('delete-btn').classList.add('hidden');
  showScreen('form');
}

function showEditPlant(plantId) {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;
  editingPlantId = plantId;
  pendingFormPhoto = null;

  document.getElementById('form-title').textContent = 'Edit plant';
  document.getElementById('field-name').value = plant.name;
  document.getElementById('field-location').value = plant.location || '';
  document.getElementById('field-frequency').value = plant.frequency || 7;
  document.getElementById('field-notes').value = plant.notes || '';

  const local = getLocal(plantId);
  if (local.lastWatered) {
    document.getElementById('field-last-watered').value = local.lastWatered.split('T')[0];
  } else {
    document.getElementById('field-last-watered').value = '';
  }

  // Show current photo if any
  const latestPhoto = local.photos && local.photos.length
    ? local.photos[local.photos.length - 1].dataUrl : null;
  if (latestPhoto) {
    const preview = document.getElementById('form-photo-preview');
    preview.src = latestPhoto;
    preview.classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  } else {
    document.getElementById('form-photo-preview').classList.add('hidden');
    document.getElementById('form-photo-placeholder').style.display = '';
  }

  document.getElementById('delete-btn').classList.remove('hidden');
  showScreen('form');
}

function handleFormPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const compressed = await compressImage(e.target.result, 800);
    pendingFormPhoto = compressed;
    const preview = document.getElementById('form-photo-preview');
    preview.src = compressed;
    preview.classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function savePlant() {
  const name = document.getElementById('field-name').value.trim();
  const freq = parseInt(document.getElementById('field-frequency').value, 10);
  if (!name) { showToast('Please enter a plant name'); return; }
  if (!freq || freq < 1) { showToast('Please enter how often to water (days)'); return; }

  const location  = document.getElementById('field-location').value.trim();
  const notes     = document.getElementById('field-notes').value.trim();
  const lastW     = document.getElementById('field-last-watered').value;

  if (editingPlantId) {
    // Update existing
    const plant = plants.find(p => p.id === editingPlantId);
    if (plant) {
      plant.name = name; plant.location = location;
      plant.frequency = freq; plant.notes = notes;
    }
    if (lastW) {
      if (!localData[editingPlantId]) localData[editingPlantId] = { lastWatered: null, photos: [] };
      localData[editingPlantId].lastWatered = lastW;
    }
    if (pendingFormPhoto) {
      if (!localData[editingPlantId]) localData[editingPlantId] = { lastWatered: null, photos: [] };
      localData[editingPlantId].photos.push({
        date: new Date().toISOString(), dataUrl: pendingFormPhoto, label: 'Updated photo',
      });
    }
    // Persist locally-added plants
    const localPlants = getLocalPlants();
    const lp = localPlants.find(p => p.id === editingPlantId);
    if (lp) {
      lp.name = name; lp.location = location; lp.frequency = freq; lp.notes = notes;
      await saveLocalPlants(localPlants);
    }
  } else {
    // New plant
    const newId = 'local_' + Date.now();
    const newPlant = { id: newId, name, location, frequency: freq, notes, fromSheet: false };
    plants.push(newPlant);
    localData[newId] = { lastWatered: lastW || null, photos: [] };
    if (pendingFormPhoto) {
      localData[newId].photos.push({
        date: new Date().toISOString(), dataUrl: pendingFormPhoto, label: 'First photo',
      });
    }
    const localPlants = getLocalPlants();
    localPlants.push(newPlant);
    await saveLocalPlants(localPlants);
  }

  await saveLocalData();
  showToast(editingPlantId ? 'Plant updated 🌿' : 'Plant added 🌱');
  goHome();
}

async function deletePlant() {
  if (!editingPlantId) return;
  if (!confirm('Delete this plant? This cannot be undone.')) return;
  plants = plants.filter(p => p.id !== editingPlantId);
  delete localData[editingPlantId];
  const localPlants = getLocalPlants().filter(p => p.id !== editingPlantId);
  await saveLocalPlants(localPlants);
  await saveLocalData();
  showToast('Plant removed');
  goHome();
}

// ── navigation ─────────────────────────────────────────────────
function showScreen(name) {
  document.getElementById('loading-screen').classList.toggle('hidden', name !== 'loading');
  document.getElementById('app').classList.toggle('hidden', name === 'loading');
  ['home','detail','form'].forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

function goHome() { render(); window.scrollTo({ top: 0 }); }

// ── utilities ──────────────────────────────────────────────────
function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      res(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, 2800);
}
