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

    // DOM Elements
    const tabsBar = document.getElementById('tabs-bar');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Modals & Forms
    const modalStop = document.getElementById('modal-stop-repair');
    const modalRestart = document.getElementById('modal-restart-repair');
    const modalReplace = document.getElementById('modal-replace-module');
    const modalAddSpare = document.getElementById('modal-add-spare');

    // Initialize App
    initApp();

    function initApp() {
        bindTabEvents();
        bindModalEvents();
        bindFormEvents();
        bindActionButtons();
        bindHistoryFilterEvents();
        loadAllData();
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
        tabsBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;

            const targetTab = btn.dataset.tab;
            switchTab(targetTab);
        });
    }

    function switchTab(tabId) {
        currentTab = tabId;

        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Hide all panes
        tabPanes.forEach(pane => pane.classList.remove('active'));

        // Handle Pane Switching
        if (tabId === 'dashboard') {
            document.getElementById('tab-dashboard').classList.add('active');
            renderDashboard();
        } else if (tabId === 'spares') {
            document.getElementById('tab-spares').classList.add('active');
            renderSpares();
        } else if (tabId === 'history') {
            document.getElementById('tab-history').classList.add('active');
            renderHistory();
        } else {
            // Individual Inverter Tab (A1, A2, B1, B2, C1, C2, D1, E1)
            document.getElementById('tab-inverter').classList.add('active');
            renderInverterPane(tabId);
        }
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
                        <button class="btn btn-success btn-sm btn-restart-action" data-repair-id="${slot.active_repair ? slot.active_repair.repair_id : ''}" data-serial="${slot.current_serial}">
                            <i class="fa-solid fa-play"></i> Registrar Arranque
                        </button>
                    ` : `
                        <button class="btn btn-danger btn-sm btn-stop-action" data-inv="${inv.id}" data-slot="${slot.slot_number}">
                            <i class="fa-solid fa-pause"></i> Registrar Parada
                        </button>
                    `}
                    <button class="btn btn-secondary btn-sm btn-replace-action" data-inv="${inv.id}" data-slot="${slot.slot_number}" data-serial="${slot.current_serial}">
                        <i class="fa-solid fa-arrows-rotate"></i> Reemplazar
                    </button>
                    <button class="btn btn-outline btn-sm btn-module-history-action" data-serial="${slot.current_serial}" title="Ver historial de fallas de este módulo">
                        <i class="fa-solid fa-clock-rotate-left"></i> Historial
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
        tabPanes.forEach(pane => pane.classList.remove('active'));

        // Handle Pane Switching
        if (tabId === 'dashboard') {
            document.getElementById('tab-dashboard').classList.add('active');
            renderDashboard();
        } else if (tabId === 'spares') {
            document.getElementById('tab-spares').classList.add('active');
            renderSpares();
        } else if (tabId === 'history') {
            document.getElementById('tab-history').classList.add('active');
            renderHistory();
        } else if (tabId === 'modules') {
            document.getElementById('tab-modules').classList.add('active');
            renderModulesCatalog();
        } else {
            // Individual Inverter Tab (A1, A2, B1, B2, C1, C2, D1, E1)
            document.getElementById('tab-inverter').classList.add('active');
            renderInverterPane(tabId);
        }
    }

    // Render All Modules Catalog Tab
    async function renderModulesCatalog() {
        const body = document.getElementById('modules-catalog-body');
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando catálogo...</td></tr>';

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
                body.innerHTML = `<tr><td colspan="8" style="text-align:center;">No se encontraron módulos coincidentes.</td></tr>`;
                return;
            }

            filtered.forEach(m => {
                const tr = document.createElement('tr');
                const met = m.metrics;

                tr.innerHTML = `
                    <td><code>${m.serial_number}</code></td>
                    <td><strong>${m.inverter_id ? `Inversor ${m.inverter_id}` : '<span class="text-muted">En Respaldo</span>'}</strong></td>
                    <td>${m.slot_number ? `Slot ${m.slot_number}` : '-'}</td>
                    <td><span class="status-tag ${m.status}">${m.status === 'operating' ? 'Operativo' : (m.status === 'in_repair' ? 'En Reparación' : 'Respaldo/Retirado')}</span></td>
                    <td>${met.net_operating_hours} hrs</td>
                    <td>${m.total_repairs}</td>
                    <td><strong style="color:${met.uptime_percent >= 90 ? 'var(--primary)' : 'var(--accent-amber)'}">${met.uptime_percent}%</strong></td>
                    <td>
                        <div style="display:flex; gap:0.3rem;">
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

            body.querySelectorAll('.btn-module-history-action').forEach(b => {
                b.onclick = () => navigateToHistoryWithFilter({ serial: b.dataset.serial });
            });

            body.querySelectorAll('.btn-edit-serial-action').forEach(b => {
                b.onclick = () => openEditSerialModal(b.dataset.serial);
            });

            body.querySelectorAll('.btn-delete-module-action').forEach(b => {
                b.onclick = () => deleteModuleFromInventory(b.dataset.serial);
            });
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--danger);">Error cargando módulos.</td></tr>`;
        }
    }

    document.getElementById('catalog-search-input').oninput = renderModulesCatalog;

    // Render History & Reports Tab with Dynamic Filtering
    function renderHistory() {
        const invFilter = (document.getElementById('history-filter-inverter')?.value || '').trim();
        const serialFilter = (document.getElementById('history-filter-serial')?.value || '').trim().toLowerCase();
        const statusFilter = (document.getElementById('history-filter-status')?.value || 'all').trim().toLowerCase();
        const searchFilter = (document.getElementById('history-filter-search')?.value || '').trim().toLowerCase();

        const repairsBody = document.getElementById('history-repairs-body');
        const replacementsBody = document.getElementById('history-replacements-body');
        const counterEl = document.getElementById('history-results-counter');

        repairsBody.innerHTML = '';
        replacementsBody.innerHTML = '';

        // Filter Repair Logs
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

        // Filter Replacement Logs
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

        // Update Results Counter Badge Bar
        const isFiltered = invFilter || serialFilter || (statusFilter !== 'all') || searchFilter;
        if (counterEl) {
            let activeLabels = [];
            if (invFilter) activeLabels.push(`Inversor: <strong>${invFilter}</strong>`);
            if (serialFilter) activeLabels.push(`Serial: <strong>"${serialFilter}"</strong>`);
            if (statusFilter !== 'all') activeLabels.push(`Estado: <strong>${statusFilter === 'open' ? 'Abierta' : 'Resuelta'}</strong>`);
            if (searchFilter) activeLabels.push(`Búsqueda: <strong>"${searchFilter}"</strong>`);

            const filterDetails = isFiltered ? `<span style="margin-left:0.5rem; color:var(--primary); font-size:0.8rem;">[${activeLabels.join(' | ')}]</span>` : '';

            counterEl.innerHTML = `
                <div>
                    <i class="fa-solid fa-filter"></i> 
                    Mostrando <span class="badge-count">${filteredRepairs.length} de ${logsData.repairs.length}</span> paradas por reparación 
                    y <span class="badge-count">${filteredReplacements.length} de ${logsData.replacements.length}</span> reemplazos.${filterDetails}
                </div>
            `;
        }

        // Render Repairs Table Body
        if (filteredRepairs.length === 0) {
            repairsBody.innerHTML = `<tr><td colspan="11" style="text-align:center;" class="text-muted">No se encontraron paradas por reparación coincidentes.</td></tr>`;
        } else {
            filteredRepairs.forEach(r => {
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

        // Render Replacements Table Body
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

        if (btnApply) {
            btnApply.onclick = renderHistory;
        }

        // Also trigger on Enter key inside text input fields
        [serialInput, searchInput].forEach(inp => {
            if (inp) {
                inp.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        renderHistory();
                    }
                };
            }
        });

        if (btnClear) {
            btnClear.onclick = () => {
                if (invInput) invInput.value = '';
                if (serialInput) serialInput.value = '';
                if (statusInput) statusInput.value = 'all';
                if (searchInput) searchInput.value = '';
                renderHistory();
            };
        }
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
        
        // Set default datetime to now
        const nowIso = new Date().toISOString().slice(0, 16);
        document.getElementById('stop-time').value = nowIso;
        document.getElementById('stop-reason').value = slotNum === 0 ? 'Parada general preventiva de unidad inversora' : '';
        document.getElementById('stop-diagnosis').value = '';

        modalStop.classList.add('active');
    }

    function openRestartModal(repairId, serial) {
        document.getElementById('restart-repair-id').value = repairId;
        document.getElementById('restart-serial-info').value = serial;
        
        const nowIso = new Date().toISOString().slice(0, 16);
        document.getElementById('restart-time').value = nowIso;
        document.getElementById('restart-diagnosis').value = '';

        modalRestart.classList.add('active');
    }

    function openRestartInverterModal(inverterId) {
        document.getElementById('restart-repair-id').value = 0;
        document.getElementById('restart-serial-info').value = `TODOS LOS MÓDULOS DE UNIDAD INVERSORA ${inverterId}`;
        
        const nowIso = new Date().toISOString().slice(0, 16);
        document.getElementById('restart-time').value = nowIso;
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

        const nowIso = new Date().toISOString().slice(0, 16);
        document.getElementById('replace-timestamp').value = nowIso;
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
        document.getElementById('edit-repair-stop-time').value = new Date(r.stop_time).toISOString().slice(0, 16);
        document.getElementById('edit-repair-restart-time').value = r.restart_time ? new Date(r.restart_time).toISOString().slice(0, 16) : '';
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
        document.getElementById('edit-rep-timestamp').value = new Date(rep.timestamp).toISOString().slice(0, 16);
        document.getElementById('edit-rep-technician').value = rep.performed_by || 'Técnico Solar';
        document.getElementById('edit-rep-reason').value = rep.reason || '';

        document.getElementById('modal-edit-replacement-event').classList.add('active');
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
            const diagnosis = document.getElementById('restart-diagnosis').value;

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
            const reason = document.getElementById('edit-repair-reason').value;
            const diagnosis = document.getElementById('edit-repair-diagnosis').value;

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

    // Format Date helper
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
});
