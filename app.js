(function () {
  'use strict';

  const config = window.RBB_CONFIG;
  const TEXTS = window.RBB_TEXTS;
  const { normalizeHandle, isValidHandle, instagramUrl } = window.RBBHandle;

  const STATE_KEY = 'rbb-konkurs-v1';
  const DEMO_KEY = 'rbb-konkurs-demo';
  const LANG_KEY = 'rbb-konkurs-lang';
  const EMPTY_STATE = Object.freeze({ handle: '', opened: [], number: null, existing: false });

  const $ = (selector) => document.querySelector(selector);
  const isDemo = !config.apiUrl;

  // ---------- storage ----------

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // приватний режим Safari — просто працюємо без збереження
    }
  }

  let state = Object.freeze({ ...EMPTY_STATE, ...readJson(STATE_KEY, {}) });
  const browserLang = (navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'uk';
  let lang = readJson(LANG_KEY, null) || browserLang;
  let busy = false;

  function setState(patch) {
    state = Object.freeze({ ...state, ...patch });
    writeJson(STATE_KEY, state);
    render();
  }

  // ---------- i18n ----------

  function t(key, vars) {
    const template = (TEXTS[lang] && TEXTS[lang][key]) || TEXTS.uk[key] || key;
    return Object.entries(vars || {}).reduce((text, [name, value]) => text.replace('{' + name + '}', value), template);
  }

  function applyTexts() {
    document.documentElement.lang = lang === 'pl' ? 'pl' : 'uk';
    document.querySelectorAll('[data-t]').forEach((el) => {
      el.textContent = t(el.dataset.t);
    });
    $('#handle').placeholder = t('handlePlaceholder');
    document.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    });
  }

  // ---------- API ----------

  class ApiError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  async function registerRemote(handle) {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      // text/plain — щоб не було CORS preflight, який Apps Script не підтримує
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ handle, lang }),
    });
    if (!response.ok) throw new ApiError('http_' + response.status);
    const payload = await response.json();
    if (!payload.success) throw new ApiError(payload.error || 'server_error');
    return payload.data;
  }

  function registerDemo(handle) {
    const registry = readJson(DEMO_KEY, {});
    if (registry[handle]) return { number: registry[handle], existing: true };
    const number = Object.keys(registry).length + 1;
    writeJson(DEMO_KEY, { ...registry, [handle]: number });
    return { number, existing: false };
  }

  // ---------- rendering ----------

  function showStep(id) {
    ['step-handle', 'step-follow', 'step-number'].forEach((stepId) => {
      $('#' + stepId).hidden = stepId !== id;
    });
  }

  function buildAccountItem(account) {
    const item = document.createElement('li');
    item.className = 'account' + (account.organizer ? ' is-organizer' : '');
    item.dataset.handle = account.handle;

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = account.handle.replace(/^[._]+/, '').charAt(0);
    const photo = document.createElement('img');
    photo.className = 'avatar-img';
    photo.src = 'avatars/' + encodeURIComponent(account.handle) + '.jpg';
    photo.alt = '';
    photo.width = 40;
    photo.height = 40;
    photo.decoding = 'async';
    // якщо фото не завантажилось — лишається перша літера
    photo.addEventListener('error', () => photo.remove());
    avatar.append(photo);

    const info = document.createElement('span');
    info.className = 'account-info';
    const name = document.createElement('span');
    name.className = 'account-handle';
    name.textContent = '@' + account.handle;
    const role = document.createElement('span');
    role.className = 'account-role';
    role.dataset.t = account.organizer ? 'organizer' : 'partner';
    info.append(name, role);

    const link = document.createElement('a');
    link.className = 'follow';
    link.href = instagramUrl(account.handle);
    link.target = '_blank';
    link.rel = 'noopener';
    link.addEventListener('click', () => markOpened(account.handle));

    item.append(avatar, info, link);
    return item;
  }

  function renderAccounts() {
    const opened = new Set(state.opened);
    document.querySelectorAll('.account').forEach((item) => {
      const done = opened.has(item.dataset.handle);
      item.classList.toggle('is-done', done);
      item.querySelector('.follow').textContent = done ? t('opened') : t('follow');
    });

    const total = config.accounts.length;
    const done = config.accounts.filter((account) => opened.has(account.handle)).length;
    $('#progress-bar').style.width = Math.round((done / total) * 100) + '%';
    $('#progress-text').textContent = t('progress', { done, total });

    const button = $('#get-number');
    const ready = done === total;
    button.disabled = !ready || busy;
    button.textContent = busy ? t('loading') : ready ? t('getNumber') : t('getNumberLocked');
  }

  function render() {
    applyTexts();
    $('#demo').hidden = !isDemo;
    document.querySelectorAll('.who').forEach((el) => {
      el.textContent = state.handle ? '@' + state.handle : '';
    });

    if (state.number) {
      $('#number').textContent = String(state.number);
      $('#already').hidden = !state.existing;
      showStep('step-number');
    } else if (state.handle) {
      renderAccounts();
      showStep('step-follow');
    } else {
      showStep('step-handle');
    }
  }

  // ---------- actions ----------

  function markOpened(handle) {
    if (state.opened.includes(handle)) return;
    setState({ opened: [...state.opened, handle] });
  }

  function showError(selector, message) {
    const el = $(selector);
    el.textContent = message || '';
    el.hidden = !message;
  }

  function onSubmitHandle(event) {
    event.preventDefault();
    const handle = normalizeHandle($('#handle').value);
    if (!isValidHandle(handle)) {
      showError('#handle-error', t('invalidHandle'));
      return;
    }
    showError('#handle-error', '');
    setState({ handle, number: null, existing: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onGetNumber() {
    if (busy) return;
    busy = true;
    showError('#register-error', '');
    renderAccounts();
    try {
      const result = isDemo ? registerDemo(state.handle) : await registerRemote(state.handle);
      busy = false;
      setState({ number: result.number, existing: Boolean(result.existing) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      busy = false;
      const code = error instanceof ApiError ? error.code : 'network';
      const message = code === 'closed' ? t('closed') : code === 'invalid_handle' ? t('invalidHandle') : t('networkError');
      showError('#register-error', message);
      renderAccounts();
    }
  }

  function onChangeHandle() {
    $('#handle').value = state.handle;
    setState({ handle: '', number: null, existing: false });
  }

  function onAnotherPerson() {
    $('#handle').value = '';
    setState({ ...EMPTY_STATE });
  }

  function onLang(event) {
    const next = event.currentTarget.dataset.lang;
    if (!TEXTS[next]) return;
    lang = next;
    writeJson(LANG_KEY, lang);
    render();
  }

  // ---------- init ----------

  $('#accounts').append(...config.accounts.map(buildAccountItem));
  $('#handle-form').addEventListener('submit', onSubmitHandle);
  $('#get-number').addEventListener('click', onGetNumber);
  $('#change-handle').addEventListener('click', onChangeHandle);
  $('#another').addEventListener('click', onAnotherPerson);
  document.querySelectorAll('[data-lang]').forEach((btn) => btn.addEventListener('click', onLang));
  render();
})();
