/**
 * WellnessHub — Main Application
 */
(function () {
  const { getUser, getToken, clearSession, isAuthenticated, apiFetch } = window.WellnessAPI;

  const WATER_GOAL = 2000;
  const EXERCISE_GOAL = 60;
  const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Great' };

  function getNavItems() {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
      { id: 'track', label: 'Tracking', icon: 'fa-heart-pulse' },
      { id: 'reminders', label: 'Reminders', icon: 'fa-bell' },
      { id: 'reports', label: 'Reports', icon: 'fa-chart-pie' },
      { id: 'profile', label: 'Profile', icon: 'fa-user' }
    ];
    if (getUser()?.role === 'admin') {
      items.push({ id: 'admin', label: 'Admin', icon: 'fa-screwdriver-wrench' });
    }
    return items;
  }

  let progressChart = null;
  let chatHistory = [];
  let selectedMood = null;
  let selectedStress = null;

  // Alarm & Sound Alert state variables
  let alarmInterval = null;
  let audioCtx = null;
  let currentActiveAlarm = null;
  let snoozedAlarms = [];

  let state = {
    wellness: [],
    moods: [],
    meals: [],
    reminders: [],
    report: null,
    profile: null
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (isAuthenticated()) {
      showApp();
    } else {
      showLanding();
    }
  }

  function showLanding() {
    document.getElementById('landingView')?.classList.remove('hidden');
    document.getElementById('appView')?.classList.add('hidden');
  }

  function showApp() {
    document.getElementById('landingView')?.classList.add('hidden');
    document.getElementById('appView')?.classList.remove('hidden');
    document.body.classList.add('dashboard-body');

    buildNavigation();
    bindEvents();
    loadAllData();
    loadBroadcast();
    checkReminders();
    setInterval(checkReminders, 60000);
  }

  function buildNavigation() {
    const desktop = document.getElementById('desktopNavLinks');
    const mobile = document.getElementById('mobileNavLinks');
    const bottomNav = document.getElementById('bottomNav');

    desktop.innerHTML = '';
    mobile.innerHTML = '';

    const items = getNavItems();
    items.forEach((item) => {
      const desktopLink = document.createElement('button');
      desktopLink.type = 'button';
      desktopLink.className = 'nav-link px-3' + (item.id === 'dashboard' ? ' active' : '');
      desktopLink.dataset.section = item.id;
      desktopLink.innerHTML = `<i class="fa-solid ${item.icon} me-1"></i> ${item.label}`;
      desktop.appendChild(desktopLink);

      const mobileLink = document.createElement('button');
      mobileLink.type = 'button';
      mobileLink.className = 'mobile-nav-link' + (item.id === 'dashboard' ? ' active' : '');
      mobileLink.dataset.section = item.id;
      mobileLink.innerHTML = `<i class="fa-solid ${item.icon} me-2"></i>${item.label}`;
      mobileLink.setAttribute('data-bs-dismiss', 'offcanvas');
      mobile.appendChild(mobileLink);
    });

    // Dynamic Admin button in bottom mobile nav
    if (getUser()?.role === 'admin' && bottomNav && !bottomNav.querySelector('[data-section="admin"]')) {
      const adminBtn = document.createElement('button');
      adminBtn.type = 'button';
      adminBtn.className = 'bottom-nav-item';
      adminBtn.dataset.section = 'admin';
      adminBtn.innerHTML = `<i class="fa-solid fa-screwdriver-wrench"></i><span>Admin</span>`;
      bottomNav.appendChild(adminBtn);
    }
  }

  function bindEvents() {
    const bottomNav = document.getElementById('bottomNav');
    
    // Bind all navigation triggers (using delegated click actions where needed)
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-section]');
      if (trigger) {
        navigateTo(trigger.dataset.section);
      }
    });

    ['desktopLogoutBtn', 'mobileLogoutBtn', 'profileLogoutBtn'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', logout);
    });

    document.getElementById('quickWaterBtn')?.addEventListener('click', () => logWater(250));
    document.querySelectorAll('.log-water-btn').forEach((btn) => {
      btn.addEventListener('click', () => logWater(Number(btn.dataset.ml)));
    });

    document.getElementById('saveExerciseBtn')?.addEventListener('click', saveExercise);
    document.getElementById('saveSleepBtn')?.addEventListener('click', saveSleep);
    document.getElementById('saveMoodBtn')?.addEventListener('click', saveMood);
    document.getElementById('saveMealBtn')?.addEventListener('click', saveMeal);
    document.getElementById('saveReminderBtn')?.addEventListener('click', saveReminder);

    setupScaleButtons('moodScale', (v) => { selectedMood = v; });
    setupScaleButtons('stressScale', (v) => { selectedStress = v; });

    document.getElementById('ai-chat-btn')?.addEventListener('click', openChat);
    document.getElementById('chatCloseBtn')?.addEventListener('click', closeChat);
    document.getElementById('chatOverlay')?.addEventListener('click', closeChat);
    document.getElementById('chatForm')?.addEventListener('submit', handleChatSubmit);

    // Admin & Broadcast Events
    document.getElementById('adminBroadcastBtn')?.addEventListener('click', handleBroadcastSubmit);
    document.getElementById('adminClearBroadcastBtn')?.addEventListener('click', handleClearBroadcast);
    document.getElementById('closeBroadcastBtn')?.addEventListener('click', () => {
      document.getElementById('broadcastBanner')?.classList.add('d-none');
    });

    // Alarm Action Events
    document.getElementById('btnTestAlarmSound')?.addEventListener('click', playSingleTestChime);
    document.getElementById('btnDismissAlarm')?.addEventListener('click', dismissAlarm);
    document.getElementById('btnSnoozeAlarm')?.addEventListener('click', snoozeAlarm);

    // Reports Action Events
    document.getElementById('btnDownloadPDFReport')?.addEventListener('click', downloadPDFReport);
  }

  function setupScaleButtons(containerId, onSelect) {
    document.querySelectorAll(`#${containerId} .mood-scale-btn`).forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`#${containerId} .mood-scale-btn`).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        onSelect(Number(btn.dataset.value));
      });
    });
  }

  function navigateTo(section) {
    document.querySelectorAll('.app-section').forEach((s) => s.classList.remove('active'));
    document.getElementById(`section-${section}`)?.classList.add('active');

    document.querySelectorAll('[data-section]').forEach((el) => {
      el.classList.toggle('active', el.dataset.section === section);
    });

    const titles = { dashboard: 'Dashboard', track: 'Tracking', reminders: 'Reminders', reports: 'Reports', profile: 'Profile', admin: 'Admin Console' };
    const titleEl = document.getElementById('mobileSectionTitle');
    if (titleEl) titleEl.textContent = titles[section] || 'WellnessHub';

    if (section === 'reports') loadReport();
    if (section === 'profile') loadProfile();
    if (section === 'admin') loadAdminConsole();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function userId() {
    return getUser()?.id;
  }

  async function loadAllData() {
    const uid = userId();
    if (!uid) return logout();

    try {
      const [wellness, moods, meals, reminders] = await Promise.all([
        apiFetch(`/api/wellness/${uid}`),
        apiFetch(`/api/mood/${uid}`),
        apiFetch(`/api/meals/${uid}`),
        apiFetch(`/api/reminders/${uid}`)
      ]);

      state.wellness = wellness;
      state.moods = moods;
      state.meals = meals;
      state.reminders = reminders;

      updateDashboard();
      updateTracking();
      renderMeals();
      renderReminders();
      updateChart();
    } catch (error) {
      if (error.status === 401) {
        logout();
      } else {
        showToast(error.message, 'error');
      }
    }
  }

  function todayLog() {
    const today = new Date().toISOString().split('T')[0];
    return state.wellness.find((l) => {
      const d = typeof l.log_date === 'string' ? l.log_date.split('T')[0] : l.log_date;
      return d === today;
    }) || { water_ml: 0, sleep_hours: 0, exercise_min: 0 };
  }

  function latestMood() {
    return state.moods[0] || null;
  }

  function calculateScore(log, mood) {
    let score = 0;
    const waterPct = Math.min((log.water_ml || 0) / WATER_GOAL, 1);
    const exercisePct = Math.min((log.exercise_min || 0) / EXERCISE_GOAL, 1);
    const sleepPct = log.sleep_hours ? Math.min(log.sleep_hours / 8, 1) : 0;
    const moodPct = mood ? mood.mood_level / 5 : 0.5;
    const stressPct = mood ? 1 - (mood.stress_level - 1) / 4 : 0.5;

    score = (waterPct * 20) + (exercisePct * 20) + (sleepPct * 20) + (moodPct * 25) + (stressPct * 15);
    return Math.round(score);
  }

  function updateDashboard() {
    const user = getUser();
    const log = todayLog();
    const mood = latestMood();
    const score = calculateScore(log, mood);

    setText('user-name', user?.username || 'Friend');
    setText('wellnessScore', score);
    setText('scoreMessage', scoreMessage(score));

    const circle = document.getElementById('scoreCircle');
    if (circle) circle.style.setProperty('--score-pct', score);

    const water = log.water_ml || 0;
    setText('dashWater', `${water.toLocaleString()} `);
    updateProgress('waterProgress', 'waterProgressBar', water, WATER_GOAL);

    setText('dashExercise', `${log.exercise_min || 0} `);
    setText('dashSleep', log.sleep_hours ? `${log.sleep_hours} ` : '— ');
    setText('dashMood', mood ? MOOD_LABELS[mood.mood_level] || '—' : '—');

    setText('profileScore', score);
  }

  function updateTracking() {
    const log = todayLog();
    const mood = latestMood();

    setText('trackWater', `${(log.water_ml || 0).toLocaleString()} ml`);
    setText('trackSleep', log.sleep_hours ? `${log.sleep_hours} hrs` : '— hrs');
    setText('trackExercise', `${log.exercise_min || 0} min`);
    setText('trackMood', mood ? MOOD_LABELS[mood.mood_level] : '—');
    setText('trackStress', mood ? `${mood.stress_level}/5` : '—');
  }

  function scoreMessage(score) {
    if (score >= 85) return "Outstanding! You're crushing your wellness goals.";
    if (score >= 70) return "Great progress — keep building healthy habits.";
    if (score >= 50) return "Good start — a few more logs will boost your score.";
    return 'Log your activities to build your wellness score.';
  }

  function updateProgress(containerId, barId, value, max) {
    const pct = Math.min(Math.round((value / max) * 100), 100);
    const container = document.getElementById(containerId);
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = `${pct}%`;
    if (container) container.setAttribute('aria-valuenow', value);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'dashWater' || id === 'dashExercise' || id === 'dashSleep') {
      el.innerHTML = `${text}<small class="text-muted fs-6">${id.includes('Water') ? 'ml' : id.includes('Exercise') ? 'min' : 'hrs'}</small>`;
    } else {
      el.textContent = text;
    }
  }

  async function logWater(ml) {
    try {
      await apiFetch('/api/log', {
        method: 'POST',
        body: JSON.stringify({ userId: userId(), water_ml: ml })
      });
      showToast(`+${ml}ml logged!`, 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function saveExercise() {
    const duration = Number(document.getElementById('exerciseDuration')?.value);
    if (!duration || duration < 1) {
      showToast('Enter a valid duration.', 'error');
      return;
    }
    try {
      await apiFetch('/api/log', {
        method: 'POST',
        body: JSON.stringify({ userId: userId(), exercise_min: duration })
      });
      bootstrap.Modal.getInstance(document.getElementById('exerciseModal'))?.hide();
      document.getElementById('exerciseDuration').value = '';
      showToast('Exercise logged!', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function saveSleep() {
    const hours = Number(document.getElementById('sleepHours')?.value);
    if (!hours || hours <= 0) {
      showToast('Enter valid sleep hours.', 'error');
      return;
    }
    try {
      await apiFetch('/api/log', {
        method: 'POST',
        body: JSON.stringify({ userId: userId(), sleep_hours: hours })
      });
      bootstrap.Modal.getInstance(document.getElementById('sleepModal'))?.hide();
      document.getElementById('sleepHours').value = '';
      showToast('Sleep logged!', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function saveMood() {
    if (!selectedMood || !selectedStress) {
      showToast('Select both mood and stress levels.', 'error');
      return;
    }
    try {
      await apiFetch('/api/mood', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId(),
          mood_level: selectedMood,
          stress_level: selectedStress,
          note: document.getElementById('moodNote')?.value || null
        })
      });
      bootstrap.Modal.getInstance(document.getElementById('moodModal'))?.hide();
      selectedMood = null;
      selectedStress = null;
      document.querySelectorAll('.mood-scale-btn').forEach((b) => b.classList.remove('selected'));
      document.getElementById('moodNote').value = '';
      showToast('Mood & stress logged!', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function saveMeal() {
    const description = document.getElementById('mealDescription')?.value?.trim();
    if (!description) {
      showToast('Enter a meal description.', 'error');
      return;
    }
    try {
      await apiFetch('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId(),
          meal_type: document.getElementById('mealType')?.value,
          description,
          calories: Number(document.getElementById('mealCalories')?.value) || 0
        })
      });
      bootstrap.Modal.getInstance(document.getElementById('mealModal'))?.hide();
      document.getElementById('mealDescription').value = '';
      document.getElementById('mealCalories').value = '';
      showToast('Meal logged!', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function renderMeals() {
    const container = document.getElementById('mealsList');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const todayMeals = state.meals.filter((m) => {
      const d = typeof m.log_date === 'string' ? m.log_date.split('T')[0] : m.log_date;
      return d === today;
    });

    if (todayMeals.length === 0) {
      container.innerHTML = '<p class="small text-muted mb-0">No meals logged today.</p>';
      return;
    }

    container.innerHTML = todayMeals.map((m) => `
      <div class="meal-item">
        <div><span class="badge bg-teal-soft text-teal me-1 text-capitalize">${m.meal_type}</span>${escapeHtml(m.description)}</div>
        <span class="small fw-bold text-muted">${m.calories || 0} cal</span>
      </div>
    `).join('');
  }

  async function saveReminder() {
    const title = document.getElementById('reminderTitle')?.value?.trim();
    const time = document.getElementById('reminderTime')?.value;
    if (!title || !time) {
      showToast('Fill in all reminder fields.', 'error');
      return;
    }
    try {
      await apiFetch('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId(),
          title,
          reminder_time: time,
          reminder_type: document.getElementById('reminderType')?.value
        })
      });
      bootstrap.Modal.getInstance(document.getElementById('reminderModal'))?.hide();
      document.getElementById('reminderTitle').value = '';
      document.getElementById('reminderTime').value = '';
      showToast('Reminder created!', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function renderReminders() {
    const container = document.getElementById('remindersList');
    if (!container) return;

    if (state.reminders.length === 0) {
      container.innerHTML = `<div class="empty-state glass-card"><i class="fa-solid fa-bell"></i><p class="mb-0">No reminders yet. Add one to stay on track.</p></div>`;
      return;
    }

    container.innerHTML = state.reminders.map((r) => {
      const time = formatTime(r.reminder_time);
      const active = r.is_active !== 0 && r.is_active !== false;
      return `
        <div class="reminder-item ${active ? '' : 'inactive'}" data-id="${r.id}">
          <div class="reminder-time-badge">${time}</div>
          <div class="flex-grow-1">
            <div class="fw-bold">${escapeHtml(r.title)}</div>
            <span class="reminder-type-badge">${r.reminder_type}</span>
          </div>
          <div class="d-flex gap-1">
            <button type="button" class="btn btn-sm btn-outline-teal toggle-reminder" data-id="${r.id}" data-active="${active}" aria-label="Toggle reminder">${active ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'}</button>
            <button type="button" class="btn btn-sm btn-outline-danger delete-reminder" data-id="${r.id}" aria-label="Delete reminder"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.toggle-reminder').forEach((btn) => {
      btn.addEventListener('click', () => toggleReminder(btn.dataset.id, btn.dataset.active === 'true'));
    });
    container.querySelectorAll('.delete-reminder').forEach((btn) => {
      btn.addEventListener('click', () => deleteReminder(btn.dataset.id));
    });
  }

  async function toggleReminder(id, currentlyActive) {
    try {
      await apiFetch(`/api/reminders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !currentlyActive })
      });
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function deleteReminder(id) {
    if (!confirm('Delete this reminder?')) return;
    try {
      await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });
      showToast('Reminder deleted.', 'success');
      await loadAllData();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function playAlarmSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (alarmInterval) {
        clearInterval(alarmInterval);
      }

      const playBeep = () => {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        
        let osc1 = audioCtx.createOscillator();
        let gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gain1.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start();
        osc1.stop(audioCtx.currentTime + 0.4);

        setTimeout(() => {
          if (!audioCtx || audioCtx.state === 'suspended') return;
          let osc2 = audioCtx.createOscillator();
          let gain2 = audioCtx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6 note
          gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start();
          osc2.stop(audioCtx.currentTime + 0.4);
        }, 150);
      };

      playBeep();
      alarmInterval = setInterval(playBeep, 1500);
    } catch (e) {
      console.warn('AudioContext failed to start:', e);
    }
  }

  function stopAlarmSound() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  function playSingleTestChime() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      let osc = audioCtx.createOscillator();
      let gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6 bell tone
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1.2);
      showToast('Sound tested successfully! 🔔', 'success');
    } catch (e) {
      console.warn('AudioContext failed:', e);
      showToast('Click anywhere on the page first to allow audio.', 'error');
    }
  }

  function triggerAlarm(r) {
    currentActiveAlarm = r;
    playAlarmSound();

    const titleEl = document.getElementById('alarmModalTitle');
    const typeEl = document.getElementById('alarmModalType');
    const bodyEl = document.getElementById('alarmModalBody');

    if (titleEl) titleEl.textContent = r.title || 'Wellness Alert';
    if (typeEl) {
      typeEl.textContent = r.reminder_type || 'General';
    }
    if (bodyEl) bodyEl.textContent = `It is time for your scheduled ${r.reminder_type || 'activity'}: "${r.title}"`;

    const modalEl = document.getElementById('alarmTriggerModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  function dismissAlarm() {
    stopAlarmSound();
    const modalEl = document.getElementById('alarmTriggerModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
    currentActiveAlarm = null;
    showToast('Alarm dismissed', 'success');
  }

  function snoozeAlarm() {
    if (!currentActiveAlarm) return;
    
    stopAlarmSound();
    const modalEl = document.getElementById('alarmTriggerModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    const snoozeTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes in future
    snoozedAlarms.push({
      id: currentActiveAlarm.id,
      title: currentActiveAlarm.title,
      reminder_type: currentActiveAlarm.reminder_type || 'activity',
      triggerAt: snoozeTime
    });

    showToast(`Alarm snoozed for 5 minutes.`, 'success');
    currentActiveAlarm = null;
  }

  function checkReminders() {
    if (!isAuthenticated()) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1. Check persistent reminders
    if (state.reminders && state.reminders.length) {
      state.reminders.forEach((r) => {
        if (r.is_active === 0 || r.is_active === false) return;
        const time = typeof r.reminder_time === 'string' ? r.reminder_time.slice(0, 5) : formatTime(r.reminder_time);
        const key = `reminder_shown_${r.id}_${now.toDateString()}_${time}`;
        if (time === currentTime && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          
          triggerAlarm(r);

          showToast(`Reminder: ${r.title}`, 'success');
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('WellnessHub Reminder', { body: r.title });
          }
        }
      });
    }

    // 2. Check snoozed alarms
    const remainingSnoozed = [];
    snoozedAlarms.forEach((s) => {
      if (now >= s.triggerAt) {
        triggerAlarm({
          id: s.id,
          title: s.title,
          reminder_type: s.reminder_type
        });
      } else {
        remainingSnoozed.push(s);
      }
    });
    snoozedAlarms = remainingSnoozed;
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  async function loadReport() {
    try {
      const report = await apiFetch(`/api/report/${userId()}`);
      state.report = report;
      setReportValue('reportWater', report.avg_water, (v) => Math.round(v));
      setReportValue('reportSleep', report.avg_sleep, (v) => Number(v).toFixed(1));
      setReportValue('reportExercise', report.avg_exercise, (v) => Math.round(v));
      setReportValue('reportMood', report.avg_mood, (v) => Number(v).toFixed(1));
      setReportValue('reportStress', report.avg_stress, (v) => Number(v).toFixed(1));
      setReportValue('reportCalories', report.total_calories, (v) => Math.round(v));

      // Fetch specific logs counts for the reports preview card
      const waterSleepLogs = state.wellness || [];
      const moodLogs = state.moods || [];
      const meals = state.meals || [];

      const wSleepPreview = document.getElementById('reportWaterSleepCount');
      if (wSleepPreview) {
        wSleepPreview.innerHTML = `<strong>${waterSleepLogs.length} records</strong> containing water intake, sleep cycles, and training metrics.`;
      }
      const moodPreview = document.getElementById('reportMoodStressCount');
      if (moodPreview) {
        moodPreview.innerHTML = `<strong>${moodLogs.length} logs</strong> tracing mood ratings, daily stress triggers, and notes.`;
      }
      const mealsPreview = document.getElementById('reportMealsCount');
      if (mealsPreview) {
        mealsPreview.innerHTML = `<strong>${meals.length} meals</strong> registered with total caloric breakdown.`;
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function downloadPDFReport() {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        throw new Error('PDF Generation Library is still loading. Please try again.');
      }

      // Ensure profile data is loaded
      if (!state.profile) {
        await loadProfile();
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      let y = 15;

      // 1. BRAND HEADER BANNER (Wellness Teal Accent)
      doc.setFillColor(13, 148, 136); 
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('WellnessHub Health Report', 15, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Your Personal 7-Day Wellness & Health Record', 15, 28);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 28, { align: 'right' });

      y = 52;

      // 2. USER DETAILS (Left Column) & SUMMARY STATS (Right Column)
      doc.setTextColor(15, 23, 42); // Dark slate
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('User Profile Details', 15, y);
      
      doc.setDrawColor(226, 232, 240); // Slate soft border
      doc.setLineWidth(0.5);
      doc.line(15, y + 2, 95, y + 2);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Username: ${state.profile?.username || 'User'}`, 15, y + 8);
      doc.text(`Email Address: ${state.profile?.email || 'N/A'}`, 15, y + 14);
      const joinedDate = state.profile?.created_at ? new Date(state.profile.created_at).toLocaleDateString() : 'N/A';
      doc.text(`Member Since: ${joinedDate}`, 15, y + 20);

      // Averages Box (Right side)
      doc.setFillColor(248, 250, 252); // soft slate bg
      doc.rect(110, y - 5, pageWidth - 125, 33, 'F');
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(1.5);
      doc.line(110, y - 5, 110, y + 28); // left thick teal line

      doc.setTextColor(13, 148, 136);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('7-DAY WELLNESS AVERAGES', 115, y);

      doc.setTextColor(71, 85, 105);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      
      const avgWater = state.report?.avg_water ? `${Math.round(state.report.avg_water)} ml` : 'N/A';
      const avgSleep = state.report?.avg_sleep ? `${Number(state.report.avg_sleep).toFixed(1)} hrs` : 'N/A';
      const avgExercise = state.report?.avg_exercise ? `${Math.round(state.report.avg_exercise)} mins` : 'N/A';
      const avgMood = state.report?.avg_mood ? `${Number(state.report.avg_mood).toFixed(1)}/5` : 'N/A';
      const avgStress = state.report?.avg_stress ? `${Number(state.report.avg_stress).toFixed(1)}/5` : 'N/A';
      const totalCal = state.report?.total_calories ? `${Math.round(state.report.total_calories)} cal` : '0 cal';

      doc.text(`• Avg Water: ${avgWater}`, 115, y + 6);
      doc.text(`• Avg Sleep: ${avgSleep}`, 115, y + 11);
      doc.text(`• Avg Exercise: ${avgExercise}`, 115, y + 16);
      doc.text(`• Avg Mood: ${avgMood} | Stress: ${avgStress}`, 115, y + 21);
      doc.text(`• Calories Consumed: ${totalCal}`, 115, y + 26);

      y = 90;

      // Section Separator Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);

      y += 10;

      // HELPER: Add Page check
      function checkPageOverflow(heightNeeded) {
        if (y + heightNeeded > pageHeight - 15) {
          doc.addPage();
          y = 20;
          // Subpage simple header
          doc.setFillColor(13, 148, 136);
          doc.rect(0, 0, pageWidth, 10, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.text('WellnessHub Health Report (Continued)', 15, 6);
          y = 25;
        }
      }

      // 3. TABLE 1: DAILY WELLNESS LOGS (Last 7 Days)
      checkPageOverflow(35);
      doc.setTextColor(15, 23, 42);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. Hydration, Sleep & Physical Exercise Logs', 15, y);
      y += 4;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, pageWidth - 30, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Date', 20, y + 5);
      doc.text('Water Intake (ml)', 60, y + 5);
      doc.text('Sleep Duration (hrs)', 110, y + 5);
      doc.text('Physical Exercise (mins)', 155, y + 5);
      y += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      
      const wellnessLogs = state.wellness || [];
      if (wellnessLogs.length === 0) {
        doc.text('No hydration or sleep logs recorded in this period.', 20, y + 5);
        y += 8;
      } else {
        wellnessLogs.forEach((log) => {
          checkPageOverflow(8);
          const logDate = log.log_date ? new Date(log.log_date).toLocaleDateString() : 'N/A';
          doc.text(logDate, 20, y + 5);
          doc.text(`${log.water_ml || 0} ml`, 60, y + 5);
          doc.text(`${log.sleep_hours || 0} hrs`, 110, y + 5);
          doc.text(`${log.exercise_min || 0} mins`, 155, y + 5);
          
          // Row separator
          doc.setDrawColor(241, 245, 249);
          doc.line(15, y + 7, pageWidth - 15, y + 7);
          y += 8;
        });
      }

      y += 5;

      // 4. TABLE 2: MOOD & STRESS OBSERVATIONS
      checkPageOverflow(35);
      doc.setTextColor(15, 23, 42);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. Mood Ratings & Mental Health Logs', 15, y);
      y += 4;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, pageWidth - 30, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Date', 20, y + 5);
      doc.text('Mood Rating', 60, y + 5);
      doc.text('Stress Level', 110, y + 5);
      doc.text('Personal Note / Context', 150, y + 5);
      y += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);

      const moodLogs = state.moods || [];
      if (moodLogs.length === 0) {
        doc.text('No mood or mental state logs recorded in this period.', 20, y + 5);
        y += 8;
      } else {
        moodLogs.forEach((log) => {
          checkPageOverflow(8);
          const logDate = log.log_date ? new Date(log.log_date).toLocaleDateString() : 'N/A';
          doc.text(logDate, 20, y + 5);
          doc.text(`${log.mood_level || 0} / 5`, 60, y + 5);
          doc.text(`${log.stress_level || 0} / 5`, 110, y + 5);
          
          const noteText = log.note ? log.note.substring(0, 30) + (log.note.length > 30 ? '...' : '') : 'None';
          doc.text(noteText, 150, y + 5);
          
          // Row separator
          doc.setDrawColor(241, 245, 249);
          doc.line(15, y + 7, pageWidth - 15, y + 7);
          y += 8;
        });
      }

      y += 5;

      // 5. TABLE 3: DIET & NUTRITIONAL LOGS
      checkPageOverflow(35);
      doc.setTextColor(15, 23, 42);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('3. Diet, Nutrition & Calories Records', 15, y);
      y += 4;

      // Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, pageWidth - 30, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Date', 20, y + 5);
      doc.text('Meal Category', 60, y + 5);
      doc.text('Description', 110, y + 5);
      doc.text('Calorie Value', 160, y + 5);
      y += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);

      const mealLogs = state.meals || [];
      if (mealLogs.length === 0) {
        doc.text('No nutritional or meal logs recorded in this period.', 20, y + 5);
        y += 8;
      } else {
        mealLogs.forEach((log) => {
          checkPageOverflow(8);
          const logDate = log.log_date ? new Date(log.log_date).toLocaleDateString() : 'N/A';
          doc.text(logDate, 20, y + 5);
          doc.text(log.meal_type || 'General', 60, y + 5);
          
          const descText = log.description ? log.description.substring(0, 30) + (log.description.length > 30 ? '...' : '') : 'N/A';
          doc.text(descText, 110, y + 5);
          doc.text(`${log.calories || 0} cal`, 160, y + 5);
          
          // Row separator
          doc.setDrawColor(241, 245, 249);
          doc.line(15, y + 7, pageWidth - 15, y + 7);
          y += 8;
        });
      }

      // 6. CLINICAL STATEMENT & DISCLAIMER FOOTER
      checkPageOverflow(30);
      y += 5;
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      y += 6;

      doc.setTextColor(100, 116, 139);
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(7);
      doc.text('Disclaimer: This health record is automatically generated based on user self-tracking. It is for informational and educational purposes only.', 15, y);
      doc.text('Please consult a qualified medical professional, personal physician, or nutritionist before making major lifestyle changes.', 15, y + 4.5);
      doc.text('WellnessHub (c) 2026. Keep moving, stay hydrated, and live healthy!', 15, y + 9);

      // Save PDF file
      doc.save(`WellnessHub_Health_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('Health PDF report downloaded successfully! 📄', 'success');

    } catch (err) {
      console.error('PDF error:', err);
      showToast('Failed to generate PDF: ' + err.message, 'error');
    }
  }

  function setReportValue(id, raw, fmt) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = raw != null && !Number.isNaN(Number(raw)) ? fmt(Number(raw)) : '—';
  }

  async function loadProfile() {
    try {
      const { user } = await apiFetch('/api/auth/me');
      state.profile = user;

      setText('profileUsername', user.username);
      setText('profileEmail', user.email);
      document.getElementById('profileAvatar').textContent = (user.username || 'W')[0].toUpperCase();

      if (user.created_at) {
        const since = new Date(user.created_at);
        setText('profileSince', since.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
        const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86400000));
        setText('profileDays', days);
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function updateChart() {
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;

    const logs = [...state.wellness].reverse().slice(-7);
    const labels = logs.map((l) => {
      const d = new Date(l.log_date);
      return d.toLocaleDateString(undefined, { weekday: 'short' });
    });
    const waterData = logs.map((l) => (l.water_ml || 0) / 1000);
    const exerciseData = logs.map((l) => l.exercise_min || 0);

    if (progressChart) {
      progressChart.data.labels = labels.length ? labels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      progressChart.data.datasets[0].data = waterData.length ? waterData : [0];
      progressChart.data.datasets[1].data = exerciseData.length ? exerciseData : [0];
      progressChart.update();
      return;
    }

    progressChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Water (L)',
            data: waterData.length ? waterData : [0],
            borderColor: '#0d9488',
            backgroundColor: 'rgba(13, 148, 136, 0.12)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Exercise (min)',
            data: exerciseData.length ? exerciseData : [0],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { family: 'Plus Jakarta Sans', weight: '600' } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function openChat() {
    document.getElementById('chatPanel')?.classList.add('open');
    document.getElementById('chatOverlay')?.classList.add('open');
    document.getElementById('chatInput')?.focus();

    const messages = document.getElementById('chatMessages');
    if (messages && messages.children.length === 0) {
      appendChatBubble('bot', "Hi! I'm WellnessBot. Ask me about fitness, nutrition, sleep, or mental wellness. Remember — I'm an AI coach, not a doctor.");
    }
  }

  function closeChat() {
    document.getElementById('chatPanel')?.classList.remove('open');
    document.getElementById('chatOverlay')?.classList.remove('open');
  }

  async function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const message = input?.value?.trim();
    if (!message) return;

    input.value = '';
    appendChatBubble('user', message);

    try {
      const data = await apiFetch('/api/chatbot/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history: chatHistory })
      });
      chatHistory.push({ role: 'user', content: message });
      chatHistory.push({ role: 'assistant', content: data.reply });
      appendChatBubble('bot', data.reply);
    } catch (error) {
      appendChatBubble('bot', "Sorry, I'm having trouble connecting right now. Please try again later.");
    }
  }

  function appendChatBubble(role, text) {
    const messages = document.getElementById('chatMessages');
    if (!messages) return;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble--${role === 'user' ? 'user' : 'bot'}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function logout() {
    clearSession();
    window.location.href = '/login.html';
  }

  function showToast(message, type = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `app-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatTime(time) {
    if (!time) return '—';
    const str = typeof time === 'string' ? time : String(time);
    const [h, m] = str.split(':');
    const hour = Number(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  async function loadBroadcast() {
    try {
      const broadcast = await apiFetch('/api/broadcasts');
      const banner = document.getElementById('broadcastBanner');
      const text = document.getElementById('broadcastText');
      if (broadcast && broadcast.message) {
        text.textContent = broadcast.message;
        banner.classList.remove('d-none');
      } else {
        banner.classList.add('d-none');
      }
    } catch (error) {
      console.error('Failed to load broadcasts:', error);
    }
  }

  async function loadAdminConsole() {
    try {
      // Fetch platform statistics
      const stats = await apiFetch('/api/admin/stats');
      document.getElementById('adminStatUsers').textContent = stats.total_users || 0;
      document.getElementById('adminStatLogs').textContent = stats.total_logs || 0;
      document.getElementById('adminStatMeals').textContent = stats.total_meals || 0;
      document.getElementById('adminStatReminders').textContent = stats.total_reminders || 0;

      document.getElementById('adminAvgWater').textContent = `${Math.round(stats.avg_water || 0)} ml`;
      document.getElementById('adminAvgSleep').textContent = `${Number(stats.avg_sleep || 0).toFixed(1)} hrs`;
      document.getElementById('adminAvgExercise').textContent = `${Math.round(stats.avg_exercise || 0)} min`;

      // Fetch active announcement to populate input
      const broadcast = await apiFetch('/api/broadcasts');
      if (broadcast && broadcast.message) {
        document.getElementById('adminBroadcastInput').value = broadcast.message;
      } else {
        document.getElementById('adminBroadcastInput').value = '';
      }

      await loadAdminUsers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersList');
    if (!tbody) return;

    try {
      const users = await apiFetch('/api/admin/users');
      const currentUser = getUser();

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No users registered on the platform.</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(u => {
        const isSelf = u.id === currentUser?.id;
        const joinedDate = new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const roleBadge = u.role === 'admin' 
          ? '<span class="badge bg-teal-soft text-teal text-capitalize">Admin</span>' 
          : '<span class="badge bg-light text-muted text-capitalize">User</span>';

        return `
          <tr>
            <td class="fw-bold text-teal">#${u.id}</td>
            <td>${escapeHtml(u.username)}</td>
            <td class="small text-muted">${escapeHtml(u.email)}</td>
            <td>${roleBadge}</td>
            <td class="small text-muted">${joinedDate}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-outline-teal toggle-user-role-btn" data-id="${u.id}" data-role="${u.role || 'user'}" ${isSelf ? 'disabled' : ''} aria-label="Toggle role">
                  <i class="fa-solid fa-user-shield"></i> Toggle Role
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger delete-user-btn" data-id="${u.id}" ${isSelf ? 'disabled' : ''} aria-label="Delete user">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Bind events
      tbody.querySelectorAll('.toggle-user-role-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleUserRole(btn.dataset.id, btn.dataset.role));
      });

      tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id));
      });

    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Failed to load users: ${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function toggleUserRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole })
      });
      showToast('User role updated!', 'success');
      await loadAdminConsole();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function deleteUser(userId) {
    if (!confirm('Are you absolutely sure you want to delete this user? This will cascade delete all their activity logs, meals, and reminders. This action is irreversible.')) {
      return;
    }
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      showToast('User account and all data deleted.', 'success');
      await loadAdminConsole();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleBroadcastSubmit() {
    const message = document.getElementById('adminBroadcastInput')?.value?.trim();
    if (!message) {
      showToast('Enter an announcement message.', 'error');
      return;
    }
    try {
      await apiFetch('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      showToast('Announcement broadcasted successfully!', 'success');
      await loadBroadcast();
      await loadAdminConsole();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleClearBroadcast() {
    try {
      await apiFetch('/api/admin/broadcast', { method: 'DELETE' });
      showToast('Broadcast cleared.', 'success');
      document.getElementById('adminBroadcastInput').value = '';
      await loadBroadcast();
      await loadAdminConsole();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
