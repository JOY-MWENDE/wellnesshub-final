/**
 * Shared API client & session helpers for WellnessHub
 */
const AUTH_TOKEN_KEY = 'wellnesshub_token';
const AUTH_USER_KEY = 'wellnesshub_user';

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSession(token, user) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function isAuthenticated() {
  return Boolean(getToken() && getUser());
}

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data.message || data.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

window.WellnessAPI = {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getToken,
  getUser,
  setSession,
  clearSession,
  isAuthenticated,
  apiFetch
};
