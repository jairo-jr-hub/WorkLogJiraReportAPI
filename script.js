// ================= CONFIGURAÇÃO DA API =================
const WORKER_URL = "https://jira-worklog-proxy.jairo-juniorjj15.workers.dev";

// Lista de usuários rápidos (adicione quantos quiser aqui)
const SAVED_USERS = [
    "Jairo Antonio dos Santos Junior",
    "Lucas Vieira de Oliveira"
];

let globalIssuesData = [];
let activeGroups = ['tipo', 'issue'];
let currentWorklogs = [];
let currentDates = [];
let modalData = {};
let currentHeaderMeta = { displayName: "", fromStr: "", toStr: "" };

const btnIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`;

// ================= INICIALIZAÇÃO SEGURA =================
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDates();
    initUserCombobox();
    initCustomTooltip();
    initEventListeners();
});

// Preenche data inicial e final com o dia de hoje (fuso local)
function setDefaultDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const elFrom = document.getElementById('dateFrom');
    const elTo = document.getElementById('dateTo');
    if (elFrom) elFrom.value = todayStr;
    if (elTo) elTo.value = todayStr;
}

// ================= COMBOBOX CUSTOMIZADO DE USUÁRIOS =================
function initUserCombobox() {
    const input = document.getElementById('jiraUser');
    const dropdown = document.getElementById('userDropdown');
    const btnToggle = document.getElementById('btnToggleUsers');
    const wrapper = document.getElementById('userSelectWrapper');

    if (!input || !dropdown || !btnToggle || !wrapper) return;

    function renderList(filterText = "") {
        const term = filterText.trim().toLowerCase();
        const filtered = SAVED_USERS.filter(u => u.toLowerCase().includes(term));

        if (filtered.length === 0) {
            dropdown.innerHTML = `<div class="custom-dropdown-empty">Clique em "Buscar do Jira" para usar este nome</div>`;
        } else {
            dropdown.innerHTML = filtered.map(u => {
                const isSelected = u.toLowerCase() === input.value.trim().toLowerCase();
                return `<div class="custom-dropdown-item ${isSelected ? 'active' : ''}" data-value="${escapeAttr(u)}">${u}</div>`;
            }).join('');
        }
        dropdown.classList.add('open');
    }

    input.addEventListener('focus', () => renderList(""));
    input.addEventListener('input', () => renderList(input.value));

    btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
        } else {
            renderList("");
            input.focus();
        }
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.custom-dropdown-item');
        if (item) {
            input.value = item.dataset.value;
            dropdown.classList.remove('open');
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
}

// ================= TOOLTIP CUSTOMIZADO (ESTILO JIRA) =================
function initCustomTooltip() {
    const tooltip = document.getElementById('customTooltip');
    if (!tooltip) return;

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.issue-tooltip-trigger');
        if (!target) return;

        const key = target.dataset.key || "";
        const parent = target.dataset.parent || "";
        const summary = target.dataset.summary || "";

        let html = `<div class="tooltip-header">`;
        if (parent) {
            html += `<span class="tooltip-parent">${parent}</span><span class="tooltip-sep">/</span>`;
        }
        html += `<span class="tooltip-key">${key}</span></div>`;
        html += `<div class="tooltip-summary">${summary}</div>`;

        tooltip.innerHTML = html;
        tooltip.classList.add('visible');
        positionTooltip(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (tooltip.classList.contains('visible')) {
            positionTooltip(e);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('.issue-tooltip-trigger');
        if (target) {
            tooltip.classList.remove('visible');
        }
    });

    function positionTooltip(e) {
        const offset = 14;
        let left = e.clientX + offset;
        let top = e.clientY + offset;

        const rect = tooltip.getBoundingClientRect();
        if (left + rect.width > window.innerWidth - 16) {
            left = e.clientX - rect.width - offset;
        }
        if (top + rect.height > window.innerHeight - 16) {
            top = e.clientY - rect.height - offset;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

// ================= EVENTOS PRINCIPAIS =================
function initEventListeners() {
    const btnFetch = document.getElementById('btnFetchJira');
    if (btnFetch) {
        btnFetch.addEventListener('click', fetchFromJira);
    }

    const jsonInput = document.getElementById('jsonFile');
    if (jsonInput) {
        jsonInput.addEventListener('change', handleJsonUpload);
    }

    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate) {
        btnGenerate.addEventListener('click', applyFilters);
    }

    const addGroupSelect = document.getElementById('addGroupSelect');
    if (addGroupSelect) {
        addGroupSelect.addEventListener('change', function(e) {
            if (e.target.value) {
                activeGroups.push(e.target.value);
                if (activeGroups.includes('tipo') && activeGroups.includes('issue')) {
                    activeGroups = ['tipo', 'issue'];
                }
                renderGroupByUI();
                if (currentWorklogs.length > 0) renderHTML();
            }
        });
    }
}

// ================= BUSCA VIA CLOUDFLARE WORKER (POST) =================
async function fetchFromJira() {
    const fromStr = document.getElementById('dateFrom').value;
    const toStr = document.getElementById('dateTo').value;
    const userEl = document.getElementById('jiraUser');
    const userStr = userEl ? userEl.value.trim() : "Jairo Antonio dos Santos Junior";

    if (!userStr) {
        alert("Informe o nome ou e-mail do usuário no Jira.");
        return;
    }

    if (!fromStr || !toStr) {
        alert("Selecione a data inicial e final.");
        return;
    }

    const btn = document.getElementById('btnFetchJira');
    const originalText = btn.innerText;
    btn.innerText = "Buscando no Jira...";
    btn.disabled = true;

    try {
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                dateFrom: fromStr,
                dateTo: toStr,
                user: userStr
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status} - ${errText}`);
        }

        const data = await response.json();
        if (!data.issues) {
            throw new Error("O retorno da API não possui o campo 'issues'.");
        }

        globalIssuesData = data.issues;
        const fileNameEl = document.getElementById('fileName');
        if (fileNameEl) fileNameEl.innerText = `Jira API (${data.issues.length} issues)`;
        
        applyFilters();
    } catch (err) {
        console.error(err);
        alert("Erro ao buscar dados do Jira: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// ================= CARREGAMENTO VIA JSON (FALLBACK OFFLINE) =================
function handleJsonUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const fileNameEl = document.getElementById('fileName');
    if (fileNameEl) fileNameEl.innerText = file.name;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.issues) throw new Error("O arquivo não possui o formato esperado do Jira.");
            globalIssuesData = data.issues;
            initDatesAndRender();
        } catch (err) {
            alert("Erro ao ler arquivo: " + err.message);
        }
    };
    reader.readAsText(file);
}

function renderGroupByUI() {
    const container = document.getElementById('groupByTags');
    if (!container) return;
    container.innerHTML = '';
    
    activeGroups.forEach(g => {
        const label = g === 'tipo' ? 'Tipo de item' : 'Issue';
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `${label} <span onclick="removeGroup('${g}')">×</span>`;
        container.appendChild(tag);
    });
    
    const select = document.getElementById('addGroupSelect');
    if (!select) return;
    select.innerHTML = '<option value="">+ Add field...</option>';
    if (!activeGroups.includes('tipo')) select.innerHTML += '<option value="tipo">Tipo de item</option>';
    if (!activeGroups.includes('issue')) select.innerHTML += '<option value="issue">Issue</option>';
    
    select.style.display = activeGroups.length === 2 ? 'none' : 'block';
}

window.removeGroup = function(g) {
    activeGroups = activeGroups.filter(x => x !== g);
    renderGroupByUI();
    if (currentWorklogs.length > 0) renderHTML();
};

function initDatesAndRender() {
    let minD = '9999-12-31';
    let maxD = '0000-01-01';
    let found = false;

    globalIssuesData.forEach(issue => {
        if (!issue.fields.worklog || !issue.fields.worklog.worklogs) return;
        
        issue.fields.worklog.worklogs.forEach(wl => {
            const d = wl.started.split('T')[0];
            if (d < minD) minD = d;
            if (d > maxD) maxD = d;
            found = true;
        });
    });

    if (found) {
        document.getElementById('dateFrom').value = minD;
        document.getElementById('dateTo').value = maxD;
    }
    
    applyFilters();
}

function extractComment(doc) {
    if (!doc || !doc.content) return "-";
    let text = "";
    doc.content.forEach(block => {
        if (block.type === 'paragraph' && block.content) {
            block.content.forEach(inline => {
                if (inline.type === 'text') text += inline.text;
            });
            text += " "; 
        }
    });
    return text.trim() || "-";
}

function escapeAttr(str) {
    return String(str || "")
        .replace(/&/g, "&" + "amp;")
        .replace(/"/g, "&" + "quot;")
        .replace(/'/g, "&" + "#39;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;");
}

function renderReportHeader(fromStr, toStr) {
    const headerEl = document.getElementById('reportHeader');
    if (!headerEl) return;

    const userEl = document.getElementById('jiraUser');
    const searchedRaw = userEl ? userEl.value.trim() : "";
    const searchedUser = searchedRaw.toLowerCase();

    const matchedWl = currentWorklogs.find(w => w.authorName && w.authorName.toLowerCase() === searchedUser)
        || currentWorklogs.find(w => w.authorName)
        || null;

    const displayName = (matchedWl && matchedWl.authorName)
        ? matchedWl.authorName
        : (searchedRaw || "Responsável");
    const avatarUrl = (matchedWl && matchedWl.authorAvatar) ? matchedWl.authorAvatar : "";
    const projectName = (matchedWl && matchedWl.projectName) ? matchedWl.projectName : "";

    currentHeaderMeta = { displayName, fromStr, toStr };

    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0].toUpperCase())
        .join('');

    const fmtDate = (d) => d.split('-').reverse().join('/');

    headerEl.innerHTML = `
        <div class="report-header-left">
            <div class="jira-avatar-wrap">
                ${avatarUrl
                    ? `<img src="${avatarUrl}" alt="${escapeAttr(displayName)}" class="report-header-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div class="report-header-initials" style="display:none;">${initials}</div>`
                    : `<div class="report-header-initials">${initials}</div>`
                }
            </div>
            <div class="report-header-info">
                <div class="report-header-top">
                    <h2 class="report-header-title">${displayName}</h2>
                    ${projectName ? `<span class="jira-lozenge">${projectName}</span>` : ''}
                </div>
                <span class="report-header-subtitle">Período: ${fmtDate(fromStr)} até ${fmtDate(toStr)}</span>
            </div>
        </div>
        <div class="header-actions">
            <button type="button" class="btn-export btn-excel" onclick="exportToExcel()" title="Baixar planilha Excel (.xlsx)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="8" y1="13" x2="16" y2="17"></line>
                    <line x1="16" y1="13" x2="8" y2="17"></line>
                </svg>
                Exportar Excel
            </button>
            <button type="button" class="btn-export btn-pdf" onclick="exportToPDF()" title="Imprimir ou salvar como PDF">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Exportar PDF
            </button>
        </div>
    `;
    headerEl.style.display = 'flex';
}

function applyFilters() {
    if (globalIssuesData.length === 0) {
        alert("Busque os dados do Jira ou carregue um JSON primeiro.");
        return;
    }

    const fromStr = document.getElementById('dateFrom').value;
    const toStr = document.getElementById('dateTo').value;

    if (!fromStr || !toStr) {
        alert("Datas inválidas.");
        return;
    }

    currentWorklogs = [];
    modalData = {};

    globalIssuesData.forEach(issue => {
        if (!issue.fields.worklog || !issue.fields.worklog.worklogs) return;
        
        let pKey = null;
        let pIcon = null;
        if (issue.fields.parent && issue.fields.parent.key) {
            pKey = issue.fields.parent.key;
            if (issue.fields.parent.fields && issue.fields.parent.fields.issuetype) {
                pIcon = issue.fields.parent.fields.issuetype.iconUrl;
            }
        } else {
            const matches = (issue.fields.summary || "").match(/ERP-\d+/g);
            if (matches) {
                const foundParent = matches.find(m => m !== issue.key);
                if (foundParent) {
                    pKey = foundParent;
                }
            }
        }
        
        issue.fields.worklog.worklogs.forEach(wl => {
            const d = wl.started.split('T')[0];
            
            if (d >= fromStr && d <= toStr) {
                const wlObj = {
                    issueKey: issue.key,
                    parentKey: pKey,
                    parentIcon: pIcon,
                    summary: issue.fields.summary || "Sem Título",
                    type: issue.fields.issuetype.name,
                    typeIcon: issue.fields.issuetype.iconUrl,
                    projectName: (issue.fields.project && issue.fields.project.name) ? issue.fields.project.name : "",
                    authorName: (wl.author && wl.author.displayName) ? wl.author.displayName : "",
                    authorAvatar: (wl.author && wl.author.avatarUrls)
                        ? (wl.author.avatarUrls['48x48'] || wl.author.avatarUrls['32x32'] || wl.author.avatarUrls['24x24'] || "")
                        : "",
                    date: d,
                    sec: wl.timeSpentSeconds,
                    timeSpent: wl.timeSpent,
                    started: wl.started,
                    comment: extractComment(wl.comment)
                };
                
                currentWorklogs.push(wlObj);

                if (!modalData[issue.key]) modalData[issue.key] = [];
                modalData[issue.key].push(wlObj);
            }
        });
    });

    const reportContainer = document.getElementById('reportContainer');
    const groupBySection = document.getElementById('groupBySection');
    const reportHeader = document.getElementById('reportHeader');

    if (currentWorklogs.length === 0) {
        reportContainer.innerHTML = "<div class='empty-msg'>Nenhum apontamento encontrado para esse usuário/período.</div>";
        if (groupBySection) groupBySection.style.display = 'none';
        if (reportHeader) reportHeader.style.display = 'none';
        return;
    }

    renderReportHeader(fromStr, toStr);
    if (groupBySection) groupBySection.style.display = 'flex';
    renderGroupByUI();

    currentDates = [];
    let curr = new Date(fromStr + 'T12:00:00');
    const end = new Date(toStr + 'T12:00:00');
    
    while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];
        const dayOfWeek = curr.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6 || currentWorklogs.some(w => w.date === dateStr)) {
            currentDates.push(dateStr);
        }
        curr.setDate(curr.getDate() + 1);
    }

    renderHTML();
}

function renderHTML() {
    if (activeGroups.length === 0) {
        document.getElementById('reportContainer').innerHTML = "<div class='empty-msg'>Selecione pelo menos um campo no 'Group By' para visualizar a tabela.</div>";
        return;
    }

    let html = `<div class="table-wrapper"><table><thead><tr>`;
    
    let stickyHtml = '';
    if (activeGroups.length === 2) {
        stickyHtml += `<th rowspan="2" class="bg-white sticky-col col-auto col-tipo-header" data-sticky-idx="0">Tipo de item</th>`;
        stickyHtml += `<th rowspan="2" class="col-yellow sticky-col col-total" data-sticky-idx="1">Total<br>Tipo de item</th>`;
        stickyHtml += `<th rowspan="2" class="bg-white sticky-col col-auto col-issue-header" data-sticky-idx="2">Issue</th>`;
        stickyHtml += `<th rowspan="2" class="col-yellow sticky-col col-total sticky-last-col" data-sticky-idx="3">Total<br>Issue</th>`;
    } else if (activeGroups.length === 1) {
        const isTipo = activeGroups[0] === 'tipo';
        const label = isTipo ? 'Tipo de item' : 'Issue';
        const headerClass = isTipo ? 'col-tipo-header' : 'col-issue-header';
        stickyHtml += `<th rowspan="2" class="bg-white sticky-col col-auto ${headerClass}" data-sticky-idx="0">${label}</th>`;
        stickyHtml += `<th rowspan="2" class="col-yellow sticky-col col-total sticky-last-col" data-sticky-idx="1">Total<br>${label}</th>`;
    }
    html += stickyHtml;
    
    let currentMonth = "";
    let colspan = 0;
    let monthHeaders = "";
    
    currentDates.forEach((d, i) => {
        const m = getMonthYearBR(d);
        if (i === 0) { currentMonth = m; colspan = 1; } 
        else if (m === currentMonth) { colspan++; } 
        else {
            monthHeaders += `<th colspan="${colspan}" class="month-header">${currentMonth}</th>`;
            currentMonth = m; colspan = 1;
        }
    });
    monthHeaders += `<th colspan="${colspan}" class="month-header">${currentMonth}</th>`;
    
    html += monthHeaders + `<th rowspan="2" class="filler-col"></th></tr><tr>`;

    currentDates.forEach(d => {
        const day = d.split('-')[2];
        const wd = getWeekdayBR(d);
        html += `<th class="bg-white day-col">${parseInt(day)}<br><span style="color:#5e6c84; font-size:11px">${wd}</span></th>`;
    });
    html += `</tr></thead><tbody>`;

    let grandTotal = 0;
    const columnTotals = {};
    currentDates.forEach(d => columnTotals[d] = 0);

    if (activeGroups.length === 2 && activeGroups[0] === 'tipo' && activeGroups[1] === 'issue') {
        const groups = {};
        currentWorklogs.forEach(wl => {
            if (!groups[wl.type]) { groups[wl.type] = { total: 0, icon: wl.typeIcon, issues: {} }; }
            const grp = groups[wl.type];
            
            if (!grp.issues[wl.issueKey]) {
                const daily = {};
                currentDates.forEach(d => daily[d] = 0);
                grp.issues[wl.issueKey] = { total: 0, daily: daily, summary: wl.summary, parentKey: wl.parentKey };
            }
            
            if (grp.issues[wl.issueKey].daily[wl.date] !== undefined) {
                grp.issues[wl.issueKey].daily[wl.date] += wl.sec;
            }
            grp.issues[wl.issueKey].total += wl.sec;
            grp.total += wl.sec;
        });

        Object.keys(groups).sort().forEach(typeName => {
            const grp = groups[typeName];
            const issueKeys = Object.keys(grp.issues).sort();
            
            issueKeys.forEach((key, idx) => {
                const iss = grp.issues[key];
                html += `<tr>`;
                
                if (idx === 0) {
                    html += `<td rowspan="${issueKeys.length}" class="sticky-col col-auto bg-white col-tipo-cell text-bold" data-sticky-idx="0">
                        <div class="flex-align">
                            <img src="${grp.icon}" onerror="this.style.display='none'"> 
                            <span class="text-content" title="${escapeAttr(typeName)}">${typeName}</span>
                        </div>
                    </td>`;
                    
                    html += `<td rowspan="${issueKeys.length}" class="sticky-col col-total col-yellow text-bold" data-sticky-idx="1">
                        ${formatSeconds(grp.total)}
                    </td>`;
                }

                const dataAttrs = `data-key="${escapeAttr(key)}" data-parent="${escapeAttr(iss.parentKey || '')}" data-summary="${escapeAttr(iss.summary)}"`;

                html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="2">
                    <div class="flex-align">
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" class="issue-tooltip-trigger" ${dataAttrs}>
                            <img src="${grp.icon}" onerror="this.style.display='none'"> 
                        </a>
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" class="issue-link issue-tooltip-trigger" ${dataAttrs}>${key}</a>
                        <button type="button" class="btn-details" onclick="openModal('${key}')" title="Ver detalhes">${btnIcon}</button>
                    </div>
                </td>`;
                html += `<td class="sticky-col col-total col-yellow sticky-last-col text-bold" data-sticky-idx="3">${formatSeconds(iss.total)}</td>`;
                
                currentDates.forEach(d => {
                    const sec = iss.daily[d];
                    columnTotals[d] += sec;
                    html += `<td class="day-col bg-white">${formatSeconds(sec)}</td>`;
                });
                
                html += `<td class="filler-col"></td></tr>`;
                grandTotal += iss.total;
            });
        });

    } else if (activeGroups.length === 1 && activeGroups[0] === 'issue') {
        const issues = {};
        currentWorklogs.forEach(wl => {
            if (!issues[wl.issueKey]) {
                const daily = {};
                currentDates.forEach(d => daily[d] = 0);
                issues[wl.issueKey] = { total: 0, icon: wl.typeIcon, daily: daily, summary: wl.summary, parentKey: wl.parentKey };
            }
            if (issues[wl.issueKey].daily[wl.date] !== undefined) {
                issues[wl.issueKey].daily[wl.date] += wl.sec;
            }
            issues[wl.issueKey].total += wl.sec;
        });

        Object.keys(issues).sort().forEach(key => {
            const iss = issues[key];
            html += `<tr>`;
            const dataAttrs = `data-key="${escapeAttr(key)}" data-parent="${escapeAttr(iss.parentKey || '')}" data-summary="${escapeAttr(iss.summary)}"`;

            html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="0">
                <div class="flex-align">
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" class="issue-tooltip-trigger" ${dataAttrs}>
                        <img src="${iss.icon}" onerror="this.style.display='none'"> 
                    </a>
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" class="issue-link issue-tooltip-trigger" ${dataAttrs}>${key}</a>
                    <button type="button" class="btn-details" onclick="openModal('${key}')" title="Ver detalhes">${btnIcon}</button>
                </div>
            </td>`;
            html += `<td class="sticky-col col-total col-yellow sticky-last-col text-bold" data-sticky-idx="1">${formatSeconds(iss.total)}</td>`;
            currentDates.forEach(d => {
                const sec = iss.daily[d];
                columnTotals[d] += sec;
                html += `<td class="day-col bg-white">${formatSeconds(sec)}</td>`;
            });
            html += `<td class="filler-col"></td></tr>`;
            grandTotal += iss.total;
        });

    } else if (activeGroups.length === 1 && activeGroups[0] === 'tipo') {
        const types = {};
        currentWorklogs.forEach(wl => {
            if (!types[wl.type]) {
                const daily = {};
                currentDates.forEach(d => daily[d] = 0);
                types[wl.type] = { total: 0, icon: wl.typeIcon, daily: daily };
            }
            if (types[wl.type].daily[wl.date] !== undefined) {
                types[wl.type].daily[wl.date] += wl.sec;
            }
            types[wl.type].total += wl.sec;
        });

        Object.keys(types).sort().forEach(key => {
            const typ = types[key];
            html += `<tr>`;
            html += `<td class="sticky-col col-auto bg-white col-tipo-cell text-bold" data-sticky-idx="0">
                <div class="flex-align">
                    <img src="${typ.icon}" onerror="this.style.display='none'"> 
                    <span class="text-content" title="${escapeAttr(key)}">${key}</span>
                </div>
            </td>`;
            html += `<td class="sticky-col col-total col-yellow sticky-last-col text-bold" data-sticky-idx="1">${formatSeconds(typ.total)}</td>`;
            currentDates.forEach(d => {
                const sec = typ.daily[d];
                columnTotals[d] += sec;
                html += `<td class="day-col bg-white">${formatSeconds(sec)}</td>`;
            });
            html += `<td class="filler-col"></td></tr>`;
            grandTotal += typ.total;
        });
    }

    html += `</tbody><tfoot><tr class="tfoot-total">`;
    
    if (activeGroups.length === 2) {
        html += `<td class="sticky-col col-auto text-bold" data-sticky-idx="0" style="text-align:right;">Total</td>`;
        html += `<td class="sticky-col col-total col-yellow text-bold" data-sticky-idx="1">${formatSeconds(grandTotal)}</td>`;
        html += `<td class="sticky-col col-auto" data-sticky-idx="2"></td>`;
        html += `<td class="sticky-col col-total col-yellow sticky-last-col text-bold" data-sticky-idx="3">${formatSeconds(grandTotal)}</td>`;
    } else {
        html += `<td class="sticky-col col-auto text-bold" data-sticky-idx="0" style="text-align:right;">Total</td>`;
        html += `<td class="sticky-col col-total col-yellow sticky-last-col text-bold" data-sticky-idx="1">${formatSeconds(grandTotal)}</td>`;
    }
    
    currentDates.forEach(d => {
        html += `<td class="day-col">${formatSeconds(columnTotals[d])}</td>`;
    });
    
    html += `<td class="filler-col"></td></tr></tfoot></table></div>`;
    document.getElementById('reportContainer').innerHTML = html;

    setTimeout(applyStickyOffsets, 50);
}

function applyStickyOffsets() {
    const table = document.querySelector('.table-wrapper table');
    if (!table) return;
    const firstRow = table.querySelector('thead tr:first-child');
    if (!firstRow) return;
    const numStickyCols = activeGroups.length * 2;
    let currentLeft = 0;
    for (let i = 0; i < numStickyCols; i++) {
        const th = firstRow.querySelector(`th[data-sticky-idx="${i}"]`);
        if (th) {
            const width = th.getBoundingClientRect().width;
            const cells = table.querySelectorAll(`[data-sticky-idx="${i}"]`);
            cells.forEach(cell => {
                cell.style.left = `${currentLeft}px`;
            });
            currentLeft += width;
        }
    }
}

function formatSeconds(sec) {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `0h ${m}m`;
}

function getWeekdayBR(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return days[d.getDay()];
}

function getMonthYearBR(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${months[d.getMonth()]}, ${d.getFullYear()}`;
}

// ================= EXPORTAÇÃO EXCEL (.XLSX) E PDF =================
window.exportToExcel = function() {
    if (typeof XLSX === 'undefined') {
        alert("Biblioteca de Excel não carregada. Verifique sua conexão com a internet.");
        return;
    }
    if (currentWorklogs.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }

    const wb = XLSX.utils.book_new();

    const issueMap = {};
    let grandTotalSec = 0;
    const dayTotals = {};
    currentDates.forEach(d => dayTotals[d] = 0);

    currentWorklogs.forEach(wl => {
        if (!issueMap[wl.issueKey]) {
            const daily = {};
            currentDates.forEach(d => daily[d] = 0);
            issueMap[wl.issueKey] = {
                type: wl.type,
                parentKey: wl.parentKey || "",
                issueKey: wl.issueKey,
                summary: wl.summary,
                total: 0,
                daily
            };
        }
        if (issueMap[wl.issueKey].daily[wl.date] !== undefined) {
            issueMap[wl.issueKey].daily[wl.date] += wl.sec;
            dayTotals[wl.date] += wl.sec;
        }
        issueMap[wl.issueKey].total += wl.sec;
        grandTotalSec += wl.sec;
    });

    const summaryHeaders = [
        "Tipo de item", "ERP Pai", "Issue", "Descrição", "Total",
        ...currentDates.map(d => d.split('-').reverse().join('/'))
    ];
    const summaryRows = [summaryHeaders];

    Object.values(issueMap)
        .sort((a, b) => a.type.localeCompare(b.type) || a.issueKey.localeCompare(b.issueKey))
        .forEach(item => {
            summaryRows.push([
                item.type,
                item.parentKey,
                item.issueKey,
                item.summary,
                formatSeconds(item.total),
                ...currentDates.map(d => formatSeconds(item.daily[d]))
            ]);
        });

    summaryRows.push([
        "TOTAL GERAL", "", "", "", formatSeconds(grandTotalSec),
        ...currentDates.map(d => formatSeconds(dayTotals[d]))
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

    const detailRows = [["Data", "Início", "Fim", "Tipo", "ERP Pai", "Issue", "Descrição", "Tempo", "Comentário"]];
    const sortedWls = [...currentWorklogs].sort((a, b) => new Date(a.started) - new Date(b.started));

    sortedWls.forEach(wl => {
        const startDate = new Date(wl.started);
        const endDate = new Date(startDate.getTime() + (wl.sec * 1000));
        detailRows.push([
            startDate.toLocaleDateString('pt-BR'),
            startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            wl.type,
            wl.parentKey || "",
            wl.issueKey,
            wl.summary,
            wl.timeSpent,
            wl.comment
        ]);
    });

    const wsDetails = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetails, "Detalhamento");

    const safeName = (currentHeaderMeta.displayName || "Worklog").replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `Worklog_${safeName}_${currentHeaderMeta.fromStr}_a_${currentHeaderMeta.toStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

window.exportToPDF = function() {
    if (currentWorklogs.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
    window.print();
};

// ================= LÓGICA DO MODAL =================
window.openModal = function(issueKey) {
    const worklogs = modalData[issueKey];
    if (!worklogs || worklogs.length === 0) return;

    const issueSummary = worklogs[0].summary;
    const parentKey = worklogs[0].parentKey;
    const parentIcon = worklogs[0].parentIcon;
    const typeIcon = worklogs[0].typeIcon;

    let breadcrumbHtml = '';
    if (parentKey) {
        breadcrumbHtml += `
            <a href="https://guaranisistemas.atlassian.net/browse/${parentKey}" target="_blank" class="jira-crumb-item" title="Abrir Ticket Pai">
                ${parentIcon ? `<img src="${parentIcon}" class="jira-crumb-icon" onerror="this.style.display='none'">` : ''}
                <span>${parentKey}</span>
            </a>
            <span class="jira-crumb-sep">/</span>
        `;
    }

    breadcrumbHtml += `
        <a href="https://guaranisistemas.atlassian.net/browse/${issueKey}" target="_blank" class="jira-crumb-item jira-crumb-current" title="Abrir Ticket">
            ${typeIcon ? `<img src="${typeIcon}" class="jira-crumb-icon" onerror="this.style.display='none'">` : ''}
            <span>${issueKey}</span>
        </a>
    `;

    document.getElementById('modalTitle').innerHTML = `
        <div class="jira-breadcrumb">${breadcrumbHtml}</div>
        <div class="modal-summary-highlight">${issueSummary}</div>
    `;
    
    const tbody = document.getElementById('modalTableBody');
    const tfoot = document.getElementById('modalTableFoot');
    
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    worklogs.sort((a, b) => new Date(a.started) - new Date(b.started));

    let totalSec = 0;
    const daysOfWeek = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    worklogs.forEach(wl => {
        const startDate = new Date(wl.started);
        const endDate = new Date(startDate.getTime() + (wl.sec * 1000));
        
        const wd = daysOfWeek[startDate.getDay()];
        const dateStr = `${wd}, ${startDate.toLocaleDateString('pt-BR')}`;
        
        const startTime = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const endTime = endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        totalSec += wl.sec;

        tbody.innerHTML += `
            <tr>
                <td>${dateStr}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td>${wl.timeSpent}</td>
                <td>${wl.comment}</td>
            </tr>
        `;
    });

    tfoot.innerHTML = `
        <tr>
            <td colspan="3" style="text-align: right; border-top: 2px solid #dfe1e6; position: sticky; bottom: 0; background-color: #f4f5f7;">Total</td>
            <td style="border-top: 2px solid #dfe1e6; position: sticky; bottom: 0; background-color: #f4f5f7;">${formatSeconds(totalSec) || '0h'}</td>
            <td style="border-top: 2px solid #dfe1e6; position: sticky; bottom: 0; background-color: #f4f5f7;"></td>
        </tr>
    `;

    const modal = document.getElementById('worklogModal');
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'flex-start';
    modal.style.paddingTop = '8vh';
};

window.closeModal = function() {
    document.getElementById('worklogModal').style.display = 'none';
};

window.onclick = function(event) {
    const modal = document.getElementById('worklogModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};
