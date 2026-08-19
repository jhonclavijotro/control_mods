/**
 * SOLARIS CONTROL - UNIFIED LOGIN LOGIC
 */

// --- GLOBAL STATE VARIABLES ---
let isReadOnlyMode = false;

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const formLogin = document.getElementById('form-mandatory-login');
    const formReg = document.getElementById('form-mandatory-register');
    const linkShowReg = document.getElementById('link-show-register');
    const linkShowLogin = document.getElementById('link-show-login');
    const subheading = document.getElementById('login-subheading');

    // Initialize View
    initLoginView();

    async function initLoginView() {
        // Apply theme if any in localStorage
        const currentTheme = localStorage.getItem('solaris_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);

        bindEvents();
        await checkConfig();
    }

    async function checkConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const config = await res.json();
                isReadOnlyMode = !!config.read_only_mode;
                if (isReadOnlyMode) {
                    if (subheading) {
                        subheading.textContent = 'Ingreso al Portal Ejecutivo (Modo Solo Lectura)';
                    }
                    // Inform the user they can only log in as stakeholder
                    const errorMsg = document.getElementById('login-error-msg');
                    if (errorMsg) {
                        errorMsg.innerHTML = '<i class="fa-solid fa-circle-info"></i> Modo Solo Lectura: Solo se permite el ingreso a usuarios de tipo Stakeholder.';
                        errorMsg.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                        errorMsg.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                        errorMsg.style.color = '#fbbf24';
                        errorMsg.style.display = 'block';
                    }
                }
            }
        } catch (e) {
            console.error("Error al obtener la configuración de la API:", e);
        }
    }

    function bindEvents() {
        // Toggle forms
        if (linkShowReg) {
            linkShowReg.addEventListener('click', (e) => {
                e.preventDefault();
                if (formLogin) formLogin.style.display = 'none';
                if (formReg) formReg.style.display = 'block';
                if (subheading) {
                    subheading.textContent = isReadOnlyMode 
                        ? 'Crear Cuenta de Stakeholder' 
                        : 'Crear Cuenta de Stakeholder (Solo Lectura)';
                }
            });
        }

        if (linkShowLogin) {
            linkShowLogin.addEventListener('click', (e) => {
                e.preventDefault();
                if (formReg) formReg.style.display = 'none';
                if (formLogin) formLogin.style.display = 'block';
                if (subheading) {
                    subheading.textContent = isReadOnlyMode 
                        ? 'Ingreso al Portal Ejecutivo (Modo Solo Lectura)' 
                        : 'Ingreso al Sistema de Mantenimiento Solar';
                }
            });
        }

        // Login form submission
        if (formLogin) {
            formLogin.addEventListener('submit', async (e) => {
                e.preventDefault();
                const usernameInput = document.getElementById('login-username');
                const passwordInput = document.getElementById('login-password');
                const errorMsg = document.getElementById('login-error-msg');
                const submitBtn = document.getElementById('btn-login-submit');

                if (errorMsg) errorMsg.style.display = 'none';
                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: usernameInput?.value.trim() || '',
                            password: passwordInput?.value || ''
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.detail || "Error al iniciar sesión.");
                    }

                    // Save token and redirect based on role
                    localStorage.setItem('solaris_token', data.token);
                    showToast(`Bienvenido ${data.user.full_name}`, 'success');

                    if (passwordInput) passwordInput.value = '';

                    // Redirect logic
                    setTimeout(() => {
                        if (data.user.role === 'stakeholder') {
                            window.location.href = '/stakeholder';
                        } else {
                            window.location.href = '/operator';
                        }
                    }, 500);

                } catch (err) {
                    if (errorMsg) {
                        errorMsg.textContent = err.message;
                        errorMsg.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                        errorMsg.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                        errorMsg.style.color = '#fca5a5';
                        errorMsg.style.display = 'block';
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        // Register form submission
        if (formReg) {
            formReg.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fullnameInput = document.getElementById('reg-fullname');
                const usernameInput = document.getElementById('reg-username');
                const passwordInput = document.getElementById('reg-password');
                const errorMsg = document.getElementById('register-error-msg');
                const submitBtn = document.getElementById('btn-register-submit');

                if (errorMsg) errorMsg.style.display = 'none';
                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            full_name: fullnameInput?.value.trim() || '',
                            username: usernameInput?.value.trim() || '',
                            password: passwordInput?.value || ''
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.detail || "Error al registrar usuario.");
                    }

                    // Save token and redirect
                    localStorage.setItem('solaris_token', data.token);
                    showToast(`Registro exitoso. Bienvenido ${data.user.full_name}`, 'success');

                    if (fullnameInput) fullnameInput.value = '';
                    if (usernameInput) usernameInput.value = '';
                    if (passwordInput) passwordInput.value = '';

                    setTimeout(() => {
                        window.location.href = '/stakeholder';
                    }, 500);

                } catch (err) {
                    if (errorMsg) {
                        errorMsg.textContent = err.message;
                        errorMsg.style.display = 'block';
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }
    }

    // Toast Notification helper
    function showToast(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = type === 'error' 
            ? `<i class="fa-solid fa-circle-exclamation"></i> ${msg}` 
            : `<i class="fa-solid fa-circle-check"></i> ${msg}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }
});
