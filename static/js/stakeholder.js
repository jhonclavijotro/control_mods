/* ==========================================================================
   SOLARIS CONTROL - STAKEHOLDER EXECUTIVE DASHBOARD LOGIC (v4.0)
   ========================================================================== */

// --- GLOBAL STATE VARIABLES (Top declaration to prevent TDZ) ---
let invertersData = [];
let modulesData = [];
let currentPeriod = "month";
let currentTheme = localStorage.getItem("solaris_theme") || "dark";

// Stored Counts for Donut Chart (Avoids default 2-repair bug)
let latestOpCount = 46;
let latestRepCount = 0;

// Chart Instances Registry
let healthDonutChart = null;
let modulesP1Chart = null;
let modulesP2Chart = null;
let inverterDonutCharts = {}; // Map of inverter_id -> Chart instance

let authToken = localStorage.getItem('solaris_token') || null;
let currentUser = null;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    initStakeholderApp();
});

async function initStakeholderApp() {
    try {
        applyTheme(currentTheme);
    } catch (err) {
        console.error("Error al aplicar tema inicial:", err);
    }

    try {
        setupEventListeners();
    } catch (err) {
        console.error("Error al registrar eventos:", err);
    }

    const isValidSession = await checkAuthSessionStakeholder();
    if (isValidSession) {
        try {
            loadStakeholderData();
        } catch (err) {
            console.error("Error al cargar datos iniciales:", err);
        }

        // Auto-refresh data every 30 seconds
        try {
            autoRefreshTimer = setInterval(() => {
                loadStakeholderData(true);
            }, 30000);
        } catch (err) {
            console.error("Error al iniciar auto-refresh:", err);
        }
    }
}

async function checkAuthSessionStakeholder() {
    const userBadge = document.getElementById('user-profile-badge');

    if (!authToken) {
        window.location.href = '/login';
        return false;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error("Sesión expirada");
        currentUser = await res.json();

        if (userBadge) userBadge.style.display = 'inline-flex';

        const nameEl = document.getElementById('user-display-name');
        const roleEl = document.getElementById('user-role-badge');
        if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.username;
        if (roleEl) {
            roleEl.textContent = currentUser.role.toUpperCase();
            roleEl.className = `role-badge role-badge-${currentUser.role}`;
        }
        return true;
    } catch (err) {
        localStorage.removeItem('solaris_token');
        authToken = null;
        currentUser = null;
        window.location.href = '/login';
        return false;
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Logout Button
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
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
                const res = await fetch('/api/export/xlsx', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
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

    // Theme Toggle
    const themeBtn = document.getElementById("btn-theme-toggle");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            currentTheme = currentTheme === "dark" ? "light" : "dark";
            localStorage.setItem("solaris_theme", currentTheme);
            applyTheme(currentTheme);
            renderAllCharts();
        });
    }

    // Period Select in Disponibilidad Tab
    const periodSelect = document.getElementById("select-period-disponibilidad");
    if (periodSelect) {
        periodSelect.addEventListener("change", (e) => {
            currentPeriod = e.target.value;
            showToast(`Filtro cambiado a: ${periodSelect.options[periodSelect.selectedIndex].text}`, "info");
            loadStakeholderData();
        });
    }

    // Navigation Pills
    const navMain = document.getElementById("nav-btn-main");
    const navDisp = document.getElementById("nav-btn-disponibilidad");
    const navSubp = document.getElementById("nav-btn-subplantas");
    const navStock = document.getElementById("nav-btn-stock");

    if (navMain) navMain.addEventListener("click", () => switchTab("tab-exec-main", navMain));
    if (navDisp) navDisp.addEventListener("click", () => switchTab("tab-exec-disponibilidad", navDisp));
    if (navSubp) navSubp.addEventListener("click", () => switchTab("tab-exec-subplantas", navSubp));
    if (navStock) navStock.addEventListener("click", () => switchTab("tab-exec-stock", navStock));

    // KPI Cards Click Handlers
    const cardDisp = document.getElementById("card-kpi-disponibilidad");
    const cardSubp = document.getElementById("card-kpi-subplantas");
    const cardStock = document.getElementById("card-kpi-stock");

    if (cardDisp) cardDisp.addEventListener("click", () => switchTab("tab-exec-disponibilidad", navDisp));
    if (cardSubp) cardSubp.addEventListener("click", () => switchTab("tab-exec-subplantas", navSubp));
    if (cardStock) cardStock.addEventListener("click", () => switchTab("tab-exec-stock", navStock));

    // Back to Main Buttons
    const backBtns = document.querySelectorAll(".btn-back-main");
    backBtns.forEach(btn => {
        btn.addEventListener("click", () => switchTab("tab-exec-main", navMain));
    });
}

// --- TAB NAVIGATION ---
function switchTab(tabId, navBtnElement = null) {
    const panes = document.querySelectorAll(".stakeholder-tab-pane");
    panes.forEach(pane => pane.classList.remove("active"));

    const pills = document.querySelectorAll(".nav-pill");
    pills.forEach(pill => pill.classList.remove("active"));

    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.classList.add("active");
    }

    if (navBtnElement) {
        navBtnElement.classList.add("active");
    } else {
        if (tabId === "tab-exec-main") document.getElementById("nav-btn-main")?.classList.add("active");
        if (tabId === "tab-exec-disponibilidad") document.getElementById("nav-btn-disponibilidad")?.classList.add("active");
        if (tabId === "tab-exec-subplantas") document.getElementById("nav-btn-subplantas")?.classList.add("active");
        if (tabId === "tab-exec-stock") document.getElementById("nav-btn-stock")?.classList.add("active");
    }

    // Re-render charts when switching tabs to ensure proper canvas sizing
    setTimeout(() => renderAllCharts(), 60);
}

// --- THEME MANAGEMENT ---
function applyTheme(theme) {
    if (theme === "light") {
        document.body.classList.add("light-theme");
    } else {
        document.body.classList.remove("light-theme");
    }

    const icon = document.getElementById("theme-toggle-icon");
    const text = document.getElementById("theme-toggle-text");
    if (icon) icon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    if (text) text.textContent = theme === "light" ? "Tema Claro" : "Tema Oscuro";
}

// --- DATA FETCHING ---
async function loadStakeholderData(silent = false) {
    try {
        const [invertersRes, modulesRes] = await Promise.all([
            fetch(`/api/inverters?period=${currentPeriod}`),
            fetch(`/api/modules`)
        ]);

        if (!invertersRes.ok) throw new Error("Error al obtener telemetría de inversores.");
        if (!modulesRes.ok) throw new Error("Error al obtener inventario de módulos.");

        invertersData = await invertersRes.json();
        modulesData = await modulesRes.json();

        updateStakeholderUI();
    } catch (err) {
        console.error("Falla al cargar datos de Stakeholders:", err);
        showToast("Error de conexión con la API REST.", "error");
    }
}

// --- MAIN UI DISPATCHER ---
function updateStakeholderUI() {
    if (!Array.isArray(invertersData)) return;

    let totalActiveSlots = 0;
    let operatingSlotsCount = 0;
    let repairSlotsCount = 0;

    let p1Operating = 0;
    let p1Total = 0;
    let p2Operating = 0;
    let p2Total = 0;

    let totalAvailSum = 0;
    let invCount = invertersData.length;

    invertersData.forEach(inv => {
        let isP1 = ["A1", "A2", "B1", "B2"].includes(inv.id);
        let slots = inv.slots || [];

        let invAvailSum = 0;
        slots.forEach(slot => {
            totalActiveSlots++;
            if (isP1) p1Total++; else p2Total++;

            let uptime = slot.metrics?.uptime_percent !== undefined ? slot.metrics.uptime_percent : 100.0;
            invAvailSum += uptime;

            if (slot.status === "in_repair") {
                repairSlotsCount++;
            } else {
                operatingSlotsCount++;
                if (isP1) p1Operating++; else p2Operating++;
            }
        });

        let invAvgAvail = slots.length > 0 ? (invAvailSum / slots.length) : 100.0;
        inv.computed_availability = invAvgAvail;
        totalAvailSum += invAvgAvail;
    });

    // Save counts to global state
    latestOpCount = operatingSlotsCount;
    latestRepCount = repairSlotsCount;

    const spareModules = Array.isArray(modulesData) ? modulesData.filter(m => m.status === "spare") : [];
    const spareCount = spareModules.length;

    const plantHealthRatio = totalActiveSlots > 0 ? (operatingSlotsCount / totalActiveSlots) * 100 : 100;
    const globalAvailAvg = invCount > 0 ? (totalAvailSum / invCount) : 100;

    // 1. Update Hero Donut Card & Metrics
    const healthValEl = document.getElementById("health-percentage-val");
    if (healthValEl) healthValEl.textContent = `${plantHealthRatio.toFixed(1)}%`;

    const opCountEl = document.getElementById("health-op-count");
    if (opCountEl) opCountEl.textContent = `${operatingSlotsCount} / ${totalActiveSlots}`;

    const repairCountEl = document.getElementById("health-repair-count");
    if (repairCountEl) repairCountEl.textContent = `${repairSlotsCount}`;

    const stockCountEl = document.getElementById("health-stock-count");
    if (stockCountEl) stockCountEl.textContent = `${spareCount}`;

    const badgeEl = document.getElementById("health-status-badge");
    if (badgeEl) {
        if (plantHealthRatio >= 95) {
            badgeEl.className = "status-badge badge-success";
            badgeEl.textContent = "Salud Óptima";
        } else if (plantHealthRatio >= 80) {
            badgeEl.className = "status-badge badge-warning";
            badgeEl.textContent = "Atención Requerida";
        } else {
            badgeEl.className = "status-badge badge-danger";
            badgeEl.textContent = "Estado Crítico";
        }
    }

    // 2. Update KPI Cards Values
    const kpiAvailEl = document.getElementById("exec-kpi-availability");
    if (kpiAvailEl) kpiAvailEl.textContent = `${globalAvailAvg.toFixed(1)}%`;

    const kpiSparesEl = document.getElementById("exec-kpi-spares");
    if (kpiSparesEl) kpiSparesEl.textContent = `${spareCount} Módulos`;

    // 3. Render Views
    renderInstalledModulesTables();
    renderSubplantHeaders(p1Operating, p1Total, p2Operating, p2Total);
    renderStockModulesTable(spareModules);
    renderAllCharts();
}

// --- RENDER TAB 2: DISPONIBILIDAD (SEPARADA POR PALMASECA 1 Y PALMASECA 2) ---
function renderInstalledModulesTables() {
    const tbodyP1 = document.getElementById("tbody-modules-p1");
    const tbodyP2 = document.getElementById("tbody-modules-p2");
    if (!tbodyP1 || !tbodyP2 || !Array.isArray(invertersData)) return;

    let rowsP1 = [];
    let rowsP2 = [];

    invertersData.forEach(inv => {
        let isP1 = ["A1", "A2", "B1", "B2"].includes(inv.id);
        let slots = inv.slots || [];

        slots.forEach(slot => {
            let metrics = slot.metrics || {};
            let isOperating = slot.status !== "in_repair";
            let statusBadge = isOperating 
                ? `<span class="status-badge badge-success"><i class="fa-solid fa-circle-check"></i> Activo</span>`
                : `<span class="status-badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Inactivo</span>`;

            let uptimePct = metrics.uptime_percent !== undefined ? metrics.uptime_percent : 100.0;
            let downtimePct = (100.0 - uptimePct).toFixed(1);
            let opHours = metrics.net_operating_hours !== undefined ? metrics.net_operating_hours.toFixed(1) : "0.0";
            
            let installedDateStr = slot.installed_at 
                ? formatDateString(slot.installed_at)
                : "13/08/2026 07:00 AM";

            let rowHtml = `
                <tr>
                    <td><strong class="text-primary font-mono">${slot.current_serial}</strong></td>
                    <td><strong>Inversor ${inv.id}</strong></td>
                    <td>Slot ${slot.slot_number}</td>
                    <td>${statusBadge}</td>
                    <td>${installedDateStr}</td>
                    <td><strong>${opHours} hrs</strong></td>
                    <td><strong class="${downtimePct > 0 ? 'text-danger' : 'text-success'}">${downtimePct}%</strong></td>
                </tr>
            `;

            if (isP1) {
                rowsP1.push(rowHtml);
            } else {
                rowsP2.push(rowHtml);
            }
        });
    });

    tbodyP1.innerHTML = rowsP1.length > 0 ? rowsP1.join("") : `<tr><td colspan="7" class="text-center py-4">No hay módulos en Palmaseca 1.</td></tr>`;
    tbodyP2.innerHTML = rowsP2.length > 0 ? rowsP2.join("") : `<tr><td colspan="7" class="text-center py-4">No hay módulos en Palmaseca 2.</td></tr>`;
}

// --- RENDER SUBPLANT HEADERS & BADGES ---
function renderSubplantHeaders(p1Op, p1Tot, p2Op, p2Tot) {
    const p1Pct = p1Tot > 0 ? (p1Op / p1Tot) * 100 : 100;
    const p2Pct = p2Tot > 0 ? (p2Op / p2Tot) * 100 : 100;

    const p1BadgeEl = document.getElementById("p1-health-badge-detail");
    if (p1BadgeEl) {
        p1BadgeEl.textContent = `${p1Pct.toFixed(1)}% Salud`;
        p1BadgeEl.className = p1Pct >= 95 ? "status-badge badge-success" : (p1Pct >= 80 ? "status-badge badge-warning" : "status-badge badge-danger");
    }
    const p1OpBadge = document.getElementById("p1-op-badge");
    if (p1OpBadge) p1OpBadge.textContent = `${p1Op} / ${p1Tot} Módulos Operativos`;

    const p2BadgeEl = document.getElementById("p2-health-badge-detail");
    if (p2BadgeEl) {
        p2BadgeEl.textContent = `${p2Pct.toFixed(1)}% Salud`;
        p2BadgeEl.className = p2Pct >= 95 ? "status-badge badge-success" : (p2Pct >= 80 ? "status-badge badge-warning" : "status-badge badge-danger");
    }
    const p2OpBadge = document.getElementById("p2-op-badge");
    if (p2OpBadge) p2OpBadge.textContent = `${p2Op} / ${p2Tot} Módulos Operativos`;
}

// --- RENDER TAB 4: STOCK DE RESERVA ---
function renderStockModulesTable(spareModules) {
    const tbody = document.getElementById("tbody-stock-modules");
    if (!tbody) return;

    if (!Array.isArray(spareModules) || spareModules.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">No hay módulos en inventario de reserva.</td></tr>`;
        return;
    }

    let rows = spareModules.map(pm => {
        let regDate = pm.registered_at ? formatDateString(pm.registered_at) : "N/A";
        return `
            <tr>
                <td><strong class="text-info font-mono">${pm.serial_number}</strong></td>
                <td><span class="status-badge badge-info"><i class="fa-solid fa-box"></i> Disponible en Reserva</span></td>
                <td>Almacén Central de Contingencias</td>
                <td>${regDate}</td>
                <td>${pm.total_repairs || 0} reparaciones previas</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join("");
}

// --- ALL CHARTS RENDERING ENGINE ---
function renderAllCharts() {
    const isLight = currentTheme === "light";
    const gridColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
    const textColor = isLight ? "#1e293b" : "#9ca3af";

    const opCount = latestOpCount;
    const repCount = latestRepCount;

    // 1. Donut Chart - Salud General de Planta (Strictly uses latestOpCount & latestRepCount)
    const canvasDonut = document.getElementById("chart-plant-health");
    if (canvasDonut && typeof Chart !== "undefined") {
        if (healthDonutChart) healthDonutChart.destroy();

        healthDonutChart = new Chart(canvasDonut.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: ["Operativos", "En Reparación"],
                datasets: [{
                    data: [opCount, repCount],
                    backgroundColor: ["#10b981", "#ef4444"],
                    borderColor: isLight ? "#ffffff" : "#151c2e",
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "78%",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ` ${ctx.label}: ${ctx.raw} unidades`; }
                        }
                    }
                }
            }
        });
    }

    if (!Array.isArray(invertersData) || invertersData.length === 0) return;

    // 2. MINI DONUTS DE CADA INVERSOR (A1, A2, B1, B2, C1, C2, D1, E1)
    invertersData.forEach(inv => {
        const invId = inv.id;
        const canvasInv = document.getElementById(`donut-inv-${invId}`);
        const labelInv = document.getElementById(`label-inv-${invId}`);
        const subInv = document.getElementById(`sub-inv-${invId}`);

        if (canvasInv && typeof Chart !== "undefined") {
            if (inverterDonutCharts[invId]) {
                inverterDonutCharts[invId].destroy();
            }

            let slots = inv.slots || [];
            let opSlots = slots.filter(s => s.status !== "in_repair").length;
            let repSlots = slots.length - opSlots;
            let invAvail = inv.computed_availability !== undefined ? inv.computed_availability : 100.0;

            if (labelInv) {
                labelInv.textContent = `${invAvail.toFixed(1)}%`;
                labelInv.className = `mini-donut-label ${invAvail >= 95 ? 'text-success' : (invAvail >= 80 ? 'text-warning' : 'text-danger')}`;
            }

            if (subInv) {
                if (repSlots > 0) {
                    subInv.textContent = `${opSlots} / ${slots.length} Operativos (${repSlots} en rep.)`;
                    subInv.className = "mini-donut-sub text-danger";
                } else {
                    subInv.textContent = `${opSlots} / ${slots.length} Operativos`;
                    subInv.className = "mini-donut-sub text-muted";
                }
            }

            inverterDonutCharts[invId] = new Chart(canvasInv.getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: ["Operativos", "Reparación"],
                    datasets: [{
                        data: [opSlots, repSlots],
                        backgroundColor: ["#10b981", "#ef4444"],
                        borderColor: isLight ? "#ffffff" : "#1e2840",
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "70%",
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: true,
                            padding: 6,
                            titleFont: { family: "Inter", size: 10, weight: "bold" },
                            bodyFont: { family: "Inter", size: 9 },
                            displayColors: true,
                            boxWidth: 6,
                            boxHeight: 6,
                            callbacks: {
                                title: function() {
                                    return `Inversor ${invId}`;
                                },
                                label: function(ctx) {
                                    return ` ${ctx.label}: ${ctx.raw} de ${slots.length}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    });

    // 3. BAR CHART - SUBPLANTA PALMASECA 1 (A1, A2, B1, B2) - 24 MÓDULOS (OPERACIÓN E INOPERACIÓN DE COSTADO)
    const canvasP1 = document.getElementById("chart-modules-p1");
    if (canvasP1 && typeof Chart !== "undefined") {
        if (modulesP1Chart) modulesP1Chart.destroy();

        let labels = [];
        let uptimeData = [];
        let downtimeData = [];

        invertersData.filter(i => ["A1", "A2", "B1", "B2"].includes(i.id)).forEach(inv => {
            (inv.slots || []).forEach(s => {
                labels.push(`${inv.id}-S${s.slot_number}`);
                let uptime = s.metrics?.uptime_percent !== undefined ? s.metrics.uptime_percent : 100.0;
                let downtime = parseFloat((100.0 - uptime).toFixed(1));
                uptimeData.push(uptime);
                downtimeData.push(downtime);
            });
        });

        modulesP1Chart = new Chart(canvasP1.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Operación (%)",
                        data: uptimeData,
                        backgroundColor: isLight ? "#059669" : "#10b981",
                        borderRadius: 4,
                        barPercentage: 0.6,
                        categoryPercentage: 0.65
                    },
                    {
                        label: "Inoperación (%)",
                        data: downtimeData,
                        backgroundColor: isLight ? "#dc2626" : "#ef4444",
                        borderRadius: 4,
                        barPercentage: 0.6,
                        categoryPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10, weight: "600" } } },
                    y: { beginAtZero: true, max: 100, grid: { color: gridColor }, ticks: { color: textColor, callback: v => v + "%" } }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: { color: textColor, font: { family: "Inter", size: 11, weight: "600" } }
                    },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%` } }
                }
            }
        });
    }

    // 4. BAR CHART - SUBPLANTA PALMASECA 2 (C1, C2, D1, E1) - 22 MÓDULOS (OPERACIÓN E INOPERACIÓN DE COSTADO)
    const canvasP2 = document.getElementById("chart-modules-p2");
    if (canvasP2 && typeof Chart !== "undefined") {
        if (modulesP2Chart) modulesP2Chart.destroy();

        let labels = [];
        let uptimeData = [];
        let downtimeData = [];

        invertersData.filter(i => ["C1", "C2", "D1", "E1"].includes(i.id)).forEach(inv => {
            (inv.slots || []).forEach(s => {
                labels.push(`${inv.id}-S${s.slot_number}`);
                let uptime = s.metrics?.uptime_percent !== undefined ? s.metrics.uptime_percent : 100.0;
                let downtime = parseFloat((100.0 - uptime).toFixed(1));
                uptimeData.push(uptime);
                downtimeData.push(downtime);
            });
        });

        modulesP2Chart = new Chart(canvasP2.getContext("2d"), {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Operación (%)",
                        data: uptimeData,
                        backgroundColor: isLight ? "#0284c7" : "#06b6d4",
                        borderRadius: 4,
                        barPercentage: 0.6,
                        categoryPercentage: 0.65
                    },
                    {
                        label: "Inoperación (%)",
                        data: downtimeData,
                        backgroundColor: isLight ? "#dc2626" : "#ef4444",
                        borderRadius: 4,
                        barPercentage: 0.6,
                        categoryPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10, weight: "600" } } },
                    y: { beginAtZero: true, max: 100, grid: { color: gridColor }, ticks: { color: textColor, callback: v => v + "%" } }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        labels: { color: textColor, font: { family: "Inter", size: 11, weight: "600" } }
                    },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%` } }
                }
            }
        });
    }
}

// --- UTILITY FUNCTIONS ---
function formatDateString(isoStr) {
    if (!isoStr) return "N/A";
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return isoStr;
    }
}

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconClass = "fa-circle-info";
    if (type === "success") iconClass = "fa-circle-check";
    if (type === "error") iconClass = "fa-triangle-exclamation";

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
