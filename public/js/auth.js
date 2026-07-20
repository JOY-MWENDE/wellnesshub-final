/**
 * WellnessHub — Authentication (login & register pages)
 */
(function () {
  const { setSession, apiFetch } = window.WellnessAPI;

  function bindPasswordToggle(passwordInputId, toggleBtnId, toggleIconId) {
    const passwordInput = document.getElementById(passwordInputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    const toggleIcon = document.getElementById(toggleIconId);

    if (!passwordInput || !toggleBtn || !toggleIcon) return;

    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', String(isHidden));
      toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      toggleIcon.classList.toggle('fa-eye', !isHidden);
      toggleIcon.classList.toggle('fa-eye-slash', isHidden);
    });
  }

  function setFieldState(input, group, feedback, message, shouldShow) {
    if (!input || !feedback) return true;

    const isInvalid = Boolean(message);
    const showMessage = isInvalid && shouldShow;
    const hasValue = input.type === 'checkbox'
      ? input.checked
      : input.value.trim().length > 0;

    input.classList.toggle('is-invalid', showMessage);
    input.classList.toggle('is-valid', !isInvalid && hasValue && shouldShow && input.type !== 'checkbox');
    input.setAttribute('aria-invalid', showMessage ? 'true' : 'false');

    if (group) {
      group.classList.toggle('is-invalid', showMessage);
      group.classList.toggle('is-valid', !isInvalid && hasValue && shouldShow);
    }

    feedback.textContent = message;
    feedback.classList.toggle('d-none', !showMessage);
    return !isInvalid;
  }

  function getAuthAlertElement() {
    return document.getElementById('registerAlert') || document.getElementById('loginAlert');
  }

  function showGlobalAlert(message, type) {
    const alert = getAuthAlertElement();
    if (!alert) return;
    alert.textContent = message;
    alert.className = `login-alert alert alert-${type}`;
    alert.classList.remove('d-none');
  }

  function hideGlobalAlert() {
    const alert = getAuthAlertElement();
    if (!alert) return;
    alert.textContent = '';
    alert.className = 'login-alert alert d-none';
  }

  function setSubmitting(isSubmitting, submitBtn, loadingText, defaultText) {
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    submitBtn.querySelector('.login-submit-spinner')?.classList.toggle('d-none', !isSubmitting);
    submitBtn.querySelector('.login-submit-text').textContent = isSubmitting ? loadingText : defaultText;
  }

  async function authenticateUser(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setSession(data.token, data.user);
    return data;
  }

  async function registerUser(username, email, password) {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    setSession(data.token, data.user);
    return data;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.WellnessAPI?.isAuthenticated()) {
      window.location.href = '/';
      return;
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      bindPasswordToggle('loginPassword', 'passwordToggle', 'passwordToggleIcon');
      initLoginValidation();
      loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
      bindPasswordToggle('registerPassword', 'registerPasswordToggle', 'registerPasswordToggleIcon');
      bindPasswordToggle('registerConfirmPassword', 'registerConfirmToggle', 'registerConfirmToggleIcon');
      initRegisterValidation();
      registerForm.addEventListener('submit', handleRegisterSubmit);
    }
  });

  function initLoginValidation() {
    document.getElementById('loginEmail')?.addEventListener('input', () => validateLoginEmailField(false));
    document.getElementById('loginEmail')?.addEventListener('blur', () => validateLoginEmailField(true));
    document.getElementById('loginPassword')?.addEventListener('input', () => validateLoginPasswordField(false));
    document.getElementById('loginPassword')?.addEventListener('blur', () => validateLoginPasswordField(true));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    hideGlobalAlert();

    if (!validateLoginEmailField(true) || !validateLoginPasswordField(true)) {
      showGlobalAlert('Please fix the highlighted fields and try again.', 'danger');
      return;
    }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    setSubmitting(true, submitBtn, 'Signing in…', 'Sign In');

    try {
      await authenticateUser(email, password);
      showGlobalAlert('Signed in successfully. Redirecting…', 'success');
      setTimeout(() => { window.location.href = '/'; }, 600);
    } catch (error) {
      showGlobalAlert(error.message || 'Unable to sign in.', 'danger');
    } finally {
      setSubmitting(false, submitBtn, 'Signing in…', 'Sign In');
    }
  }

  function validateLoginEmailField(showError) {
    const input = document.getElementById('loginEmail');
    const feedback = document.getElementById('loginEmailFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value.trim() || '';
    let message = '';
    if (!value) message = showError ? 'Email is required.' : '';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = 'Enter a valid email address.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function validateLoginPasswordField(showError) {
    const input = document.getElementById('loginPassword');
    const feedback = document.getElementById('loginPasswordFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value || '';
    let message = '';
    if (!value) message = showError ? 'Password is required.' : '';
    else if (value.length < 6) message = 'Password must be at least 6 characters.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function initRegisterValidation() {
    document.getElementById('registerUsername')?.addEventListener('input', () => validateRegisterUsernameField(false));
    document.getElementById('registerUsername')?.addEventListener('blur', () => validateRegisterUsernameField(true));
    document.getElementById('registerEmail')?.addEventListener('input', () => validateRegisterEmailField(false));
    document.getElementById('registerEmail')?.addEventListener('blur', () => validateRegisterEmailField(true));
    document.getElementById('registerPassword')?.addEventListener('input', () => {
      validateRegisterPasswordField(false);
      if (document.getElementById('registerConfirmPassword')?.value) validateRegisterConfirmPasswordField(false);
    });
    document.getElementById('registerPassword')?.addEventListener('blur', () => validateRegisterPasswordField(true));
    document.getElementById('registerConfirmPassword')?.addEventListener('input', () => validateRegisterConfirmPasswordField(false));
    document.getElementById('registerConfirmPassword')?.addEventListener('blur', () => validateRegisterConfirmPasswordField(true));
    document.getElementById('acceptTerms')?.addEventListener('change', () => validateRegisterTermsField(true));
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    hideGlobalAlert();

    const valid = [
      validateRegisterUsernameField(true),
      validateRegisterEmailField(true),
      validateRegisterPasswordField(true),
      validateRegisterConfirmPasswordField(true),
      validateRegisterTermsField(true)
    ].every(Boolean);

    if (!valid) {
      showGlobalAlert('Please review the form and correct the highlighted fields.', 'danger');
      return;
    }

    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const submitBtn = document.getElementById('registerSubmitBtn');

    setSubmitting(true, submitBtn, 'Creating account…', 'Create Account');

    try {
      await registerUser(username, email, password);
      showGlobalAlert('Account created! Redirecting…', 'success');
      setTimeout(() => { window.location.href = '/'; }, 700);
    } catch (error) {
      showGlobalAlert(error.message || 'Unable to create your account.', 'danger');
    } finally {
      setSubmitting(false, submitBtn, 'Creating account…', 'Create Account');
    }
  }

  function validateRegisterUsernameField(showError) {
    const input = document.getElementById('registerUsername');
    const feedback = document.getElementById('registerUsernameFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value.trim() || '';
    let message = '';
    if (!value) message = showError ? 'Username is required.' : '';
    else if (value.length < 3) message = 'Username must be at least 3 characters.';
    else if (!/^[A-Za-z0-9_]+$/.test(value)) message = 'Use only letters, numbers, and underscores.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function validateRegisterEmailField(showError) {
    const input = document.getElementById('registerEmail');
    const feedback = document.getElementById('registerEmailFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value.trim() || '';
    let message = '';
    if (!value) message = showError ? 'Email is required.' : '';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = 'Enter a valid email address.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function validateRegisterPasswordField(showError) {
    const input = document.getElementById('registerPassword');
    const feedback = document.getElementById('registerPasswordFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value || '';
    let message = '';
    if (!value) message = showError ? 'Password is required.' : '';
    else if (value.length < 6) message = 'Password must be at least 6 characters.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function validateRegisterConfirmPasswordField(showError) {
    const input = document.getElementById('registerConfirmPassword');
    const password = document.getElementById('registerPassword')?.value || '';
    const feedback = document.getElementById('registerConfirmPasswordFeedback');
    const group = input?.closest('.login-input-group');
    const value = input?.value || '';
    let message = '';
    if (!value) message = showError ? 'Please confirm your password.' : '';
    else if (value !== password) message = 'Passwords do not match.';
    return setFieldState(input, group, feedback, message, showError || Boolean(message && value));
  }

  function validateRegisterTermsField(showError) {
    const input = document.getElementById('acceptTerms');
    const feedback = document.getElementById('acceptTermsFeedback');
    const wrapper = input?.closest('.register-terms');
    const message = input?.checked ? '' : 'You must accept the terms to create an account.';
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message) && showError);
      input.setAttribute('aria-invalid', message && showError ? 'true' : 'false');
    }
    if (wrapper) wrapper.classList.toggle('is-invalid', Boolean(message) && showError);
    if (feedback) {
      feedback.textContent = message;
      feedback.classList.toggle('d-none', !(message && showError));
    }
    return !message;
  }
})();
