import { lineChart, barChart, stackedBar } from './charts.js';

const $ = (id) => document.getElementById(id);
const raw = new Map(); // label -> { path, ok, data }
let units = 'metric';
let rerenders = [];

// ---------- formatting ----------

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
const imperial = () => units === 'statute_us';
const dist = (m) => (m == null ? '—' : imperial() ? `${num(m / 1609.344, 2)} mi` : `${num(m / 1000, 2)} km`);
const weight = (g) => (g == null ? '—' : imperial() ? `${num(g / 453.592, 1)} lb` : `${num(g / 1000, 1)} kg`);
const height = (cm) => (cm == null ? '—' : imperial() ? `${Math.floor(cm / 30.48)}′ ${Math.round((cm % 30.48) / 2.54)}″` : `${num(cm, 0)} cm`);
const elev = (m) => (m == null ? '—' : imperial() ? `${num(m * 3.28084)} ft` : `${num(m)} m`);
function dur(sec) {
  if (sec == null || !Number.isFinite(+sec)) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
}
const hm = (sec) => (sec == null ? '—' : `${Math.floor(sec / 3600)}h ${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}m`);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
const titleCase = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- API ----------

async function api(label, path) {
  // The local server (server.js) adds the token from .env and forwards to Garmin.
  try {
    const res = await fetch(`api/garmin/${path}`);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    raw.set(label, { path, ok: res.ok, status: res.status, data });
    if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  } catch (err) {
    if (!err.status) {
      err.message = `Could not reach the local server (${err.message}). Is \`npm start\` running?`;
      raw.set(label, { path, ok: false, status: 0, data: { error: err.message } });
    }
    throw err;
  }
}

const settle = async (p) => { try { return await p; } catch { return null; } };

// ---------- rendering helpers ----------

function banner(msg) {
  $('banner').hidden = !msg;
  $('banner').innerHTML = msg || '';
}

function facts(target, rows) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== '—');
  $(target).innerHTML = shown.length
    ? shown.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')
    : '<dd class="empty" style="grid-column:1/-1">No data</dd>';
}

function kpi(label, value, sub, ratio) {
  const meter = ratio != null ? `<div class="meter" role="presentation"><i style="width:${Math.min(ratio, 1) * 100}%"></i></div>` : '';
  return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${meter}</div>`;
}

function chart(fn) {
  rerenders.push(fn);
  fn();
}

// ---------- sections ----------

function renderProfile(social, settings) {
  const u = settings?.userData || {};
  units = u.measurementSystem || 'metric';
  const name = social?.fullName || social?.displayName || 'Garmin athlete';
  $('name').textContent = name;
  document.title = `${name} · Garmin`;
  $('subtitle').textContent = [social?.location, social?.userName && `@${social.userName}`].filter(Boolean).join(' · ') || 'Garmin Connect';
  const img = social?.profileImageUrlLarge || social?.profileImageUrlMedium;
  $('avatar').hidden = !img;
  if (img) $('avatar').src = img;

  const age = u.birthDate ? Math.floor((Date.now() - new Date(u.birthDate)) / 31557600000) : null;
  const sleep = settings?.userSleep;
  const clock = (s) => (s == null ? null : `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`);
  facts('profile', [
    ['Display name', social?.displayName],
    ['Gender', u.gender && titleCase(u.gender)],
    ['Age', age],
    ['Height', u.height && height(u.height)],
    ['Weight', u.weight && weight(u.weight)],
    ['VO₂ max (run)', u.vo2MaxRunning],
    ['VO₂ max (bike)', u.vo2MaxCycling],
    ['Lactate threshold HR', u.lactateThresholdHeartRate && `${u.lactateThresholdHeartRate} bpm`],
    ['Activity level', u.activityLevel],
    ['Sleep window', sleep && clock(sleep.sleepTime) && `${clock(sleep.sleepTime)} – ${clock(sleep.wakeTime)}`],
    ['Units', titleCase(units)],
    ['Garmin level', social?.userLevel],
    ['Points', social?.userPoint],
  ]);
}

function renderSummary(s) {
  if (!s) { $('kpis').innerHTML = ''; return; }
  const intensity = (s.moderateIntensityMinutes || 0) + 2 * (s.vigorousIntensityMinutes || 0);
  $('kpis').innerHTML = [
    kpi('Steps', num(s.totalSteps), s.dailyStepGoal && `Goal ${num(s.dailyStepGoal)}`, s.dailyStepGoal ? s.totalSteps / s.dailyStepGoal : null),
    kpi('Distance', dist(s.totalDistanceMeters)),
    kpi('Calories', `${num(s.totalKilocalories)} kcal`, s.activeKilocalories != null && `${num(s.activeKilocalories)} active`),
    kpi('Floors', num(s.floorsAscended), s.userFloorsAscendedGoal && `Goal ${num(s.userFloorsAscendedGoal)}`, s.userFloorsAscendedGoal ? s.floorsAscended / s.userFloorsAscendedGoal : null),
    kpi('Resting HR', s.restingHeartRate ? `${s.restingHeartRate} bpm` : '—', s.minHeartRate && `Range ${s.minHeartRate}–${s.maxHeartRate}`),
    kpi('Avg stress', num(s.averageStressLevel), s.maxStressLevel && `Max ${s.maxStressLevel}`),
    kpi('Body Battery', s.bodyBatteryHighestValue != null ? `${s.bodyBatteryLowestValue}–${s.bodyBatteryHighestValue}` : '—', s.bodyBatteryChargedValue != null && `+${s.bodyBatteryChargedValue} / −${s.bodyBatteryDrainedValue}`),
    kpi('Intensity min', num(intensity), s.intensityMinutesGoal && `Weekly goal ${num(s.intensityMinutesGoal)}`),
  ].join('');
}

function renderHeartRate(hr) {
  const pts = (hr?.heartRateValues || []).map(([t, v]) => ({ x: new Date(t), y: v }));
  $('hr-caption').textContent = hr?.restingHeartRate
    ? `Resting ${hr.restingHeartRate} bpm · min ${hr.minHeartRate ?? '—'} · max ${hr.maxHeartRate ?? '—'}`
    : '';
  chart(() => lineChart($('hr-chart'), { points: pts, color: 'var(--series-8)', yFormat: (v) => `${Math.round(v)} bpm`, label: 'Heart rate through the day' }));
}

function renderStress(stress) {
  const sPts = (stress?.stressValuesArray || []).map(([t, v]) => ({ x: new Date(t), y: v >= 0 ? v : null }));
  const bPts = (stress?.bodyBatteryValuesArray || []).map((row) => ({ x: new Date(row[0]), y: typeof row[2] === 'number' ? row[2] : typeof row[1] === 'number' ? row[1] : null }));
  $('stress-caption').textContent = stress?.avgStressLevel != null ? `Average ${stress.avgStressLevel} · max ${stress.maxStressLevel ?? '—'} (0–100)` : '';
  const bbVals = bPts.filter((p) => p.y != null).map((p) => p.y);
  $('bb-caption').textContent = bbVals.length ? `Now ${bbVals[bbVals.length - 1]} · high ${Math.max(...bbVals)} · low ${Math.min(...bbVals)}` : '';
  chart(() => lineChart($('stress-chart'), { points: sPts, color: 'var(--series-2)', yMin: 0, yFormat: (v) => `${Math.round(v)}`, label: 'Stress level through the day' }));
  chart(() => lineChart($('bb-chart'), { points: bPts, color: 'var(--series-1)', yMin: 0, yFormat: (v) => `${Math.round(v)}`, label: 'Body Battery through the day' }));
}

function renderSleep(sleep) {
  const d = sleep?.dailySleepDTO;
  const score = d?.sleepScores?.overall;
  $('sleep-head').innerHTML = d?.sleepTimeSeconds
    ? `<b>${esc(hm(d.sleepTimeSeconds))}</b><span>${score?.value != null ? `Score ${esc(score.value)}${score.qualifierKey ? ` · ${esc(titleCase(score.qualifierKey))}` : ''}` : ''}</span>`
    : '';
  stackedBar($('sleep-chart'), {
    format: hm,
    parts: [
      { label: 'Deep', value: d?.deepSleepSeconds, color: 'var(--series-7)' },
      { label: 'Light', value: d?.lightSleepSeconds, color: 'var(--series-1)' },
      { label: 'REM', value: d?.remSleepSeconds, color: 'var(--series-3)' },
      { label: 'Awake', value: d?.awakeSleepSeconds, color: 'var(--series-4)' },
    ],
  });
  return d;
}

function renderRecovery(sleepDto, hrv, readiness, vo2) {
  const h = hrv?.hrvSummary;
  const r = Array.isArray(readiness) ? readiness[0] : readiness;
  const v = Array.isArray(vo2) ? vo2[vo2.length - 1] : vo2;
  facts('recovery', [
    ['HRV last night', h?.lastNightAvg && `${h.lastNightAvg} ms`],
    ['HRV 7-day avg', h?.weeklyAvg && `${h.weeklyAvg} ms`],
    ['HRV status', h?.status && titleCase(h.status)],
    ['Training readiness', r?.score != null && `${r.score}${r.level ? ` · ${titleCase(r.level)}` : ''}`],
    ['Readiness note', r?.feedbackShort && titleCase(r.feedbackShort)],
    ['VO₂ max', v?.generic?.vo2MaxPreciseValue ?? v?.generic?.vo2MaxValue],
    ['Fitness age', v?.generic?.fitnessAge],
    ['Avg overnight HRV', sleepDto?.avgOvernightHrv && `${num(sleepDto.avgOvernightHrv)} ms`],
    ['Sleep resting HR', sleepDto?.restingHeartRate && `${sleepDto.restingHeartRate} bpm`],
    ['Avg SpO₂', sleepDto?.averageSpO2Value && `${sleepDto.averageSpO2Value}%`],
    ['Avg respiration', sleepDto?.averageRespirationValue && `${num(sleepDto.averageRespirationValue, 1)} brpm`],
  ]);
}

function renderSteps(days) {
  const rows = (days || []).map((d) => ({
    label: shortDay(d.calendarDate),
    value: d.totalSteps,
    tip: `<strong>${num(d.totalSteps)} steps</strong><span>${shortDay(d.calendarDate)} · ${dist(d.totalDistance)}</span>`,
    goal: d.stepGoal,
  }));
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  const withData = rows.filter((r) => r.value != null).length;
  $('steps-caption').textContent = withData ? `Average ${num(total / withData)} per day · ${num(total)} total` : '';
  const goal = rows.length ? rows[rows.length - 1].goal : null;
  chart(() => barChart($('steps-chart'), { data: rows, goal, yFormat: (v) => (v >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)}k` : num(v)), label: 'Daily steps' }));
}

function renderWeight(w) {
  const list = w?.dateWeightList || [];
  const pts = list.map((e) => ({ x: new Date(e.date ?? `${e.calendarDate}T12:00:00`), y: e.weight }));
  pts.sort((a, b) => a.x - b.x);
  const last = list.length ? list.reduce((a, b) => ((a.date ?? 0) > (b.date ?? 0) ? a : b)) : null;
  $('weight-caption').textContent = last ? `Latest ${weight(last.weight)}${last.bmi ? ` · BMI ${num(last.bmi, 1)}` : ''}${last.bodyFat ? ` · ${num(last.bodyFat, 1)}% fat` : ''}` : '';
  chart(() => lineChart($('weight-chart'), {
    points: pts,
    color: 'var(--series-3)',
    yFormat: (g) => weight(g),
    xFormat: (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    label: 'Weight trend',
  }));
}

function renderActivities(list) {
  if (!list?.length) { $('activities').innerHTML = '<tr><td class="empty">No activities</td></tr>'; return; }
  $('activities').innerHTML = `<thead><tr><th>Date</th><th>Activity</th><th>Type</th><th class="num">Distance</th><th class="num">Time</th><th class="num">Avg HR</th><th class="num">Calories</th><th class="num">Ascent</th></tr></thead><tbody>${list.map((a) => `
    <tr>
      <td>${esc(a.startTimeLocal ? new Date(a.startTimeLocal.replace(' ', 'T')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—')}</td>
      <td><a href="https://connect.garmin.com/modern/activity/${encodeURIComponent(a.activityId)}" target="_blank" rel="noopener">${esc(a.activityName || 'Activity')}</a></td>
      <td>${esc(titleCase(a.activityType?.typeKey))}</td>
      <td class="num">${a.distance ? dist(a.distance) : '—'}</td>
      <td class="num">${dur(a.duration)}</td>
      <td class="num">${a.averageHR ? `${Math.round(a.averageHR)} bpm` : '—'}</td>
      <td class="num">${num(a.calories)}</td>
      <td class="num">${a.elevationGain ? elev(a.elevationGain) : '—'}</td>
    </tr>`).join('')}</tbody>`;
}

// Garmin personal-record type ids (seconds for times, meters for distances).
const PR_TYPES = {
  1: ['Fastest 1 km', 'time'], 2: ['Fastest mile', 'time'], 3: ['Fastest 5 km', 'time'], 4: ['Fastest 10 km', 'time'],
  5: ['Fastest half marathon', 'time'], 6: ['Fastest marathon', 'time'], 7: ['Longest run', 'dist'], 8: ['Longest ride', 'dist'],
  9: ['Most ascent (ride)', 'elev'], 10: ['Best 20 min power', 'power'], 11: ['Fastest 40 km ride', 'time'],
  12: ['Most steps in a day', 'count'], 13: ['Most steps in a week', 'count'], 14: ['Most steps in a month', 'count'],
  15: ['Longest goal streak', 'days'], 16: ['Current goal streak', 'days'], 17: ['Longest swim', 'dist'],
};

function renderRecords(prs) {
  if (!prs?.length) { $('records').innerHTML = '<tr><td class="empty">No personal records</td></tr>'; return; }
  const fmt = { time: dur, dist, elev, power: (v) => `${num(v)} W`, count: num, days: (v) => `${num(v)} days` };
  const rows = [...prs].sort((a, b) => a.typeId - b.typeId);
  $('records').innerHTML = `<thead><tr><th>Record</th><th class="num">Value</th><th>Activity</th><th>Date</th></tr></thead><tbody>${rows.map((p) => {
    const [label, kind] = PR_TYPES[p.typeId] || [`Record #${p.typeId}`, 'count'];
    const when = p.actStartDateTimeInGMTFormatted || p.prStartTimeGmtFormatted;
    return `<tr><td>${esc(label)}</td><td class="num">${esc(fmt[kind](p.value))}</td><td>${esc(p.activityName || '—')}</td><td>${esc(when ? new Date(when).toLocaleDateString() : '—')}</td></tr>`;
  }).join('')}</tbody>`;
}

function renderDevices(devices) {
  if (!devices?.length) { $('devices').innerHTML = '<li class="empty">No devices</li>'; return; }
  $('devices').innerHTML = devices.map((d) => {
    const name = d.productDisplayName || d.displayName || d.deviceTypeName || 'Device';
    const img = d.imageUrl || d.thumbnailUrl;
    const detail = [d.partNumber, d.currentFirmwareVersion && `Firmware ${d.currentFirmwareVersion}`, d.primaryActivityTrackerIndicator && 'Primary tracker'].filter(Boolean).join(' · ');
    return `<li>${img ? `<img src="${esc(img)}" alt="">` : ''}<div><b>${esc(name)}</b><span>${esc(detail)}</span></div></li>`;
  }).join('');
}

function renderRaw() {
  $('raw').innerHTML = [...raw.entries()].map(([label, r]) => `
    <details>
      <summary>${esc(label)} <span class="status ${r.ok ? '' : 'err'}">${r.ok ? 'OK' : `failed${r.status ? ` (${r.status})` : ''}`}</span></summary>
      <p class="hint"><code>GET /${esc(r.path)}</code></p>
      <pre>${esc(JSON.stringify(r.data, null, 2))}</pre>
    </details>`).join('');
}

// ---------- load ----------

async function load() {
  const day = $('day').value;
  const range = Number($('range').value);
  const start = addDays(day, -(range - 1));
  raw.clear();
  rerenders = [];
  banner('');
  $('refresh').disabled = true;
  $('refresh').textContent = 'Loading…';

  try {
    const [social, settings] = await Promise.all([
      settle(api('Social profile', 'userprofile-service/socialProfile')),
      settle(api('User settings', 'userprofile-service/userprofile/user-settings')),
    ]);
    if (!social?.displayName) {
      const first = [...raw.values()][0]?.data;
      const status = [...raw.values()][0]?.status;
      banner(`<strong>Could not load your profile.</strong> ${esc(first?.error || 'Unknown error')}${status === 401 || status === 403 ? ' — the token may be invalid or expired. Update GARMIN_TOKEN in .env and restart the server.' : ''}`);
      renderRaw();
      return;
    }
    renderProfile(social, settings);
    const user = encodeURIComponent(social.displayName);

    // Steps stats are limited to 28 days per request.
    const stepChunks = [];
    for (let s = start; s <= day; s = addDays(s, 28)) {
      const e = addDays(s, 27) < day ? addDays(s, 27) : day;
      stepChunks.push(settle(api(`Daily steps ${s} → ${e}`, `usersummary-service/stats/steps/daily/${s}/${e}`)));
    }

    const [summary, hr, stress, sleep, hrv, readiness, vo2, weightRange, activities, devices, prs, ...steps] = await Promise.all([
      settle(api('Daily summary', `usersummary-service/usersummary/daily/${user}?calendarDate=${day}`)),
      settle(api('Heart rate', `wellness-service/wellness/dailyHeartRate/${user}?date=${day}`)),
      settle(api('Stress & Body Battery', `wellness-service/wellness/dailyStress/${day}`)),
      settle(api('Sleep', `wellness-service/wellness/dailySleepData/${user}?date=${day}&nonSleepBufferMinutes=60`)),
      settle(api('HRV', `hrv-service/hrv/${day}`)),
      settle(api('Training readiness', `metrics-service/metrics/trainingreadiness/${day}`)),
      settle(api('VO₂ max', `metrics-service/metrics/maxmet/daily/${start}/${day}`)),
      settle(api('Weight', `weight-service/weight/dateRange?startDate=${start}&endDate=${day}`)),
      settle(api('Activities', 'activitylist-service/activities/search/activities?start=0&limit=20')),
      settle(api('Devices', 'device-service/deviceregistration/devices')),
      settle(api('Personal records', `personalrecord-service/personalRecord/prs/${user}`)),
      ...stepChunks,
    ]);

    renderSummary(summary);
    renderHeartRate(hr);
    renderStress(stress);
    const sleepDto = renderSleep(sleep);
    renderRecovery(sleepDto, hrv, readiness, vo2);
    renderSteps(steps.flat().filter(Boolean));
    renderWeight(weightRange);
    renderActivities(activities);
    renderRecords(prs);
    renderDevices(devices);

    const failed = [...raw.entries()].filter(([, r]) => !r.ok).map(([k]) => k);
    if (failed.length) banner(`Some data could not be loaded: ${esc(failed.join(', '))}. Details are under “All data”.`);
  } finally {
    renderRaw();
    $('refresh').disabled = false;
    $('refresh').textContent = 'Refresh';
  }
}

// ---------- wiring ----------

$('refresh').addEventListener('click', load);
$('day').addEventListener('change', load);
$('range').addEventListener('change', load);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => rerenders.forEach((fn) => fn()), 150);
});

$('day').value = isoDay(new Date());
$('day').max = isoDay(new Date());
load();
