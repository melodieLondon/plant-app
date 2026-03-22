// ── state ─────────────────────────────────────────────────────
let plants = [];
let currentFilter = 'all';
let editingPlantId = null;

// ── boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() { await loadSheet(); }

// ── Google Sheet loader ────────────────────────────────────────
// Sheet columns: name | location | frequency_days | notes | last_watered | photo_url
async function loadSheet() {
  showScreen('loading');
  if (!CONFIG.SHEET_CSV_URL || CONFIG.SHEET_CSV_URL === 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    showError('No Google Sheet configured. Please edit config.js with your sheet URL.');
    return;
  }
  try {
    const url = CONFIG.SHEET_CSV_URL +
      (CONFIG.SHEET_CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    plants = parseCSV(await res.text());
    render();
  } catch(err) {
    showError('Could not load your plant list.<br><br>Make sure your Google Sheet is published as CSV and the URL in config.js is correct.<br><br><small>' + err.message + '</small>');
  }
}

// ── CSV parser ─────────────────────────────────────────────────
// Columns: name | location | frequency_days | notes | last_watered | photo_url
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols.length || cols.every(c => !c.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    if (!row['name']) continue;
    out.push({
      id:          'row_' + i,
      name:        row['name'],
      location:    row['location']     || '',
      frequency:   parseInt(row['frequency_days'] || row['frequency'] || '7', 10),
      notes:       row['notes']        || '',
      lastWatered: row['last_watered'] || '',
      photoUrl:    driveUrl(row['photo_url'] || ''),
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
  result.push(cur); return result;
}

// ── Drive URL converter ────────────────────────────────────────
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

// ── status logic ───────────────────────────────────────────────
function getStatus(plant) {
  if (!plant.lastWatered) return { label: 'Not set', key: 'soon', daysLeft: null };
  const daysSince = Math.floor((new Date() - new Date(plant.lastWatered)) / 86400000);
  const daysLeft  = plant.frequency - daysSince;
  if (daysLeft < 0)   return { label: 'Overdue by ' + Math.abs(daysLeft) + 'd', key: 'overdue', daysLeft };
  if (daysLeft === 0) return { label: 'Water today!', key: 'overdue', daysLeft };
  if (daysLeft <= 2)  return { label: 'Due in ' + daysLeft + 'd', key: 'soon', daysLeft };
  return { label: 'Due in ' + daysLeft + 'd', key: 'ok', daysLeft };
}

function statusBadgeHtml(status) {
  const map = { overdue:['🔴','status-overdue'], soon:['🟡','status-soon'], ok:['🟢','status-ok'] };
  const [icon, cls] = map[status.key] || ['⚪','status-ok'];
  return '<span class="status-badge ' + cls + '">' + icon + ' ' + status.label + '</span>';
}

// ── home ───────────────────────────────────────────────────────
function render() {
  showScreen('home');
  updateHomeSub();
  const grid  = document.getElementById('plant-grid');
  const empty = document.getElementById('empty-state');
  const filtered = currentFilter === 'all'
    ? plants : plants.filter(p => getStatus(p).key === currentFilter);

  if (!filtered.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map((p, idx) => {
    const status = getStatus(p);
    const imgHtml = p.photoUrl
      ? '<img class="plant-card-img" src="' + p.photoUrl + '" alt="' + p.name + '" loading="lazy" onerror="this.outerHTML=\'<div class=plant-card-no-img>🪴</div>\'" />'
      : '<div class="plant-card-no-img">🪴</div>';
    return '<div class="plant-card" style="animation-delay:' + (idx*0.05) + 's" onclick="showDetail(\'' + p.id + '\')">' +
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
  if (overdue)           msg += ' · ' + overdue + ' overdue';
  else if (soon)         msg += ' · ' + soon + ' due soon';
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
  const status = getStatus(plant);
  const waterIcon = { overdue:'🚨', soon:'💧', ok:'✅' }[status.key] || '💧';
  const lastW = plant.lastWatered
    ? new Date(plant.lastWatered).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : 'Never recorded';

  const heroHtml = plant.photoUrl
    ? '<img class="detail-hero" src="' + plant.photoUrl + '" alt="' + plant.name + '" onerror="this.outerHTML=\'<div class=detail-hero-placeholder>🪴</div>\'" />'
    : '<div class="detail-hero-placeholder">🪴</div>';

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
        '</div>' +
      '</div>' +

      (plant.notes ? '<p class="detail-notes">' + plant.notes + '</p>' : '') +

      // ── Sheet update instructions ──────────────────────────
      '<div class="sheet-panel">' +
        '<div class="sheet-panel-title">📋 To update this plant</div>' +
        '<div class="sheet-panel-body">' +
          '<p>Open your Google Sheet and update the <strong>' + plant.name + '</strong> row:</p>' +
          '<ul>' +
            '<li><strong>last_watered</strong> — paste today\'s date: <span class="date-chip" onclick="copyDate(this)">' + todayISO() + ' (tap to copy)</span></li>' +
            '<li><strong>photo_url</strong> — paste a Google Drive share link</li>' +
          '</ul>' +
          '<p class="sheet-note">Changes appear in the app after tapping ↻ Refresh below.</p>' +
        '</div>' +
      '</div>' +

      '<button class="refresh-btn-detail" onclick="loadSheet()">↻ Refresh from sheet</button>' +
      '<span class="edit-link" onclick="showEditPlant(\'' + plantId + '\')">Edit in sheet →</span>' +
    '</div>';

  document.getElementById('water-btn').onclick = () => markWatered(plant);
  showScreen('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── quick water helper ─────────────────────────────────────────
// Copies today's date so the user can paste it into the sheet
function markWatered(plant) {
  const today = todayISO();
  navigator.clipboard.writeText(today).then(() => {
    showToast('📋 Date copied! Paste into last_watered in your sheet for ' + plant.name);
  }).catch(() => {
    showToast('Today\'s date: ' + today + ' — copy and paste into your sheet');
  });
}

function copyDate(el) {
  const date = todayISO();
  navigator.clipboard.writeText(date).then(() => {
    el.textContent = '✓ Copied!';
    setTimeout(() => { el.textContent = date + ' (tap to copy)'; }, 2000);
  }).catch(() => { showToast('Date: ' + date); });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── edit form (sheet-based) ────────────────────────────────────
function showAddPlant() {
  editingPlantId = null;
  document.getElementById('form-title').textContent = 'Add plant';
  ['field-name','field-location','field-notes','field-photo-url'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('field-frequency').value = '7';
  document.getElementById('field-last-watered').value = '';
  document.getElementById('field-photo-url').value = '';
  document.getElementById('form-photo-preview').classList.add('hidden');
  document.getElementById('form-photo-placeholder').style.display = '';
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('form-sheet-note').classList.add('hidden');
  showScreen('form');
}

function showEditPlant(plantId) {
  const plant = plants.find(p => p.id === plantId); if (!plant) return;
  editingPlantId = plantId;
  document.getElementById('form-title').textContent = 'Edit plant';
  document.getElementById('field-name').value         = plant.name;
  document.getElementById('field-location').value     = plant.location || '';
  document.getElementById('field-frequency').value    = plant.frequency || 7;
  document.getElementById('field-notes').value        = plant.notes || '';
  document.getElementById('field-last-watered').value = plant.lastWatered || '';
  document.getElementById('field-photo-url').value    = '';  // raw url not stored, drive converted
  if (plant.photoUrl) {
    document.getElementById('form-photo-preview').src = plant.photoUrl;
    document.getElementById('form-photo-preview').classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  } else {
    document.getElementById('form-photo-preview').classList.add('hidden');
    document.getElementById('form-photo-placeholder').style.display = '';
  }
  document.getElementById('delete-btn').classList.remove('hidden');
  document.getElementById('form-sheet-note').classList.remove('hidden');
  showScreen('form');
}

function handlePhotoUrlInput(input) {
  const url = driveUrl(input.value.trim());
  if (url) {
    document.getElementById('form-photo-preview').src = url;
    document.getElementById('form-photo-preview').classList.remove('hidden');
    document.getElementById('form-photo-placeholder').style.display = 'none';
  }
}

function savePlant() {
  const name = document.getElementById('field-name').value.trim();
  const freq = parseInt(document.getElementById('field-frequency').value, 10);
  if (!name) { showToast('Please enter a plant name'); return; }
  if (!freq || freq < 1) { showToast('Please enter watering frequency in days'); return; }

  const location   = document.getElementById('field-location').value.trim();
  const notes      = document.getElementById('field-notes').value.trim();
  const lastWatered= document.getElementById('field-last-watered').value.trim();
  const photoRaw   = document.getElementById('field-photo-url').value.trim();
  const photoUrl   = driveUrl(photoRaw);

  // Build a row summary to show what to paste into the sheet
  const row = [name, location, freq, notes, lastWatered, photoRaw].join(' | ');

  // Show sheet instructions
  const msg = editingPlantId
    ? 'Update this row in your Google Sheet:\n\n' + row
    : 'Add this row to your Google Sheet:\n\n' + row + '\n\nColumns: name | location | frequency_days | notes | last_watered | photo_url';

  // Update local plant display immediately
  if (editingPlantId) {
    const plant = plants.find(p => p.id === editingPlantId);
    if (plant) { plant.name = name; plant.location = location; plant.frequency = freq; plant.notes = notes; plant.lastWatered = lastWatered; plant.photoUrl = photoUrl; }
  } else {
    plants.push({ id: 'local_' + Date.now(), name, location, frequency: freq, notes, lastWatered, photoUrl, fromSheet: false });
  }

  showToast(editingPlantId ? 'Updated locally — remember to save to your sheet!' : 'Added locally — remember to add to your sheet!');
  goHome();
}

function deletePlant() {
  if (!editingPlantId || !confirm('Remove from app? Remember to also delete the row from your Google Sheet.')) return;
  plants = plants.filter(p => p.id !== editingPlantId);
  showToast('Removed — delete the row from your sheet too');
  goHome();
}

// ── navigation ─────────────────────────────────────────────────
function showScreen(name) {
  document.getElementById('loading-screen').classList.toggle('hidden', name !== 'loading');
  document.getElementById('app').classList.toggle('hidden', name === 'loading');
  ['home','detail','form','error'].forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.classList.toggle('hidden', s !== name);
  });
}

function goHome() { render(); window.scrollTo({ top: 0 }); }

function showError(msg) {
  document.getElementById('error-msg').innerHTML = msg;
  showScreen('error');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden'); t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, 3500);
}
