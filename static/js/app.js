/**
 * SOLARIS CONTROL - FRONTEND APP LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let currentTab = 'dashboard';
    let invertersData = [];
    let dashboardData = {};
    let sparesData = [];
    let logsData = { repairs: [], replacements: [] };
    let isReadOnly = false;
    let activeCharts = {};
    let historyCurrentPage = 1;
    const HISTORY_PAGE_SIZE = 20;

    // DOM Elements
    const tabsBar = document.getElementById('tabs-bar');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Modals & Forms
    const modalStop = document.getElementById('modal-stop-repair');
    const modalRestart = document.getElementById('modal-restart-repair');
    const modalReplace = document.getElementById('modal-replace-module');
    const modalAddSpare = document.getElementById('modal-add-spare');

    // Auth State
    let currentUser = null;
    let authToken = localStorage.getItem('solaris_token') || null;

    // Helper for Authenticated Fetch
    async function authenticatedFetch(url, options = {}) {
        options.headers = options.headers || {};
        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }
        return fetch(url, options);
    }

    // Initialize App
    initApp();

    async function initApp() {
        initTheme();
        bindAuthEvents();
        bindTabEvents();
        bindModalEvents();
        bindFormEvents();
        bindActionButtons();
        bindHistoryFilterEvents();
        bindChartPeriodEvents();
        bindKPICardEvents();
        await checkAuthSession();
    }

    async function checkAuthSession() {
        const userBadge = document.getElementById('user-profile-badge');

        if (!authToken) {
            window.location.href = '/login';
            return;
        }

        try {
            const res = await authenticatedFetch('/api/auth/me');
            if (!res.ok) {
                throw new Error("Sesión caducada");
            }
            currentUser = await res.json();

            // Redirect if role is stakeholder (should not access operator view)
            if (currentUser.role === 'stakeholder') {
                window.location.href = '/stakeholder';
                return;
            }

            if (userBadge) userBadge.style.display = 'inline-flex';

            const nameEl = document.getElementById('user-display-name');
            const roleEl = document.getElementById('user-role-badge');
            if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;
            if (roleEl) {
                roleEl.textContent = currentUser.role.toUpperCase();
                roleEl.className = `role-badge role-badge-${currentUser.role}`;
            }

            await checkAppConfig();
            applyRolePermissions();
            await loadAllData();
        } catch (e) {
            console.warn("Sesión no válida o expirada:", e);
            localStorage.removeItem('solaris_token');
            authToken = null;
            currentUser = null;
            window.location.href = '/login';
        }
    }

    function applyRolePermissions() {
        if (!currentUser) return;

        const btnUsers = document.getElementById('btn-manage-users');
        const btnSeedClean = document.getElementById('btn-seed-clean');
        const btnSeedReset = document.getElementById('btn-seed-reset');

        if (currentUser.role === 'admin') {
            if (btnUsers) btnUsers.style.display = 'inline-flex';
            if (btnSeedClean) btnSeedClean.style.display = 'inline-flex';
            if (btnSeedReset) btnSeedReset.style.display = 'inline-flex';
        } else if (currentUser.role === 'operator') {
            if (btnUsers) btnUsers.style.display = 'none';
            if (btnSeedClean) btnSeedClean.style.display = 'none';
            if (btnSeedReset) btnSeedReset.style.display = 'none';
        } else {
            // stakeholder / read-only
            if (btnUsers) btnUsers.style.display = 'none';
            if (btnSeedClean) btnSeedClean.style.display = 'none';
            if (btnSeedReset) btnSeedReset.style.display = 'none';

            // Disable mutating buttons
            ['btn-quick-stop', 'btn-quick-replace', 'btn-add-spare'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('btn-read-only-disabled');
                }
            });
        }
    }

    function bindAuthEvents() {
        // Logout Button
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                try {
                    await authenticatedFetch('/api/auth/logout', { method: 'POST' });
                } catch (e) {}

                localStorage.removeItem('solaris_token');
                authToken = null;
                currentUser = null;
                showToast("Sesión cerrada correctamente", "info");
                window.location.href = '/login';
            });
        }

        // Export Excel Button (.xlsx)
        const btnExcel = document.getElementById('btn-export-excel');
        if (btnExcel) {
            btnExcel.addEventListener('click', async () => {
                try {
                    showToast("Generando reporte Excel (.xlsx)...", "info");
                    const res = await authenticatedFetch('/api/export/xlsx');
                    if (!res.ok) throw new Error("Error al generar el reporte Excel.");

                    const blob = await res.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = `Solaris_Control_Reporte_${new Date().toISOString().slice(0,10)}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(downloadUrl);
                    showToast("Reporte Excel descargado exitosamente", "success");
                } catch (err) {
                    console.error("Error en descarga Excel:", err);
                    showToast("Falla al descargar reporte Excel.", "error");
                }
            });
        }

        // Manage Users Modal Button
        const btnUsers = document.getElementById('btn-manage-users');
        const modalUsers = document.getElementById('modal-manage-users');
        if (btnUsers && modalUsers) {
            btnUsers.addEventListener('click', () => {
                modalUsers.classList.add('active');
                loadUsersList();
            });
        }

        // Form Create User Submit
        const formCreateUser = document.getElementById('form-create-user');
        if (formCreateUser) {
            formCreateUser.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('new-user-username').value;
                const fullname = document.getElementById('new-user-fullname').value;
                const password = document.getElementById('new-user-password').value;
                const role = document.getElementById('new-user-role').value;

                try {
                    const res = await authenticatedFetch('/api/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: username,
                            full_name: fullname,
                            password: password,
                            role: role
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(data.detail || "Error al crear usuario.");

                    showToast(data.message, "success");
                    formCreateUser.reset();
                    await loadUsersList();
                } catch (err) {
                    showToast(err.message, "error");
                }
            });
        }
    }

    async function loadUsersList() {
        const tableBody = document.getElementById('users-table-body');
        if (!tableBody) return;

        try {
            const res = await authenticatedFetch('/api/users');
            if (!res.ok) return;

            const users = await res.json();
            tableBody.innerHTML = users.map(u => `
                <tr>
                    <td><strong>${u.username}</strong></td>
                    <td>${u.full_name}</td>
                    <td><span class="role-badge role-badge-${u.role}">${u.role.toUpperCase()}</span></td>
                    <td>
                        ${u.username !== 'admin' && currentUser && u.id !== currentUser.id ? `
                            <button type="button" class="btn btn-sm btn-danger btn-delete-user" data-id="${u.id}" data-username="${u.username}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        ` : '<span class="text-muted">Protegido</span>'}
                    </td>
                </tr>
            `).join('');

            // Bind delete user handlers
            tableBody.querySelectorAll('.btn-delete-user').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const userId = btn.dataset.id;
                    const username = btn.dataset.username;
                    if (!confirm(`¿Eliminar al usuario '${username}'?`)) return;

                    try {
                        const res = await authenticatedFetch(`/api/users/${userId}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.detail || "Error al eliminar usuario.");

                        showToast(data.message, "success");
                        await loadUsersList();
                    } catch (err) {
                        showToast(err.message, "error");
                    }
                });
            });
        } catch (e) {
            console.error("Error al cargar lista de usuarios:", e);
        }
    }

    async function checkAppConfig() {
        try {
            const cfg = await fetch('/api/config').then(r => r.json());
            isReadOnly = !!cfg.read_only_mode;
            if (isReadOnly) {
                document.body.classList.add('is-read-only');
                const banner = document.getElementById('read-only-banner');
                if (banner) banner.style.display = 'flex';

                // Disable header mutating buttons
                ['btn-quick-stop', 'btn-quick-replace', 'btn-add-spare', 'btn-seed-reset', 'btn-seed-clean'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) {
                        btn.disabled = true;
                        btn.classList.add('btn-read-only-disabled');
                        btn.title = "Operación no disponible en Modo Solo Lectura (Stakeholders)";
                    }
                });
            }
        } catch (e) {
            console.error('Error al verificar la configuración:', e);
        }
    }

    // Theme Management Logic
    function initTheme() {
        const savedTheme = localStorage.getItem('solaris_theme');
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
        
        applyTheme(initialTheme, false);

        const themeBtn = document.getElementById('btn-theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                applyTheme(newTheme, true);
            });
        }
    }

    function applyTheme(theme, showToastNotification = false) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('solaris_theme', theme);

        const themeIcon = document.getElementById('theme-toggle-icon');
        const themeText = document.getElementById('theme-toggle-text');

        if (theme === 'light') {
            if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
            if (themeText) themeText.textContent = 'Tema Claro';
        } else {
            if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
            if (themeText) themeText.textContent = 'Tema Oscuro';
        }

        if (showToastNotification) {
            const label = theme === 'light' ? 'Modo Claro' : 'Modo Oscuro';
            showToast(`Tema cambiado a ${label}`, 'success');
        }

        updateChartsTheme();
    }

    // Load data from Backend REST API
    async function loadAllData() {
        try {
            const [invRes, dashRes, sparesRes, logsRes] = await Promise.all([
                fetch('/api/inverters').then(r => r.json()),
                fetch('/api/dashboard').then(r => r.json()),
                fetch('/api/spares').then(r => r.json()),
                fetch('/api/logs').then(r => r.json())
            ]);

            invertersData = invRes;
            dashboardData = dashRes;
            sparesData = sparesRes;
            logsData = logsRes;

            const isModalOpen = document.querySelector('.modal-overlay.active') !== null;
            if (!isModalOpen) {
                renderCurrentTab();
            }
        } catch (err) {
            console.error('Error cargando datos de la API:', err);
        }
    }

    // Tab Navigation Logic
    function bindTabEvents() {
        if (tabsBar) {
            tabsBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;

                const targetTab = btn.dataset.tab;
                switchTab(targetTab);
            });
        }

        // Header brand logo link to Dashboard
        const brandLogo = document.getElementById('header-brand-logo');
        if (brandLogo) {
            brandLogo.onclick = () => switchTab('dashboard');
        }

        // All "Volver al Dashboard" buttons across sub-panes
        document.querySelectorAll('.btn-back-to-dashboard').forEach(btn => {
            btn.onclick = () => switchTab('dashboard');
        });
    }

    function renderCurrentTab() {
        switchTab(currentTab);
    }

    // Render Dashboard Overview
    function renderDashboard() {
        if (!dashboardData.total_active_slots) return;

        document.getElementById('dash-op-count').textContent = dashboardData.operating_count;
        document.getElementById('dash-repair-count').textContent = dashboardData.in_repair_count;
        document.getElementById('dash-spare-count').textContent = dashboardData.spare_count;
        document.getElementById('dash-total-hours').textContent = `${dashboardData.total_farm_operating_hours} hrs`;

        // Render Inverters Topology Summary Grid
        const summaryContainer = document.getElementById('inverters-summary-container');
        summaryContainer.innerHTML = '';

        invertersData.forEach(inv => {
            const card = document.createElement('div');
            card.className = 'inv-summary-card';
            card.onclick = () => switchTab(inv.id);

            const opSlots = inv.slots.filter(s => s.status === 'operating').length;
            const repairSlots = inv.slots.filter(s => s.status === 'in_repair').length;

            let dotsHtml = inv.slots.map(s => `<div class="slot-dot ${s.status}" title="Slot ${s.slot_number}: ${s.current_serial} (${s.status})"></div>`).join('');

            card.innerHTML = `
                <div class="inv-summary-header">
                    <span class="inv-summary-title">⚡ Inversor ${inv.id}</span>
                    <span class="status-tag ${repairSlots > 0 ? 'in_repair' : 'operating'}">
                        ${repairSlots > 0 ? `${repairSlots} en falla` : '100% Ok'}
                    </span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    ${opSlots}/${inv.max_modules} Módulos activos
                </div>
                <div class="inv-slots-mini">
                    ${dotsHtml}
                </div>
            `;
            summaryContainer.appendChild(card);
        });

        // Render Recent Activity Logs
        const recentBody = document.getElementById('dash-recent-table');
        recentBody.innerHTML = '';

        const allEvents = [];
        dashboardData.recent_repairs.forEach(r => {
            allEvents.push({
                time: new Date(r.stop_time),
                inverter: r.inverter_id,
                slot: r.slot_number,
                serial: r.serial,
                type: 'Parada por Reparación',
                detail: r.reason,
                status: r.status === 'open' ? 'En Curso' : 'Resuelto'
            });
        });
        dashboardData.recent_replacements.forEach(rep => {
            allEvents.push({
                time: new Date(rep.timestamp),
                inverter: rep.inverter_id,
                slot: rep.slot_number,
                serial: `${rep.old_serial} ➔ ${rep.new_serial}`,
                type: 'Reemplazo de Módulo',
                detail: rep.reason,
                status: 'Completado'
            });
        });

        allEvents.sort((a, b) => b.time - a.time);

        if (allEvents.length === 0) {
            recentBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No hay eventos registrados recientemente.</td></tr>`;
        } else {
            allEvents.forEach(ev => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(ev.time)}</td>
                    <td><strong>${ev.inverter}</strong></td>
                    <td>Slot ${ev.slot}</td>
                    <td><code>${ev.serial}</code></td>
                    <td><span class="status-tag ${ev.type.includes('Parada') ? 'in_repair' : 'spare'}">${ev.type}</span></td>
                    <td>${ev.detail}</td>
                    <td><span class="status-tag ${ev.status === 'En Curso' ? 'in_repair' : 'operating'}">${ev.status}</span></td>
                `;
                recentBody.appendChild(tr);
            });
        }

        // Render Availability Charts for Palmaseca 1 and Palmaseca 2
        renderAvailabilityCharts();
    }

    // Availability Bar Charts Logic (Chart.js)
    function updateChartsTheme() {
        if (typeof Chart === 'undefined' || !activeCharts) return;
        const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';
        const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        const availColor = isDark ? '#10b981' : '#059669';
        const unavailColor = isDark ? '#ef4444' : '#dc2626';

        Object.keys(activeCharts).forEach(chartId => {
            const chart = activeCharts[chartId];
            if (!chart) return;

            if (chart.options.scales.x) {
                chart.options.scales.x.ticks.color = textColor;
                chart.options.scales.x.grid.color = gridColor;
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.ticks.color = textColor;
                chart.options.scales.y.grid.color = gridColor;
            }
            if (chart.options.plugins && chart.options.plugins.legend) {
                chart.options.plugins.legend.labels.color = textColor;
            }
            if (chart.options.plugins && chart.options.plugins.tooltip) {
                chart.options.plugins.tooltip.backgroundColor = tooltipBg;
                chart.options.plugins.tooltip.titleColor = tooltipText;
                chart.options.plugins.tooltip.bodyColor = tooltipText;
                chart.options.plugins.tooltip.borderColor = tooltipBorder;
            }
            if (chart.data.datasets && chart.data.datasets.length >= 2) {
                chart.data.datasets[0].backgroundColor = availColor;
                chart.data.datasets[1].backgroundColor = unavailColor;
            }
            chart.update();
        });
    }

    function createGroupedBarChart(canvasId, labels, uptimeData, downtimeData) {
        if (typeof Chart === 'undefined') return;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (activeCharts[canvasId]) {
            activeCharts[canvasId].destroy();
            delete activeCharts[canvasId];
        }

        const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        const tooltipBg = isDark ? '#1e293b' : '#ffffff';
        const tooltipText = isDark ? '#f8fafc' : '#0f172a';
        const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        const availColor = isDark ? '#10b981' : '#059669';
        const unavailColor = isDark ? '#ef4444' : '#dc2626';

        const verticalDataLabelsPlugin = {
            id: 'verticalDataLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                const currentIsDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (!meta || meta.hidden) return;

                    meta.data.forEach((bar, index) => {
                        const rawVal = dataset.data[index];
                        if (rawVal === undefined || rawVal === null) return;
                        const formattedVal = `${Number(rawVal).toFixed(1)}%`;

                        const { x, y, base } = bar;
                        const barHeight = Math.abs(base - y);

                        ctx.save();
                        ctx.font = '700 11px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        if (barHeight > 45) {
                            const labelY = y + barHeight / 2;
                            ctx.translate(x, labelY);
                            ctx.rotate(-Math.PI / 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.fillText(formattedVal, 0, 0);
                        } else {
                            const labelY = y - 22;
                            ctx.translate(x, labelY);
                            ctx.rotate(-Math.PI / 2);
                            ctx.fillStyle = currentIsDark ? '#e2e8f0' : '#1e293b';
                            ctx.fillText(formattedVal, 0, 0);
                        }
                        ctx.restore();
                    });
                });
            }
        };

        const ctx = canvas.getContext('2d');
        activeCharts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '% Disponibilidad',
                        data: uptimeData,
                        backgroundColor: availColor,
                        borderRadius: 4,
                        borderSkipped: false
                    },
                    {
                        label: '% Indisponibilidad',
                        data: downtimeData,
                        backgroundColor: unavailColor,
                        borderRadius: 4,
                        borderSkipped: false
                    }
                ]
            },
            plugins: [verticalDataLabelsPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 750,
                    easing: 'easeOutQuart'
                },
                onClick: function(event, elements) {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index;
                        const label = labels[index];
                        let invId = null;
                        if (label && label.includes('Inversor ')) {
                            invId = label.replace('Inversor ', '').trim();
                        } else if (label && label.includes('-M')) {
                            invId = label.split('-M')[0].trim();
                        }
                        if (invId && ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(invId)) {
                            switchTab(invId);
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor,
                            font: { family: 'Inter', size: 12, weight: '600' },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: tooltipBg,
                        titleColor: tooltipText,
                        bodyColor: tooltipText,
                        borderColor: tooltipBorder,
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: false,
                        ticks: {
                            color: textColor,
                            font: { family: 'Inter', size: 11, weight: '600' }
                        },
                        grid: {
                            color: gridColor
                        }
                    },
                    y: {
                        stacked: false,
                        max: 110,
                        ticks: {
                            color: textColor,
                            font: { family: 'Inter', size: 10 },
                            callback: function(val) { return val <= 100 ? val + '%' : ''; }
                        },
                        grid: {
                            color: gridColor
                        }
                    }
                }
            }
        });
    }

    async function renderPlantAvailabilityChart(canvasId, invIds, periodVal) {
        try {
            const data = await fetch(`/api/inverters?period=${periodVal}`).then(r => r.json());
            const labels = [];
            const uptime = [];
            const downtime = [];

            invIds.forEach(id => {
                const inv = data.find(i => i.id === id);
                if (inv) {
                    labels.push(`Inversor ${inv.id}`);
                    const slots = inv.slots || [];
                    const avgUptime = slots.length ? (slots.reduce((sum, s) => sum + (s.metrics ? s.metrics.uptime_percent : 100), 0) / slots.length) : 100;
                    const up = Math.round(avgUptime * 10) / 10;
                    const down = Math.round((100 - up) * 10) / 10;
                    uptime.push(up);
                    downtime.push(down);
                }
            });

            createGroupedBarChart(canvasId, labels, uptime, downtime);
        } catch (err) {
            console.error(`Error al renderizar gráfico para ${canvasId}:`, err);
        }
    }

    function renderAvailabilityCharts() {
        const p1Select = document.getElementById('select-period-palmaseca1');
        const p2Select = document.getElementById('select-period-palmaseca2');

        const periodP1 = p1Select ? p1Select.value : 'month';
        const periodP2 = p2Select ? p2Select.value : 'month';

        renderPlantAvailabilityChart('chart-inv-palmaseca1', ['A1', 'A2', 'B1', 'B2'], periodP1);
        renderPlantAvailabilityChart('chart-inv-palmaseca2', ['C1', 'C2', 'D1', 'E1'], periodP2);
    }

    function bindChartPeriodEvents() {
        const p1Select = document.getElementById('select-period-palmaseca1');
        if (p1Select) {
            p1Select.addEventListener('change', () => {
                renderPlantAvailabilityChart('chart-inv-palmaseca1', ['A1', 'A2', 'B1', 'B2'], p1Select.value);
            });
        }

        const p2Select = document.getElementById('select-period-palmaseca2');
        if (p2Select) {
            p2Select.addEventListener('change', () => {
                renderPlantAvailabilityChart('chart-inv-palmaseca2', ['C1', 'C2', 'D1', 'E1'], p2Select.value);
            });
        }
    }

    function bindKPICardEvents() {
        const kpiOp = document.getElementById('kpi-card-operating');
        if (kpiOp) kpiOp.onclick = () => switchTab('modules');

        const kpiRepair = document.getElementById('kpi-card-repair');
        if (kpiRepair) kpiRepair.onclick = () => switchTab('history');

        const kpiSpares = document.getElementById('kpi-card-spares');
        if (kpiSpares) kpiSpares.onclick = () => switchTab('spares');

        const kpiHours = document.getElementById('kpi-card-hours');
        if (kpiHours) kpiHours.onclick = () => switchTab('history');
    }

    // Render Individual Inverter Tab (A1..E1)
    function renderInverterPane(inverterId) {
        const inv = invertersData.find(i => i.id === inverterId);
        if (!inv) return;

        const allStopped = inv.slots.length > 0 && inv.slots.every(s => s.status === 'in_repair');
        const anyStopped = inv.slots.some(s => s.status === 'in_repair');

        document.getElementById('inv-title').innerHTML = `⚡ Unidad Inversora ${inv.id}`;
        
        if (allStopped) {
            document.getElementById('inv-subtitle').innerHTML = `
                <span style="color: var(--danger); font-weight: 700;">
                    <i class="fa-solid fa-triangle-exclamation"></i> UNIDAD INVERSORA TOTALMENTE DETENIDA POR PARADA GENERAL
                </span>
            `;
        } else if (anyStopped) {
            document.getElementById('inv-subtitle').innerHTML = `
                <span style="color: var(--accent-amber); font-weight: 600;">
                    <i class="fa-solid fa-circle-exclamation"></i> Operación Parcial (${inv.slots.filter(s => s.status==='operating').length}/${inv.max_modules} Módulos Activos)
                </span>
            `;
        } else {
            document.getElementById('inv-subtitle').textContent = `${inv.max_modules} Módulos de Potencia en Operación Normal (${inv.id === 'E1' ? 'Inversor Especial E1' : 'Inversor Estándar'})`;
        }

        const slotsContainer = document.getElementById('inverter-slots-container');
        slotsContainer.innerHTML = '';

        inv.slots.forEach(slot => {
            const m = slot.metrics;
            const isRepair = slot.status === 'in_repair';

            const card = document.createElement('div');
            card.className = `module-card status-${slot.status}`;

            let activeRepairHtml = '';
            if (slot.active_repair) {
                activeRepairHtml = `
                    <div class="active-repair-banner">
                        <i class="fa-solid fa-triangle-exclamation"></i> <strong>Detenido desde:</strong> ${formatDate(slot.active_repair.stop_time)}<br>
                        <strong>Motivo:</strong> ${slot.active_repair.reason}
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="module-card-header">
                    <div>
                        <span class="module-slot-label">SLOT ${slot.slot_number} / ${inv.max_modules}</span>
                        <div class="module-serial">${slot.current_serial}</div>
                    </div>
                    <span class="status-tag ${slot.status}">
                        ${isRepair ? '<i class="fa-solid fa-wrench"></i> EN REPARACIÓN' : '<i class="fa-solid fa-circle-check"></i> OPERATIVO'}
                    </span>
                </div>

                ${activeRepairHtml}

                <div class="metrics-box">
                    <div class="metric-item" style="grid-column: span 2; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.3rem; margin-bottom: 0.2rem;">
                        <span class="m-label"><i class="fa-regular fa-calendar-days"></i> Fecha de Instalación</span>
                        <span class="m-val" style="font-size: 0.88rem; color: var(--secondary);">${formatDate(slot.installed_at || (m && m.installed_at))}</span>
                    </div>
                    <div class="metric-item">
                        <span class="m-label">Horas Operación (7am-6pm)</span>
                        <span class="m-val">${m.net_operating_hours} hrs</span>
                    </div>
                    <div class="metric-item">
                        <span class="m-label">Disponibilidad (Uptime)</span>
                        <span class="m-val" style="color: ${m.uptime_percent >= 90 ? 'var(--primary)' : 'var(--accent-amber)'}">${m.uptime_percent}%</span>
                    </div>
                    <div class="metric-item">
                        <span class="m-label">Total Reparaciones</span>
                        <span class="m-val">${m.total_repairs_count}</span>
                    </div>
                    <div class="metric-item">
                        <span class="m-label">MTBF Est.</span>
                        <span class="m-val">${m.mtbf_hours} hrs</span>
                    </div>
                </div>

                <div class="card-actions">
                    ${isRepair ? `
                        <button type="button" class="btn btn-success btn-icon-only btn-restart-action" data-repair-id="${slot.active_repair ? slot.active_repair.repair_id : ''}" data-serial="${slot.current_serial}" title="Registrar Arranque">
                            <i class="fa-solid fa-play"></i>
                        </button>
                    ` : `
                        <button type="button" class="btn btn-danger btn-icon-only btn-stop-action" data-inv="${inv.id}" data-slot="${slot.slot_number}" title="Registrar Parada">
                            <i class="fa-solid fa-pause"></i>
                        </button>
                    `}
                    <button type="button" class="btn btn-secondary btn-icon-only btn-replace-action" data-inv="${inv.id}" data-slot="${slot.slot_number}" data-serial="${slot.current_serial}" title="Reemplazar Módulo">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>
                    <button type="button" class="btn btn-outline btn-icon-only btn-edit-install-date-action" data-inv="${inv.id}" data-slot="${slot.slot_number}" data-serial="${slot.current_serial}" data-installed-at="${slot.installed_at || ''}" title="Configurar Fecha de Instalación (installed_at)">
                        <i class="fa-regular fa-calendar-days"></i>
                    </button>
                    <button type="button" class="btn btn-outline btn-icon-only btn-module-history-action" data-serial="${slot.current_serial}" title="Ver Historial de Fallas">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                </div>
            `;

            slotsContainer.appendChild(card);
        });

        // Bind inner card action buttons
        slotsContainer.querySelectorAll('.btn-stop-action').forEach(b => {
            b.onclick = () => openStopModal(b.dataset.inv, parseInt(b.dataset.slot));
        });

        slotsContainer.querySelectorAll('.btn-restart-action').forEach(b => {
            b.onclick = () => openRestartModal(parseInt(b.dataset.repairId), b.dataset.serial);
        });

        slotsContainer.querySelectorAll('.btn-replace-action').forEach(b => {
            b.onclick = () => openReplaceModal(b.dataset.inv, parseInt(b.dataset.slot), b.dataset.serial);
        });

        slotsContainer.querySelectorAll('.btn-edit-install-date-action').forEach(b => {
            b.onclick = () => openEditInstallDateModal(b.dataset.inv, parseInt(b.dataset.slot), b.dataset.serial, b.dataset.installedAt);
        });

        slotsContainer.querySelectorAll('.btn-module-history-action').forEach(b => {
            b.onclick = () => navigateToHistoryWithFilter({ serial: b.dataset.serial });
        });

        // Bind Header Action Buttons dynamically for current inverter
        const btnStopAll = document.getElementById('btn-stop-inverter-all');
        const btnRestartAll = document.getElementById('btn-restart-inverter-all');
        const btnViewHistory = document.getElementById('btn-inverter-view-history');

        if (btnViewHistory) {
            btnViewHistory.onclick = () => navigateToHistoryWithFilter({ inverter: inv.id });
        }

        if (btnStopAll) {
            btnStopAll.innerHTML = `<i class="fa-solid fa-power-off"></i> Parada Total ${inv.id}`;
            btnStopAll.onclick = () => openStopModal(inv.id, 0);
        }

        if (btnRestartAll) {
            btnRestartAll.innerHTML = `<i class="fa-solid fa-play"></i> Arranque Total ${inv.id}`;
            btnRestartAll.onclick = () => {
                if (!anyStopped) {
                    showToast(`La Unidad Inversora ${inv.id} se encuentra en operación normal. No hay paradas activas.`, 'info');
                    return;
                }
                openRestartInverterModal(inv.id);
            };
        }

        // Apply read-only mode state to card action buttons
        if (isReadOnly) {
            slotsContainer.querySelectorAll('.btn-stop-action, .btn-restart-action, .btn-replace-action, .btn-edit-install-date-action').forEach(b => {
                b.disabled = true;
                b.classList.add('btn-read-only-disabled');
                b.title = "Acción no permitida en Modo Solo Lectura (Stakeholders)";
            });
            if (btnStopAll) {
                btnStopAll.disabled = true;
                btnStopAll.classList.add('btn-read-only-disabled');
                btnStopAll.title = "Acción no permitida en Modo Solo Lectura";
            }
            if (btnRestartAll) {
                btnRestartAll.disabled = true;
                btnRestartAll.classList.add('btn-read-only-disabled');
                btnRestartAll.title = "Acción no permitida en Modo Solo Lectura";
            }
        }
    }

    // Render Spares Inventory Tab
    function renderSpares() {
        const container = document.getElementById('spares-list-container');
        container.innerHTML = '';

        if (sparesData.length === 0) {
            container.innerHTML = `<p class="text-muted">No hay módulos de repuesto en inventario.</p>`;
            return;
        }

        sparesData.forEach(sp => {
            const card = document.createElement('div');
            card.className = 'spare-card';
            card.innerHTML = `
                <div class="flex-between">
                    <span class="status-tag spare"><i class="fa-solid fa-box"></i> RESPALDO</span>
                    <small class="text-muted">Reparaciones previas: ${sp.total_repairs}</small>
                </div>
                <div style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700; color: #fff; margin-top:0.3rem;">
                    ${sp.serial_number}
                </div>
                <div class="flex-between mt-1" style="align-items:center;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        Registrado: ${formatDate(sp.registered_at)}
                    </span>
                    <button class="btn btn-danger btn-sm btn-delete-spare-action" data-serial="${sp.serial_number}">
                        <i class="fa-solid fa-trash"></i> Eliminar
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        container.querySelectorAll('.btn-delete-spare-action').forEach(b => {
            b.onclick = () => deleteModuleFromInventory(b.dataset.serial);
        });

        if (isReadOnly) {
            container.querySelectorAll('.btn-delete-spare-action').forEach(b => {
                b.disabled = true;
                b.classList.add('btn-read-only-disabled');
                b.title = "Acción no permitida en Modo Solo Lectura (Stakeholders)";
            });
        }
    }

    async function deleteModuleFromInventory(serialNumber) {
        if (!confirm(`¿Confirma eliminar definitivamente el módulo '${serialNumber}' del inventario?\nEsta acción retirará el módulo de las listas de forma permanente.`)) return;

        try {
            const res = await fetch(`/api/modules/${encodeURIComponent(serialNumber)}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error((await res.json()).detail);

            showToast(`Módulo ${serialNumber} eliminado del inventario`);
            await loadAllData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function switchTab(tabId) {
        currentTab = tabId;

        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Hide all panes
        tabPanes.forEach(pane => pane?.classList?.remove('active'));

        // Handle Pane Switching
        const dashPane = document.getElementById('tab-dashboard');
        const sparesPane = document.getElementById('tab-spares');
        const historyPane = document.getElementById('tab-history');
        const modulesPane = document.getElementById('tab-modules');
        const invPane = document.getElementById('tab-inverter');

        if (tabId === 'dashboard') {
            if (dashPane) dashPane.classList.add('active');
            renderDashboard();
        } else if (tabId === 'spares') {
            if (sparesPane) sparesPane.classList.add('active');
            renderSpares();
        } else if (tabId === 'history') {
            if (historyPane) historyPane.classList.add('active');
            renderHistory();
        } else if (tabId === 'modules') {
            if (modulesPane) modulesPane.classList.add('active');
            renderModulesCatalog();
        } else {
            // Individual Inverter Tab (A1, A2, B1, B2, C1, C2, D1, E1)
            if (invPane) invPane.classList.add('active');
            renderInverterPane(tabId);
        }
    }

    // Render All Modules Catalog Tab
    async function renderModulesCatalog() {
        const body = document.getElementById('modules-catalog-body');
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando catálogo...</td></tr>';

        try {
            const modules = await fetch('/api/modules').then(r => r.json());
            const searchTerm = document.getElementById('catalog-search-input').value.toLowerCase().trim();

            const filtered = modules.filter(m => {
                if (!searchTerm) return true;
                const inv = (m.inverter_id || '').toLowerCase();
                const serial = (m.serial_number || '').toLowerCase();
                return inv.includes(searchTerm) || serial.includes(searchTerm);
            });

            body.innerHTML = '';
            if (filtered.length === 0) {
                body.innerHTML = `<tr><td colspan="9" style="text-align:center;">No se encontraron módulos coincidentes.</td></tr>`;
                return;
            }

            filtered.forEach(m => {
                const tr = document.createElement('tr');
                const met = m.metrics || {};
                const instDate = (met && met.installed_at) || m.installed_at || m.registered_at;

                tr.innerHTML = `
                    <td><code>${m.serial_number}</code></td>
                    <td><strong>${m.inverter_id ? `Inversor ${m.inverter_id}` : '<span class="text-muted">En Respaldo</span>'}</strong></td>
                    <td>${m.slot_number ? `Slot ${m.slot_number}` : '-'}</td>
                    <td>${instDate ? formatDate(instDate) : '<span class="text-muted">-</span>'}</td>
                    <td><span class="status-tag ${m.status}">${m.status === 'operating' ? 'Operativo' : (m.status === 'in_repair' ? 'En Reparación' : 'Respaldo/Retirado')}</span></td>
                    <td>${met.net_operating_hours !== undefined ? met.net_operating_hours : 0} hrs</td>
                    <td>${m.total_repairs}</td>
                    <td><strong style="color:${(met.uptime_percent || 0) >= 90 ? 'var(--primary)' : 'var(--accent-amber)'}">${met.uptime_percent || 0}%</strong></td>
                    <td>
                        <div style="display:flex; gap:0.3rem;">
                            ${m.inverter_id && m.slot_number ? `
                                <button class="btn btn-outline btn-sm btn-edit-install-date-action" data-inv="${m.inverter_id}" data-slot="${m.slot_number}" data-serial="${m.serial_number}" data-installed-at="${instDate || ''}" title="Configurar Fecha de Instalación (installed_at)">
                                    <i class="fa-regular fa-calendar-days"></i> Fecha Inst.
                                </button>
                            ` : ''}
                            <button class="btn btn-outline btn-sm btn-module-history-action" data-serial="${m.serial_number}" title="Ver historial de fallas del módulo">
                                <i class="fa-solid fa-clock-rotate-left"></i> Historial
                            </button>
                            <button class="btn btn-outline btn-sm btn-edit-serial-action" data-serial="${m.serial_number}">
                                <i class="fa-solid fa-pen"></i> Editar Serial
                            </button>
                            <button class="btn btn-outline btn-sm btn-delete-module-action" data-serial="${m.serial_number}" style="color:var(--danger); border-color:rgba(239,68,68,0.3);">
                                <i class="fa-solid fa-trash"></i> Eliminar
                            </button>
                        </div>
                    </td>
                `;
                body.appendChild(tr);
            });

            body.querySelectorAll('.btn-edit-install-date-action').forEach(b => {
                b.onclick = () => openEditInstallDateModal(b.dataset.inv, parseInt(b.dataset.slot), b.dataset.serial, b.dataset.installedAt);
            });

            body.querySelectorAll('.btn-module-history-action').forEach(b => {
                b.onclick = () => navigateToHistoryWithFilter({ serial: b.dataset.serial });
            });

            body.querySelectorAll('.btn-edit-serial-action').forEach(b => {
                b.onclick = () => openEditSerialModal(b.dataset.serial);
            });

            body.querySelectorAll('.btn-delete-module-action').forEach(b => {
                b.onclick = () => deleteModuleFromInventory(b.dataset.serial);
            });

            if (isReadOnly) {
                body.querySelectorAll('.btn-edit-serial-action, .btn-delete-module-action').forEach(b => {
                    b.disabled = true;
                    b.classList.add('btn-read-only-disabled');
                    b.title = "Acción no permitida en Modo Solo Lectura (Stakeholders)";
                });
            }
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--danger);">Error cargando módulos.</td></tr>`;
        }
    }

    document.getElementById('catalog-search-input').oninput = renderModulesCatalog;

    // Render History & Reports Tab with Dynamic Filtering
    // Render History & Reports Tab with Backend API Filtering
    // Render History & Reports Tab with Resilient Backend API + In-Memory Fallback Filtering
    async function renderHistory() {
        const invInput = document.getElementById('history-filter-inverter');
        const serialInput = document.getElementById('history-filter-serial');
        const statusInput = document.getElementById('history-filter-status');
        const searchInput = document.getElementById('history-filter-search');

        const invFilter = (invInput?.value || '').trim();
        const serialFilter = (serialInput?.value || '').trim().toLowerCase();
        const statusFilter = (statusInput?.value || 'all').trim().toLowerCase();
        const searchFilter = (searchInput?.value || '').trim().toLowerCase();

        const repairsBody = document.getElementById('history-repairs-body');
        const replacementsBody = document.getElementById('history-replacements-body');
        const counterEl = document.getElementById('history-results-counter');

        if (!repairsBody || !replacementsBody) return;

        // Fetch fresh logs from API if available
        const params = new URLSearchParams();
        if (invFilter) params.append('inverter_id', invFilter);
        if (serialFilter) params.append('serial_number', serialFilter);
        if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
        if (searchFilter) params.append('search', searchFilter);

        try {
            const res = await fetch('/api/logs?' + params.toString());
            if (res.ok) {
                const freshData = await res.json();
                if (freshData && freshData.repairs) {
                    logsData = freshData;
                }
            }
        } catch (err) {
            console.warn('API error, falling back to local filtering:', err);
        }

        const repairs = logsData.repairs || [];
        const replacements = logsData.replacements || [];

        // Client-side filtering pass (guarantees accuracy in all environments)
        const filteredRepairs = repairs.filter(r => {
            if (invFilter && (r.inverter_id || '').toUpperCase() !== invFilter.toUpperCase()) return false;
            if (serialFilter && !(r.serial_number || '').toLowerCase().includes(serialFilter)) return false;
            if (statusFilter !== 'all' && (r.status || '').toLowerCase() !== statusFilter) return false;
            if (searchFilter) {
                const matchReason = (r.reason || '').toLowerCase().includes(searchFilter);
                const matchDiag = (r.diagnosis || '').toLowerCase().includes(searchFilter);
                const matchSerial = (r.serial_number || '').toLowerCase().includes(searchFilter);
                const matchInv = (r.inverter_id || '').toLowerCase().includes(searchFilter);
                const matchId = String(r.id || '').toLowerCase().includes(searchFilter);
                if (!matchReason && !matchDiag && !matchSerial && !matchInv && !matchId) return false;
            }
            return true;
        });

        const filteredReplacements = (statusFilter !== 'all') ? [] : replacements.filter(rep => {
            if (invFilter && (rep.inverter_id || '').toUpperCase() !== invFilter.toUpperCase()) return false;
            if (serialFilter) {
                const matchOld = (rep.old_serial || '').toLowerCase().includes(serialFilter);
                const matchNew = (rep.new_serial || '').toLowerCase().includes(serialFilter);
                if (!matchOld && !matchNew) return false;
            }
            if (searchFilter) {
                const matchReason = (rep.reason || '').toLowerCase().includes(searchFilter);
                const matchTech = (rep.performed_by || '').toLowerCase().includes(searchFilter);
                const matchOld = (rep.old_serial || '').toLowerCase().includes(searchFilter);
                const matchNew = (rep.new_serial || '').toLowerCase().includes(searchFilter);
                const matchInv = (rep.inverter_id || '').toLowerCase().includes(searchFilter);
                const matchId = String(rep.id || '').toLowerCase().includes(searchFilter);
                if (!matchReason && !matchTech && !matchOld && !matchNew && !matchInv && !matchId) return false;
            }
            return true;
        });

        // Update Results Counter Badge Bar
        const isFiltered = invFilter || serialFilter || (statusFilter !== 'all') || searchFilter;
        if (counterEl) {
            let activeLabels = [];
            if (invFilter) activeLabels.push(`Inversor: <strong>${invFilter}</strong>`);
            if (serialFilter) activeLabels.push(`Serial: <strong>"${serialFilter}"</strong>`);
            if (statusFilter !== 'all') activeLabels.push(`Estado: <strong>${statusFilter === 'open' ? 'Abierta' : 'Resuelta'}</strong>`);
            if (searchFilter) activeLabels.push(`Búsqueda: <strong>"${searchFilter}"</strong>`);

            const filterDetails = isFiltered ? `<span style="margin-left:0.5rem; color:var(--secondary); font-size:0.8rem;">[Filtros activos: ${activeLabels.join(' | ')}]</span>` : '';

            counterEl.innerHTML = `
                <div>
                    <i class="fa-solid fa-filter"></i> 
                    Mostrando <span class="badge-count">${filteredRepairs.length}</span> paradas por reparación 
                    y <span class="badge-count">${filteredReplacements.length}</span> reemplazos.${filterDetails}
                </div>
            `;
        }

        // Pagination logic for filteredRepairs
        const totalPages = Math.ceil(filteredRepairs.length / HISTORY_PAGE_SIZE) || 1;
        if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
        if (historyCurrentPage < 1) historyCurrentPage = 1;

        const startIndex = (historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
        const pageRepairs = filteredRepairs.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);

        // Render Repairs Table Body
        repairsBody.innerHTML = '';
        if (filteredRepairs.length === 0) {
            repairsBody.innerHTML = `<tr><td colspan="11" style="text-align:center;" class="text-muted">No se encontraron paradas por reparación coincidentes.</td></tr>`;
        } else {
            pageRepairs.forEach(r => {
                const tr = document.createElement('tr');
                const attachHtml = r.attachment_path ? `
                    <a href="${r.attachment_path}" target="_blank" class="btn btn-outline btn-sm" style="color:var(--primary); border-color:rgba(6,182,212,0.3);" title="${r.attachment_name}">
                        <i class="fa-solid fa-paperclip"></i> ${r.attachment_name.length > 12 ? r.attachment_name.substring(0, 12) + '...' : r.attachment_name}
                    </a>
                ` : '<span class="text-muted">-</span>';

                tr.innerHTML = `
                    <td>#${r.id}</td>
                    <td><code style="cursor:pointer; color:var(--secondary);" class="btn-filter-this-serial" data-serial="${r.serial_number}" title="Filtrar historial por este serial">${r.serial_number}</code></td>
                    <td><strong>${r.inverter_id}</strong></td>
                    <td>Slot ${r.slot_number}</td>
                    <td>${formatDate(r.stop_time)}</td>
                    <td>${r.restart_time ? formatDate(r.restart_time) : '<span class="text-muted">En proceso</span>'}</td>
                    <td>${r.reason}</td>
                    <td>${r.diagnosis || '-'}</td>
                    <td><span class="status-tag ${r.status === 'open' ? 'in_repair' : 'operating'}">${r.status === 'open' ? 'Abierta' : 'Resuelta'}</span></td>
                    <td>${attachHtml}</td>
                    <td>
                        <div style="display:flex; gap:0.3rem;">
                            ${r.status === 'open' ? `
                                <button class="btn btn-success btn-sm btn-restart-action" data-repair-id="${r.id}" data-serial="${r.serial_number}">
                                    <i class="fa-solid fa-play"></i> Arrancar
                                </button>
                            ` : ''}
                            <button class="btn btn-outline btn-sm btn-edit-repair-action" data-repair-id="${r.id}">
                                <i class="fa-solid fa-pen"></i> Editar
                            </button>
                        </div>
                    </td>
                `;
                repairsBody.appendChild(tr);
            });
        }

        // Render Pagination Bar
        const pagContainer = document.getElementById('history-pagination-container');
        if (pagContainer) {
            if (filteredRepairs.length <= HISTORY_PAGE_SIZE) {
                pagContainer.innerHTML = '';
            } else {
                pagContainer.innerHTML = `
                    <div class="pagination-bar">
                        <button type="button" class="btn btn-outline btn-sm" id="btn-prev-history-page" ${historyCurrentPage <= 1 ? 'disabled' : ''}>
                            <i class="fa-solid fa-chevron-left"></i> Anterior
                        </button>
                        <span class="pagination-info">Página <strong>${historyCurrentPage}</strong> de <strong>${totalPages}</strong> (${filteredRepairs.length} paradas registradas)</span>
                        <button type="button" class="btn btn-outline btn-sm" id="btn-next-history-page" ${historyCurrentPage >= totalPages ? 'disabled' : ''}>
                            Siguiente <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    </div>
                `;

                const btnPrev = document.getElementById('btn-prev-history-page');
                const btnNext = document.getElementById('btn-next-history-page');
                if (btnPrev) btnPrev.onclick = () => { if (historyCurrentPage > 1) { historyCurrentPage--; renderHistory(); } };
                if (btnNext) btnNext.onclick = () => { if (historyCurrentPage < totalPages) { historyCurrentPage++; renderHistory(); } };
            }
        }

        // Render Replacements Table Body
        replacementsBody.innerHTML = '';
        if (filteredReplacements.length === 0) {
            replacementsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;" class="text-muted">No se encontraron reemplazos coincidentes.</td></tr>`;
        } else {
            filteredReplacements.forEach(rep => {
                const tr = document.createElement('tr');
                const attachHtml = rep.attachment_path ? `
                    <a href="${rep.attachment_path}" target="_blank" class="btn btn-outline btn-sm" style="color:var(--primary); border-color:rgba(6,182,212,0.3);" title="${rep.attachment_name}">
                        <i class="fa-solid fa-paperclip"></i> ${rep.attachment_name.length > 12 ? rep.attachment_name.substring(0, 12) + '...' : rep.attachment_name}
                    </a>
                ` : '<span class="text-muted">-</span>';

                tr.innerHTML = `
                    <td>#${rep.id}</td>
                    <td><strong>${rep.inverter_id}</strong></td>
                    <td>Slot ${rep.slot_number}</td>
                    <td><code style="color:#f87171; cursor:pointer;" class="btn-filter-this-serial" data-serial="${rep.old_serial}" title="Filtrar por serial saliente">${rep.old_serial}</code></td>
                    <td><code style="color:#34d399; cursor:pointer;" class="btn-filter-this-serial" data-serial="${rep.new_serial}" title="Filtrar por serial entrante">${rep.new_serial}</code></td>
                    <td>${formatDate(rep.timestamp)}</td>
                    <td>${rep.reason}</td>
                    <td>${rep.performed_by}</td>
                    <td>${attachHtml}</td>
                    <td>
                        <button class="btn btn-outline btn-sm btn-edit-replacement-action" data-replacement-id="${rep.id}">
                            <i class="fa-solid fa-pen"></i> Editar
                        </button>
                    </td>
                `;
                replacementsBody.appendChild(tr);
            });
        }

        // Bind inner actions
        repairsBody.querySelectorAll('.btn-restart-action').forEach(b => {
            b.onclick = () => openRestartModal(parseInt(b.dataset.repairId), b.dataset.serial);
        });

        repairsBody.querySelectorAll('.btn-edit-repair-action').forEach(b => {
            b.onclick = () => openEditRepairModal(parseInt(b.dataset.repairId));
        });

        replacementsBody.querySelectorAll('.btn-edit-replacement-action').forEach(b => {
            b.onclick = () => openEditReplacementModal(parseInt(b.dataset.replacementId));
        });

        // Quick click on code serial to filter history
        document.querySelectorAll('.btn-filter-this-serial').forEach(codeEl => {
            codeEl.onclick = () => {
                const serial = codeEl.dataset.serial;
                if (serial && serial !== 'NINGUNO') {
                    const serialInput = document.getElementById('history-filter-serial');
                    if (serialInput) serialInput.value = serial;
                    renderHistory();
                }
            };
        });
    }

    function navigateToHistoryWithFilter(filters = {}) {
        const invInput = document.getElementById('history-filter-inverter');
        const serialInput = document.getElementById('history-filter-serial');
        const statusInput = document.getElementById('history-filter-status');
        const searchInput = document.getElementById('history-filter-search');

        if (filters.inverter !== undefined && invInput) invInput.value = filters.inverter;
        if (filters.serial !== undefined && serialInput) serialInput.value = filters.serial;
        if (filters.status !== undefined && statusInput) statusInput.value = filters.status;
        if (filters.search !== undefined && searchInput) searchInput.value = filters.search;

        switchTab('history');
    }

    function bindHistoryFilterEvents() {
        const invInput = document.getElementById('history-filter-inverter');
        const serialInput = document.getElementById('history-filter-serial');
        const statusInput = document.getElementById('history-filter-status');
        const searchInput = document.getElementById('history-filter-search');

        const btnApply = document.getElementById('btn-history-apply-filters');
        const btnClear = document.getElementById('btn-history-clear-filters');

        // Bind explicit Apply button with notification
        if (btnApply) {
            btnApply.onclick = async (e) => {
                if (e) e.preventDefault();
                historyCurrentPage = 1;
                await renderHistory();
                showToast('Filtros aplicados correctamente');
            };
        }

        // Bind explicit Clear button with notification
        if (btnClear) {
            btnClear.onclick = async (e) => {
                if (e) e.preventDefault();
                historyCurrentPage = 1;
                if (invInput) invInput.value = '';
                if (serialInput) serialInput.value = '';
                if (statusInput) statusInput.value = 'all';
                if (searchInput) searchInput.value = '';
                await renderHistory();
                showToast('Filtros limpiados. Mostrando todo el historial');
            };
        }

        // Enter key inside text input fields
        [serialInput, searchInput].forEach(inp => {
            if (inp) {
                inp.onkeydown = async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        await renderHistory();
                        showToast('Filtros aplicados correctamente');
                    }
                };
            }
        });
    }

    // Modal Helpers & Openers
    function bindModalEvents() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            };
        });

        // Close on clicking overlay background
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.onclick = (e) => {
                if (e.target === m) m.classList.remove('active');
            };
        });
    }

    function openStopModal(invId, slotNum) {
        document.getElementById('stop-inverter-id').value = invId || 'A1';
        populateSlotDropdown('stop-inverter-id', 'stop-slot-number', slotNum);
        
        // Set default datetime to now in local time
        document.getElementById('stop-time').value = formatForDateTimeInput();
        document.getElementById('stop-reason').value = slotNum === 0 ? 'Parada general preventiva de unidad inversora' : '';
        document.getElementById('stop-diagnosis').value = '';

        modalStop.classList.add('active');
    }

    function openRestartModal(repairId, serial) {
        document.getElementById('restart-repair-id').value = repairId;
        document.getElementById('restart-serial-info').value = serial;
        
        document.getElementById('restart-time').value = formatForDateTimeInput();
        document.getElementById('restart-diagnosis').value = '';

        modalRestart.classList.add('active');
    }

    function openRestartInverterModal(inverterId) {
        document.getElementById('restart-repair-id').value = 0;
        document.getElementById('restart-serial-info').value = `TODOS LOS MÓDULOS DE UNIDAD INVERSORA ${inverterId}`;
        
        document.getElementById('restart-time').value = formatForDateTimeInput();
        document.getElementById('restart-diagnosis').value = 'Reanudación general de servicio tras mantenimiento de unidad';

        modalRestart.classList.add('active');
    }

    function openReplaceModal(invId, slotNum, currentSerial) {
        document.getElementById('replace-inverter-id').value = invId || 'A1';
        populateSlotDropdown('replace-inverter-id', 'replace-slot-number', slotNum);
        document.getElementById('replace-old-serial').value = currentSerial || '';

        // Populate spares dropdown
        const selectNew = document.getElementById('replace-new-serial-select');
        selectNew.innerHTML = '<option value="">-- Seleccionar Módulo de Respaldo --</option>';
        sparesData.forEach(sp => {
            selectNew.innerHTML += `<option value="${sp.serial_number}">${sp.serial_number} (Respaldo)</option>`;
        });

        document.getElementById('replace-timestamp').value = formatForDateTimeInput();
        document.getElementById('replace-reason').value = '';

        modalReplace.classList.add('active');
    }

    function openEditSerialModal(oldSerial) {
        document.getElementById('edit-serial-old-input').value = oldSerial;
        document.getElementById('edit-serial-old-display').value = oldSerial;
        document.getElementById('edit-serial-new-input').value = oldSerial;
        document.getElementById('modal-edit-serial').classList.add('active');
    }

    function openEditRepairModal(repairId) {
        const r = logsData.repairs.find(item => item.id === repairId);
        if (!r) return;

        document.getElementById('edit-repair-id-input').value = r.id;
        document.getElementById('edit-repair-serial-display').value = r.serial_number;
        document.getElementById('edit-repair-location-display').value = `Inversor ${r.inverter_id} - Slot ${r.slot_number}`;
        document.getElementById('edit-repair-stop-time').value = formatForDateTimeInput(r.stop_time);
        document.getElementById('edit-repair-restart-time').value = r.restart_time ? formatForDateTimeInput(r.restart_time) : '';
        document.getElementById('edit-repair-reason').value = r.reason || '';
        document.getElementById('edit-repair-diagnosis').value = r.diagnosis || '';

        document.getElementById('modal-edit-repair-event').classList.add('active');
    }

    function openEditReplacementModal(repId) {
        const rep = logsData.replacements.find(item => item.id === repId);
        if (!rep) return;

        document.getElementById('edit-replacement-id-input').value = rep.id;
        document.getElementById('edit-rep-old-display').value = rep.old_serial;
        document.getElementById('edit-rep-new-display').value = rep.new_serial;
        document.getElementById('edit-rep-timestamp').value = formatForDateTimeInput(rep.timestamp);
        document.getElementById('edit-rep-technician').value = rep.performed_by || 'Técnico Solar';
        document.getElementById('edit-rep-reason').value = rep.reason || '';

        document.getElementById('modal-edit-replacement-event').classList.add('active');
    }

    function formatForDateTimeInput(dateStr) {
        if (!dateStr) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const mins = String(now.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${mins}`;
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${mins}`;
    }

    function openEditInstallDateModal(invId, slotNum, currentSerial, currentInstalledAt) {
        document.getElementById('edit-install-inv-input').value = invId;
        document.getElementById('edit-install-slot-input').value = slotNum;
        document.getElementById('edit-install-location-display').value = `Inversor ${invId} - Slot ${slotNum}`;
        document.getElementById('edit-install-serial-display').value = currentSerial;

        document.getElementById('edit-install-date-input').value = formatForDateTimeInput(currentInstalledAt);
        document.getElementById('modal-edit-install-date').classList.add('active');
    }

    function populateSlotDropdown(invSelectId, slotSelectId, selectedSlotNum) {
        const invId = document.getElementById(invSelectId).value;
        const slotSelect = document.getElementById(slotSelectId);
        slotSelect.innerHTML = '';

        if (invSelectId === 'stop-inverter-id') {
            const optAll = document.createElement('option');
            optAll.value = 0;
            optAll.textContent = '🚨 TODA LA UNIDAD INVERSORA (Parada General)';
            if (selectedSlotNum === 0) optAll.selected = true;
            slotSelect.appendChild(optAll);
        }

        const maxSlots = invId === 'E1' ? 4 : 6;
        for (let i = 1; i <= maxSlots; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Slot ${i} ${invId === 'E1' ? '(Especial E1)' : ''}`;
            if (i === selectedSlotNum) opt.selected = true;
            slotSelect.appendChild(opt);
        }
    }

    // Dynamic slot dropdown updates when inverter selection changes in modals
    document.getElementById('stop-inverter-id').onchange = () => populateSlotDropdown('stop-inverter-id', 'stop-slot-number', 1);
    document.getElementById('replace-inverter-id').onchange = () => {
        populateSlotDropdown('replace-inverter-id', 'replace-slot-number', 1);
        // update old serial field based on selected slot
        const invId = document.getElementById('replace-inverter-id').value;
        const inv = invertersData.find(i => i.id === invId);
        if (inv && inv.slots.length > 0) {
            document.getElementById('replace-old-serial').value = inv.slots[0].current_serial;
        }
    };

    document.getElementById('replace-slot-number').onchange = () => {
        const invId = document.getElementById('replace-inverter-id').value;
        const slotNum = parseInt(document.getElementById('replace-slot-number').value);
        const inv = invertersData.find(i => i.id === invId);
        if (inv) {
            const slot = inv.slots.find(s => s.slot_number === slotNum);
            if (slot) document.getElementById('replace-old-serial').value = slot.current_serial;
        }
    };

    async function uploadFileIfSelected(fileInputId) {
        const input = document.getElementById(fileInputId);
        if (!input || !input.files || input.files.length === 0) {
            return { attachment_path: null, attachment_name: null };
        }
        const file = input.files[0];
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Error al subir archivo adjunto');
        return await res.json();
    }

    // Bind Forms Submission
    function bindFormEvents() {
        // Form 1: Stop Repair
        document.getElementById('form-stop-repair').onsubmit = async (e) => {
            e.preventDefault();
            const invId = document.getElementById('stop-inverter-id').value;
            const slotNum = parseInt(document.getElementById('stop-slot-number').value);
            const stopTime = document.getElementById('stop-time').value;
            const reason = document.getElementById('stop-reason').value;
            const diagnosis = document.getElementById('stop-diagnosis').value;

            try {
                const uploadRes = await uploadFileIfSelected('stop-file-input');

                const res = await fetch('/api/repairs/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inverter_id: invId,
                        slot_number: slotNum,
                        stop_time: stopTime,
                        reason: reason,
                        diagnosis: diagnosis,
                        attachment_path: uploadRes.attachment_path,
                        attachment_name: uploadRes.attachment_name
                    })
                });

                if (!res.ok) throw new Error((await res.json()).detail);
                
                showToast(slotNum === 0 ? `Parada total registrada para Unidad ${invId}` : 'Parada por reparación registrada exitosamente');
                modalStop.classList.remove('active');
                document.getElementById('stop-file-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 2: Restart Repair
        document.getElementById('form-restart-repair').onsubmit = async (e) => {
            e.preventDefault();
            const repairId = parseInt(document.getElementById('restart-repair-id').value);
            const restartTime = document.getElementById('restart-time').value;
            const diagnosis = document.getElementById('restart-diagnosis').value.trim();

            if (!diagnosis) {
                showToast('Es obligatorio ingresar un diagnóstico final o solución aplicada antes de reiniciar.', 'error');
                return;
            }

            try {
                const uploadRes = await uploadFileIfSelected('restart-file-input');

                if (repairId === 0) {
                    const currentInv = ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(currentTab) ? currentTab : 'A1';
                    const res = await fetch('/api/repairs/restart-inverter', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            inverter_id: currentInv,
                            restart_time: restartTime,
                            diagnosis: diagnosis,
                            attachment_path: uploadRes.attachment_path,
                            attachment_name: uploadRes.attachment_name
                        })
                    });

                    if (!res.ok) throw new Error((await res.json()).detail);

                    showToast(`Unidad Inversora ${currentInv} totalmente restablecida a servicio`);
                } else {
                    const res = await fetch('/api/repairs/restart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            repair_id: repairId,
                            restart_time: restartTime,
                            diagnosis: diagnosis,
                            attachment_path: uploadRes.attachment_path,
                            attachment_name: uploadRes.attachment_name
                        })
                    });

                    if (!res.ok) throw new Error((await res.json()).detail);

                    showToast('Módulo arrancado y restituido a servicio');
                }

                modalRestart.classList.remove('active');
                document.getElementById('restart-file-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 3: Replace Module
        document.getElementById('form-replace-module').onsubmit = async (e) => {
            e.preventDefault();
            const invId = document.getElementById('replace-inverter-id').value;
            const slotNum = parseInt(document.getElementById('replace-slot-number').value);
            const selectedSpare = document.getElementById('replace-new-serial-select').value;
            const customSpare = document.getElementById('replace-new-serial-custom').value.trim();
            const newSerial = customSpare || selectedSpare;

            if (!newSerial) {
                showToast('Por favor seleccione o escriba un número serial para el nuevo módulo', 'error');
                return;
            }

            const timestamp = document.getElementById('replace-timestamp').value;
            const reason = document.getElementById('replace-reason').value;
            const tech = document.getElementById('replace-technician').value;

            try {
                const uploadRes = await uploadFileIfSelected('replace-file-input');

                const res = await fetch('/api/replacements', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inverter_id: invId,
                        slot_number: slotNum,
                        new_serial: newSerial,
                        reason: reason,
                        timestamp: timestamp,
                        performed_by: tech,
                        attachment_path: uploadRes.attachment_path,
                        attachment_name: uploadRes.attachment_name
                    })
                });

                if (!res.ok) throw new Error((await res.json()).detail);

                showToast(`Reemplazo de módulo registrado: ${newSerial}`);
                modalReplace.classList.remove('active');
                document.getElementById('replace-file-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 4: Add Spare
        document.getElementById('form-add-spare').onsubmit = async (e) => {
            e.preventDefault();
            const serial = document.getElementById('spare-serial-input').value.trim();
            if (!serial) return;

            try {
                const res = await fetch('/api/spares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serial_number: serial })
                });

                if (!res.ok) throw new Error((await res.json()).detail);

                showToast(`Módulo de repuesto ${serial} agregado al inventario`);
                modalAddSpare.classList.remove('active');
                document.getElementById('spare-serial-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 5: Edit Serial
        document.getElementById('form-edit-serial').onsubmit = async (e) => {
            e.preventDefault();
            const oldSerial = document.getElementById('edit-serial-old-input').value;
            const newSerial = document.getElementById('edit-serial-new-input').value.trim();
            if (!newSerial) return;

            try {
                const res = await fetch(`/api/modules/${encodeURIComponent(oldSerial)}/edit-serial`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_serial: newSerial })
                });
                if (!res.ok) throw new Error((await res.json()).detail);

                showToast(`Serial actualizado: ${newSerial}`);
                document.getElementById('modal-edit-serial').classList.remove('active');
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 6: Edit Repair Event
        document.getElementById('form-edit-repair-event').onsubmit = async (e) => {
            e.preventDefault();
            const repairId = parseInt(document.getElementById('edit-repair-id-input').value);
            const stopTime = document.getElementById('edit-repair-stop-time').value;
            const restartTime = document.getElementById('edit-repair-restart-time').value || null;
            const reason = document.getElementById('edit-repair-reason').value.trim();
            const diagnosis = document.getElementById('edit-repair-diagnosis').value.trim();

            if (restartTime && !diagnosis) {
                showToast('No se puede registrar fecha de arranque sin especificar un diagnóstico final o solución aplicada.', 'error');
                return;
            }

            try {
                const uploadRes = await uploadFileIfSelected('edit-repair-file-input');

                const res = await fetch(`/api/repairs/${repairId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stop_time: stopTime,
                        restart_time: restartTime,
                        reason: reason,
                        diagnosis: diagnosis,
                        attachment_path: uploadRes.attachment_path,
                        attachment_name: uploadRes.attachment_name
                    })
                });

                if (!res.ok) throw new Error((await res.json()).detail);

                showToast('Registro de reparación corregido exitosamente');
                document.getElementById('modal-edit-repair-event').classList.remove('active');
                document.getElementById('edit-repair-file-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 7: Edit Replacement Event
        document.getElementById('form-edit-replacement-event').onsubmit = async (e) => {
            e.preventDefault();
            const repId = parseInt(document.getElementById('edit-replacement-id-input').value);
            const timestamp = document.getElementById('edit-rep-timestamp').value;
            const reason = document.getElementById('edit-rep-reason').value;
            const tech = document.getElementById('edit-rep-technician').value;

            try {
                const uploadRes = await uploadFileIfSelected('edit-rep-file-input');

                const res = await fetch(`/api/replacements/${repId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        timestamp: timestamp,
                        reason: reason,
                        performed_by: tech,
                        attachment_path: uploadRes.attachment_path,
                        attachment_name: uploadRes.attachment_name
                    })
                });

                if (!res.ok) throw new Error((await res.json()).detail);

                showToast('Registro de reemplazo corregido exitosamente');
                document.getElementById('modal-edit-replacement-event').classList.remove('active');
                document.getElementById('edit-rep-file-input').value = '';
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        // Form 8: Edit Install Date
        const formEditInstall = document.getElementById('form-edit-install-date');
        if (formEditInstall) {
            formEditInstall.onsubmit = async (e) => {
                e.preventDefault();
                const invId = document.getElementById('edit-install-inv-input').value;
                const slotNum = parseInt(document.getElementById('edit-install-slot-input').value);
                const installDate = document.getElementById('edit-install-date-input').value;

                try {
                    const res = await fetch(`/api/slots/${invId}/${slotNum}/installed-at`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ installed_at: installDate })
                    });

                    if (!res.ok) throw new Error((await res.json()).detail);

                    showToast(`Fecha de instalación actualizada para Inversor ${invId} Slot ${slotNum}`);
                    document.getElementById('modal-edit-install-date').classList.remove('active');
                    await loadAllData();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            };
        }
    }

    // Action Buttons Wiring
    function bindActionButtons() {
        document.getElementById('btn-quick-stop').onclick = () => {
            const currentInv = ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(currentTab) ? currentTab : 'A1';
            openStopModal(currentInv, 1);
        };

        document.getElementById('btn-stop-inverter-all').onclick = () => {
            const currentInv = ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(currentTab) ? currentTab : 'A1';
            openStopModal(currentInv, 0);
        };

        document.getElementById('btn-restart-inverter-all').onclick = async () => {
            const currentInv = ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(currentTab) ? currentTab : 'A1';
            if (!confirm(`¿Confirma el ARRANQUE TOTAL de la Unidad Inversora ${currentInv}? Todos los módulos reanudarán operación.`)) return;

            const nowIso = new Date().toISOString().slice(0, 16);
            try {
                const res = await fetch('/api/repairs/restart-inverter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inverter_id: currentInv,
                        restart_time: nowIso,
                        diagnosis: 'Restablecimiento general de la unidad inversora'
                    })
                });

                if (!res.ok) throw new Error((await res.json()).detail);

                showToast(`Unidad Inversora ${currentInv} totalmente restablecida a servicio`);
                await loadAllData();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        document.getElementById('btn-quick-replace').onclick = () => {
            const currentInv = ['A1','A2','B1','B2','C1','C2','D1','E1'].includes(currentTab) ? currentTab : 'A1';
            const inv = invertersData.find(i => i.id === currentInv);
            const serial = inv && inv.slots.length > 0 ? inv.slots[0].current_serial : '';
            openReplaceModal(currentInv, 1, serial);
        };

        document.getElementById('btn-add-spare').onclick = () => {
            modalAddSpare.classList.add('active');
        };

        // Seed Reset (Demo)
        document.getElementById('btn-seed-reset').onclick = async () => {
            if (!confirm('¿Confirma reiniciar la base de datos a los valores iniciales de prueba?')) return;
            try {
                await fetch('/api/seed/reset', { method: 'POST' });
                showToast('Base de datos reiniciada con datos de demostración');
                await loadAllData();
            } catch (err) {
                showToast('Error al reiniciar base de datos', 'error');
            }
        };

        // Clean DB for Real Production Entry
        const btnClean = document.getElementById('btn-seed-clean');
        if (btnClean) {
            btnClean.onclick = async () => {
                if (!confirm('¿Confirma eliminar todos los registros de paradas, reemplazos y restablecer las horas acumuladas a CERO?\n\nNOTA: Todos los números seriales que hayas registrado se CONSERVARÁN intactos.')) return;
                try {
                    const res = await fetch('/api/seed/clean', { method: 'POST' });
                    if (!res.ok) throw new Error((await res.json()).detail);

                    showToast('Horas restablecidas a CERO y fallas eliminadas. Seriales conservados.');
                    await loadAllData();
                } catch (err) {
                    showToast('Error al limpiar la base de datos', 'error');
                }
            };
        }

        // Export to CSV
        document.getElementById('btn-export-csv').onclick = exportHistoryToCSV;
    }

    // Export History Logs to CSV (respecting active filters)
    function exportHistoryToCSV() {
        const invFilter = (document.getElementById('history-filter-inverter')?.value || '').trim();
        const serialFilter = (document.getElementById('history-filter-serial')?.value || '').trim().toLowerCase();
        const statusFilter = (document.getElementById('history-filter-status')?.value || 'all').trim().toLowerCase();
        const searchFilter = (document.getElementById('history-filter-search')?.value || '').trim().toLowerCase();

        const filteredRepairs = logsData.repairs.filter(r => {
            if (invFilter && (r.inverter_id || '').toUpperCase() !== invFilter.toUpperCase()) return false;
            if (serialFilter && !(r.serial_number || '').toLowerCase().includes(serialFilter)) return false;
            if (statusFilter !== 'all' && (r.status || '').toLowerCase() !== statusFilter) return false;
            if (searchFilter) {
                const matchReason = (r.reason || '').toLowerCase().includes(searchFilter);
                const matchDiag = (r.diagnosis || '').toLowerCase().includes(searchFilter);
                const matchSerial = (r.serial_number || '').toLowerCase().includes(searchFilter);
                const matchInv = (r.inverter_id || '').toLowerCase().includes(searchFilter);
                if (!matchReason && !matchDiag && !matchSerial && !matchInv) return false;
            }
            return true;
        });

        const filteredReplacements = logsData.replacements.filter(rep => {
            if (invFilter && (rep.inverter_id || '').toUpperCase() !== invFilter.toUpperCase()) return false;
            if (serialFilter) {
                const matchOld = (rep.old_serial || '').toLowerCase().includes(serialFilter);
                const matchNew = (rep.new_serial || '').toLowerCase().includes(serialFilter);
                if (!matchOld && !matchNew) return false;
            }
            if (searchFilter) {
                const matchReason = (rep.reason || '').toLowerCase().includes(searchFilter);
                const matchTech = (rep.performed_by || '').toLowerCase().includes(searchFilter);
                const matchOld = (rep.old_serial || '').toLowerCase().includes(searchFilter);
                const matchNew = (rep.new_serial || '').toLowerCase().includes(searchFilter);
                const matchInv = (rep.inverter_id || '').toLowerCase().includes(searchFilter);
                if (!matchReason && !matchTech && !matchOld && !matchNew && !matchInv) return false;
            }
            return true;
        });

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "TIPO_REGISTRO,ID,INVERSOR,SLOT,SERIAL,FECHA_INICIO,FECHA_FIN_O_MOTIVO,ESTADO_O_TECNICO\n";

        filteredRepairs.forEach(r => {
            csvContent += `PARADA,${r.id},${r.inverter_id},${r.slot_number},${r.serial_number},"${r.stop_time}","${r.reason}",${r.status}\n`;
        });

        filteredReplacements.forEach(rep => {
            csvContent += `REEMPLAZO,${rep.id},${rep.inverter_id},${rep.slot_number},"${rep.old_serial}->${rep.new_serial}","${rep.timestamp}","${rep.reason}",${rep.performed_by}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `historial_mantenimiento_filtrado_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Toast Notifications
    function showToast(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = type === 'error' ? `<i class="fa-solid fa-circle-exclamation"></i> ${msg}` : `<i class="fa-solid fa-circle-check"></i> ${msg}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    // Format Date helper (deterministic cross-browser component rendering)
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        let cleanStr = String(dateStr).replace('Z', '');
        const d = new Date(cleanStr.includes('T') ? cleanStr : cleanStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return String(dateStr);

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year}, ${hours}:${mins}`;
    }
});
