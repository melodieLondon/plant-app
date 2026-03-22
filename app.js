// ── state ─────────────────────────────────────────────────────
let plants = [];
let localData = {};
let currentFilter = 'all';
let editingPlantId = null;
let pendingFormPhoto = null;

// ── boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadLocalData();
  await loadSheet();
}

// ── local storage ──────────────────────────────────────────────
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
    plants = getLocalPlants();
    render(); return;
  }
  try {
    const url = CONFIG.SHEET_CSV_URL +
      (CONFIG.SHEET_CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    plants = parseCSV(await res.text());
    const local = getLocalPlants();
    local.forEach(lp => { if (!plants.find(p => p.id === lp.id)) plants.push(lp); });
    render();
  } catch(err) {
    plants = getLocalPlants();
    render();
    showToast('Could not load sheet — showing local plants');
  }
}

function getLocalPlants() {
  try { const r = localData['__plants__']; return r ? JSON.parse(r) : []; } catch(e) { return []; }
}

async function saveLocalPlants(list) {
  localData['__plants__'] = JSON.stringify(list);
  await saveLocalData();
}

// ── CSV parser ─────────────────────────────────────────────────
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
      id: 'sheet_' + i,
      name: row['name'],
      location: row['location'] || '',
      frequency: parseInt(row['frequency_days'] || row['frequency'] || '7', 10),
      notes: row['notes'] || '',
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
  if (!local.lastWatered) return { label: 'Not set', key: 'soon', daysLeft: null };
  const daysSince = Math.floor((new Date() - new Date(local.lastWatered)) / 86400000);
  const daysLeft  = plant.frequency - daysSince;
  if (daysLeft < 0)   return { label: 'Overdue by ' + Math.abs(daysLeft) + 'd', key: 'overdue', daysLeft };
  if (daysLeft === 0) return { label: 'Water today!', key: 'overdue', daysLeft };
  if (daysLeft <= 2)  return { label: 'Due in ' + daysLeft + 'd', key: 'soon', daysLeft };
  return { label: 'Due in ' + daysLeft + 'd', key: 'ok', daysLeft };
}

function statusBadgeHtml(status) {
  const map = { overdue: ['🔴','status-overdue'], soon: ['🟡','status-soon'], ok: ['🟢','status-ok'] };
  const [icon, cls] = map[status.key] || ['⚪','status-ok'];
  return '<span class="status-badge ' + cls + '">' + icon + ' ' + status.label + '</span>';
}

// ── photo helpers ──────────────────────────────────────────────
// Convert a Google Drive share link to a displayable URL
function driveUrl(raw) {
  if (!raw) return '';
  raw = raw.trim();
  if (raw.startsWith('https://drive.google.com/thumbnail') ||
      raw.startsWith('https://lh3.googleusercontent.com')) return raw;
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw))
    return 'https://drive.google.com/thumbnail?id=' + raw + '&sz=w800';
  return raw;
}

// A photo entry has either .dataUrl (local upload) or .driveUrl (Drive link)
function photoSrc(ph) {
  return ph.driveUrl ? driveUrl(ph.driveUrl) : (ph.dataUrl || '');
}

// ── render home ────────────────────────────────────────────────
function render() {
  showScreen('home');
  updateHomeSub();
  const grid  = document.getElementById('plant-grid');
  const empty = document.getElementById('empty-state');
  let filtered = currentFilter === 'all' ? plants : plants.filter(p => getStatus(p).key === currentFilter);

  if (!filtered.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map((p, idx) => {
    const local = getLocal(p.id);
    const status = getStatus(p);
    const photos = local.photos || [];
    const latest = photos.length ? photos[photos.length - 1] : null;
    const src = latest ? photoSrc(latest) : null;
    const imgHtml = src
      ? '<img class="plant-card-img" src="' + src + '" alt="' + p.name + '" loading="lazy" onerror="this.outerHTML=\'<div class=plant-card-no-img>🪴</div>\'" />'
      : '<div class="plant-card-no-img">🪴</div>';
    return '<div class="plant-card" style="animation-delay:' + (idx * 0.05) + 's" onclick="showDetail(\'' + p.id + '\')">' +
      imgHtml +
      '<div class="plant-card-body">' +
        '<div class="plant-card-name">' + p.name + '</div>' +
        (p.location ? '<div class="plant-card-loc">📍 ' + p.location + '</div>' : '') +
        statusBadgeHtml(status) +
      '</div></div>';
  }).join('');
}

function updateHomeSub() {
  const overdue = plants.filter(p => getStatus(p).key === 'overdue').length;
  const soon    = plants.filter(p => getStatus(p).key === 'soon').length;
  let msg = plants.length + ' plant' + (plants.length !== 1 ? 's' : '');
  if (overdue) msg += ' · ' + overdue + ' overdue';
  else if (soon) msg += ' · ' + soon + ' due soon';
  else if (plants.length) msg += ' · all happy 🌿';
  document.getElementById('home-sub').textContent = msg;
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === f));
  render();
}

// ── detail screen ──────────────────────────────────────────────
function showDetail(plantId) {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;
  const local  = getLocal(plantId);
  const status = getStatus(plant);

  const photos = local.photos || [];
  const latest = photos.length ? photos[photos.length - 1] : null;
  const latestSrc = latest ? photoSrc(latest) : null;

  const heroHtml = latestSrc
    ? '<img class="detail-hero" src="' + latestSrc + '" alt="' + plant.name + '" onerror="this.outerHTML=\'<div class=detail-hero-placeholder>🪴</div>\'" />'
    : '<div class="detail-hero-placeholder">🪴</div>';

  const lastW = local.lastWatered
    ? new Date(local.lastWatered).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : 'Never recorded';
  const waterIcon = { overdue:'🚨', soon:'💧', ok:'✅' }[status.key] || '💧';

  // Timeline newest first
  const reversed = photos.slice().reverse();
  const timelineHtml = reversed.length
    ? '<div class="section-heading">Growth timeline</div><div class="timeline">' +
        reversed.map(ph => {
          const src = photoSrc(ph);
          const tag = ph.driveUrl ? '☁️ Drive' : '📱 Local';
          return '<div class="timeline-item">' +
            '<img class="timeline-img" src="' + src + '" alt="" loading="lazy" onerror="this.style.display=\'none\'" />' +
            '<div class="timeline-meta">' +
              '<div class="timeline-date">' + new Date(ph.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + '</div>' +
              '<div class="timeline-label">' + (ph.label || 'Photo') + ' <span class="photo-source-tag">' + tag + '</span></div>' +
            '</div></div>';
        }).join('') + '</div>'
    : '<div class="section-heading">Growth timeline</div><p style="font-size:14px;color:var(--ink-light);margin-bottom:1rem;font-weight:300;">No photos yet — add your first one below!</p>';

  document.getElementById('detail-content').innerHTML =
    heroHtml +
    '<div class="detail-body">' +
      '<div class="detail-name">' + plant.name + '</div>' +
      (plant.location ? '<div class="detail-loc">📍 ' + plant.location + '</div>' : '') +
      '<div class="watering-card">' +
        '<div class="watering-icon">' + waterIcon + '</div>' +
        '<div class="watering-info">' +
          '<div class="watering-status">' + status.label + '</div>' +
          '<div class="watering-next">Last watered: ' + lastW + '</div>' +
          '<div class="watering-freq">Every ' + plant.frequency + ' day' + (plant.frequency !== 1 ? 's' : '') + '</div>' +
        '</div></div>' +
      (plant.notes ? '<p class="detail-notes">' + plant.notes + '</p>' : '') +
      timelineHtml +
      // ── Photo add panel ──────────────────────────────────────
      '<div class="add-photo-panel">' +
        '<div class="section-heading" style="margin-bottom:.75rem">Add a photo</div>' +
        '<div class="add-photo-options">' +
          // Option A: upload
          '<label class="add-photo-opt" title="Upload from your phone">' +
            '<input type="file" accept="image/*" style="display:none" onchange="handleUploadPhoto(this,\'' + plantId + '\')" />' +
            '<span class="add-photo-icon">📱</span>' +
            '<span class="add-photo-label">Upload photo</span>' +
            '<span class="add-photo-sub">Stored locally</span>' +
          '</label>' +
          // Option B: Drive link
          '<button class="add-photo-opt" onclick="showDriveLinkInput(\'' + plantId + '\')" title="Paste a Google Drive link">' +
            '<span class="add-photo-icon">☁️</span>' +
            '<span class="add-photo-label">Drive link</span>' +
            '<span class="add-photo-sub">Syncs everywhere</span>' +
          '</button>' +
        '</div>' +
        // Drive link input (hidden by default)
        '<div class="drive-link-row hidden" id="drive-link-row-' + plantId + '">' +
          '<input type="url" id="drive-link-input-' + plantId + '" placeholder="Paste Google Drive share link…" style="flex:1" />' +
          '<button class="drive-link-save" onclick="saveDriveLink(\'' + plantId + '\')">Save</button>' +
        '</div>' +
      '</div>' +
      '<span class="edit-link" onclick="showEditPlant(\'' + plantId + '\')">Edit plant details</span>' +
    '</div>';

  document.getElementById('water-btn').onclick = () => waterPlant(plantId);
  showScreen('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── photo: upload from device ──────────────────────────────────
async function handleUploadPhoto(input, plantId) {
  const file = input.files[0];
  if (!file) return;
  const dataUrl    = await readFile(file);
  const compressed = await compressImage(dataUrl, 800);
  if (!localData[plantId]) localData[plantId] = { lastWatered: null, photos: [] };
  localData[plantId].photos.push({
    date: new Date().toISOString(), dataUrl: compressed, label: 'Growth photo',
  });
  await saveLocalData();
  showToast('Photo saved locally 📱');
  showDetail(plantId);
}

// ── photo: Google Drive link ───────────────────────────────────
function showDriveLinkInput(plantId) {
  const row = document.getElementById('drive-link-row-' + plantId);
  if (row) { row.classList.toggle('hidden'); document.getElementById('drive-link-input-' + plantId).focus(); }
}

async function saveDriveLink(plantId) {
  const input = document.getElementById('drive-link-input-' + plantId);
  const raw   = (input.value || '').trim();
  if (!raw) { showToast('Please paste a Drive link first'); return; }
  const resolved = driveUrl(raw);
  if (!resolved) { showToast('Could not recognise that link'); return; }
  if (!localData[plantId]) localData[plantId] = { lastWatered: null, photos: [] };
  localData[plantId].photos.push({
    date: new Date().toISOString(), driveUrl: raw, label: 'Growth photo',
  });
  await saveLocalData();
  showToast('Drive photo linked ☁️');
  showDetail(plantId);
}

// ── water plant ────────────────────────────────────────────────
async function waterPlant(plantId) {
  if (!localData[plantId]) localData[plantId] = { lastWatered: null, photos: [] };
  localData[plantId].lastWatered = new Date().toISOString();
  await saveLocalData();
  showToast('Watered! 💧');
  showDetail(plantId);
  updateHomeSub();
}

// ── add / edit form ────────────────────────────────────────────
function showAddPlant() {
  editingPlantId = null; pendingFormPhoto = null;
  document.getElementById('form-title').textContent = 'Add plant';
  ['field-name','field-location','field-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('field-frequency').value = '7';
  document.getElementById('field-last-watered').value = '';
  document.getElementById('form-photo-preview').classList.add('hidden');
  document.getElementById('form-photo-placeholder').style.display = '';
  document.getElementById('delete-btn').classList.add('hidden');
  showScreen('form');
}

function showEditPlant(plantId) {
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return;
  editingPlantId = plantId; pendingFormPhoto = null;
  document.getElementById('form-title').textContent = 'Edit plant';
  document.getElementById('field-name').value      = plant.name;
  document.getElementById('field-location').value  = plant.location || '';
  document.getElementById('field-frequency').value = plant.frequency || 7;
  document.getElementById('field-notes').value     = plant.notes || '';
  const local = getLocal(plantId);
  document.getElementById('field-last-watered').value = local.lastWatered ? local.lastWatered.split('T')[0] : '';
  const photos = local.photos || [];
  const latest = photos.length ? photos[photos.length-1] : null;
  const latestSrc = latest ? photoSrc(latest) : null;
  if (latestSrc) {
    const preview = document.getElementById('form-photo-preview');
    preview.src = latestSrc; preview.classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  } else {
    document.getElementById('form-photo-preview').classList.add('hidden');
    document.getElementById('form-photo-placeholder').style.display = '';
  }
  document.getElementById('delete-btn').classList.remove('hidden');
  showScreen('form');
}

function handleFormPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const compressed = await compressImage(e.target.result, 800);
    pendingFormPhoto = compressed;
    const preview = document.getElementById('form-photo-preview');
    preview.src = compressed; preview.classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function savePlant() {
  const name = document.getElementById('field-name').value.trim();
  const freq = parseInt(document.getElementById('field-frequency').value, 10);
  if (!name) { showToast('Please enter a plant name'); return; }
  if (!freq || freq < 1) { showToast('Please enter watering frequency in days'); return; }
  const location = document.getElementById('field-location').value.trim();
  const notes    = document.getElementById('field-notes').value.trim();
  const lastW    = document.getElementById('field-last-watered').value;

  if (editingPlantId) {
    const plant = plants.find(p => p.id === editingPlantId);
    if (plant) { plant.name = name; plant.location = location; plant.frequency = freq; plant.notes = notes; }
    if (lastW) {
      if (!localData[editingPlantId]) localData[editingPlantId] = { lastWatered: null, photos: [] };
      localData[editingPlantId].lastWatered = lastW;
    }
    if (pendingFormPhoto) {
      if (!localData[editingPlantId]) localData[editingPlantId] = { lastWatered: null, photos: [] };
      localData[editingPlantId].photos.push({ date: new Date().toISOString(), dataUrl: pendingFormPhoto, label: 'Updated photo' });
    }
    const lps = getLocalPlants(); const lp = lps.find(p => p.id === editingPlantId);
    if (lp) { lp.name = name; lp.location = location; lp.frequency = freq; lp.notes = notes; await saveLocalPlants(lps); }
  } else {
    const newId = 'local_' + Date.now();
    const newPlant = { id: newId, name, location, frequency: freq, notes, fromSheet: false };
    plants.push(newPlant);
    localData[newId] = { lastWatered: lastW || null, photos: [] };
    if (pendingFormPhoto) localData[newId].photos.push({ date: new Date().toISOString(), dataUrl: pendingFormPhoto, label: 'First photo' });
    const lps = getLocalPlants(); lps.push(newPlant);
    await saveLocalPlants(lps);
  }
  await saveLocalData();
  showToast(editingPlantId ? 'Plant updated 🌿' : 'Plant added 🌱');
  goHome();
}

async function deletePlant() {
  if (!editingPlantId || !confirm('Delete this plant? This cannot be undone.')) return;
  plants = plants.filter(p => p.id !== editingPlantId);
  delete localData[editingPlantId];
  await saveLocalPlants(getLocalPlants().filter(p => p.id !== editingPlantId));
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
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      res(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden'); t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, 2800);
}
