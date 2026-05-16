import { createBPObservation, classifyBP, fhirBundle } from './fhir.js';
import { BPDatabase } from './db.js';

let db;
let chart;
let deferredInstall;

async function init() {
  registerSW();
  db = new BPDatabase();
  await db.init();
  initForm();
  initInstallPrompt();
  document.getElementById('btn-export').addEventListener('click', exportBundle);
  render();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function initForm() {
  const form     = document.getElementById('bp-form');
  const sysInput = document.getElementById('systolic');
  const diaInput = document.getElementById('diastolic');
  const preview  = document.getElementById('bp-preview');
  const saveBtn  = document.getElementById('btn-save');
  const dtInput  = document.getElementById('measured-at');

  dtInput.value = localISOString(new Date());

  function updatePreview() {
    const sys = parseInt(sysInput.value, 10);
    const dia = parseInt(diaInput.value, 10);
    if (sys > 0 && dia > 0) {
      const c = classifyBP(sys, dia);
      preview.textContent = `${sys}/${dia} — ${c.label}`;
      preview.className = `bp-preview bp-${c.cls}`;
      saveBtn.disabled = false;
    } else {
      preview.className = 'bp-preview hidden';
      saveBtn.disabled = true;
    }
  }

  sysInput.addEventListener('input', updatePreview);
  diaInput.addEventListener('input', updatePreview);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const systolic  = parseInt(sysInput.value, 10);
    const diastolic = parseInt(diaInput.value, 10);
    const pulse     = parseInt(document.getElementById('pulse').value, 10) || null;
    const arm       = document.getElementById('arm').value;
    const position  = document.getElementById('position').value;
    const notes     = document.getElementById('notes').value.trim();
    const measuredAt = new Date(dtInput.value).toISOString();
    const id   = crypto.randomUUID();
    const fhir = createBPObservation({ id, systolic, diastolic, pulse, arm, position, notes, measuredAt });
    db.insert({ id, systolic, diastolic, pulse, arm, position, notes, measured_at: measuredAt, fhir });
    form.reset();
    dtInput.value = localISOString(new Date());
    preview.className = 'bp-preview hidden';
    saveBtn.disabled  = true;
    toast('Reading saved');
    render();
  });
}

function render() {
  const readings = db.getAll();
  renderHistory(readings);
  renderChart(readings);
}

function renderHistory(readings) {
  const list = document.getElementById('history-list');
  if (readings.length === 0) {
    list.innerHTML = '<p class="empty-state">No readings yet. Add your first reading above.</p>';
    return;
  }
  list.innerHTML = readings.map(r => {
    const c    = classifyBP(r.systolic, r.diastolic);
    const dt   = new Date(r.measured_at);
    const date = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `<div class="reading-item">
      <div class="reading-main">
        <span class="reading-values">
          <b>${r.systolic}</b>/<b>${r.diastolic}</b>
          <span class="reading-unit">mmHg</span>
          ${r.pulse ? `<span class="reading-pulse">♥ ${r.pulse}</span>` : ''}
        </span>
        <span class="reading-badge bp-${c.cls}">${c.label}</span>
      </div>
      <div class="reading-meta">
        <span>${date} · ${time}</span>
        <span>${r.arm} arm · ${r.position}</span>
      </div>
      ${r.notes ? `<div class="reading-notes">${esc(r.notes)}</div>` : ''}
      <div class="reading-actions">
        <button class="btn-sm btn-fhir" data-id="${r.id}">FHIR JSON</button>
        <button class="btn-sm btn-delete" data-id="${r.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.btn-fhir').forEach(btn =>
    btn.addEventListener('click', () => showFhirModal(btn.dataset.id)));
  list.querySelectorAll('.btn-delete').forEach(btn =>
    btn.addEventListener('click', () => deleteReading(btn.dataset.id)));
}

function renderChart(readings) {
  const canvas = document.getElementById('bp-chart');
  if (chart) { chart.destroy(); chart = null; }
  const ordered = [...readings].reverse();
  if (ordered.length === 0) return;
  const labels = ordered.map(r => new Date(r.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Systolic',  data: ordered.map(r => r.systolic),  borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',  tension: 0.35, pointRadius: 5, pointHoverRadius: 7, fill: false },
        { label: 'Diastolic', data: ordered.map(r => r.diastolic), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)',  tension: 0.35, pointRadius: 5, pointHoverRadius: 7, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} mmHg` } },
      },
      scales: {
        y: {
          min: 50, max: 200, ticks: { stepSize: 20 },
          title: { display: true, text: 'mmHg', color: '#64748b' },
          grid: { color: ctx => { const v = ctx.tick.value; if (v===120) return 'rgba(234,179,8,0.4)'; if (v===130) return 'rgba(249,115,22,0.4)'; if (v===140) return 'rgba(239,68,68,0.4)'; if (v===80) return 'rgba(37,99,235,0.25)'; if (v===90) return 'rgba(239,68,68,0.25)'; return 'rgba(0,0,0,0.05)'; } },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function deleteReading(id) {
  if (!confirm('Delete this reading?')) return;
  db.delete(id);
  toast('Reading deleted');
  render();
}

function showFhirModal(id) {
  const r = db.getAll().find(x => x.id === id);
  if (!r) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="FHIR Observation JSON">
      <div class="modal-header">
        <h3>FHIR Observation</h3>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <pre class="fhir-json">${esc(JSON.stringify(r.fhir, null, 2))}</pre>
    </div>`;
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function exportBundle() {
  const bundle = fhirBundle(db.exportFhir());
  if (bundle.total === 0) { toast('No readings to export'); return; }
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `bp-fhir-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${bundle.total} reading${bundle.total !== 1 ? 's' : ''}`);
}

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    document.getElementById('btn-install').classList.remove('hidden');
  });
  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') document.getElementById('btn-install').classList.add('hidden');
    deferredInstall = null;
  });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function localISOString(date) {
  const off = date.getTimezoneOffset() * 60000;
  return new Date(date - off).toISOString().slice(0, 16);
}

init().catch(err => {
  document.body.innerHTML = `<div style="padding:2rem;color:#dc2626"><b>Failed to initialize database.</b><br>${err.message}</div>`;
  console.error(err);
});
