let globalIssuesData = [];

let activeGroups = ['tipo', 'issue'];
let currentWorklogs = [];
let currentDates = [];
let modalData = {};

document.getElementById('jsonFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('fileName').innerText = file.name;
    
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
});

document.getElementById('btnGenerate').addEventListener('click', applyFilters);

function renderGroupByUI() {
    const container = document.getElementById('groupByTags');
    container.innerHTML = '';
    
    activeGroups.forEach(g => {
        const label = g === 'tipo' ? 'Tipo de item' : 'Issue';
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `${label} <span onclick="removeGroup('${g}')">×</span>`;
        container.appendChild(tag);
    });
    
    const select = document.getElementById('addGroupSelect');
    select.innerHTML = '<option value="">+ Add field...</option>';
    if (!activeGroups.includes('tipo')) select.innerHTML += '<option value="tipo">Tipo de item</option>';
    if (!activeGroups.includes('issue')) select.innerHTML += '<option value="issue">Issue</option>';
    
    select.style.display = activeGroups.length === 2 ? 'none' : 'block';
}

window.removeGroup = function(g) {
    activeGroups = activeGroups.filter(x => x !== g);
    renderGroupByUI();
    if(currentWorklogs.length > 0) renderHTML();
};

document.getElementById('addGroupSelect').addEventListener('change', function(e) {
    if (e.target.value) {
        activeGroups.push(e.target.value);
        if (activeGroups.includes('tipo') && activeGroups.includes('issue')) {
            activeGroups = ['tipo', 'issue'];
        }
        renderGroupByUI();
        if(currentWorklogs.length > 0) renderHTML();
    }
});

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

function applyFilters() {
    if (globalIssuesData.length === 0) {
        alert("Carregue o JSON primeiro.");
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
        
        // Identificação inteligente do Ticket Pai (caso seja subtarefa ou mencione outro ERP no sumário)
        let pKey = null;
        if (issue.fields.parent && issue.fields.parent.key) {
            pKey = issue.fields.parent.key;
        } else {
            // Procura por padrões como [ERP-23820] ou ERP-23820 no sumário
            const matches = issue.fields.summary.match(/ERP-\d+/g);
            if (matches) {
                // Pega o primeiro ERP encontrado que seja diferente da própria issue atual
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
                    summary: issue.fields.summary || "Sem Título",
                    type: issue.fields.issuetype.name,
                    typeIcon: issue.fields.issuetype.iconUrl,
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

    if (currentWorklogs.length === 0) {
        reportContainer.innerHTML = "<div class='empty-msg'>Nenhum apontamento encontrado nesse período.</div>";
        document.getElementById('groupBySection').style.display = 'none';
        return;
    }

    document.getElementById('groupBySection').style.display = 'flex';
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

const btnIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`;

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
                            <span class="text-content" title="${typeName}">${typeName}</span>
                        </div>
                    </td>`;
                    
                    html += `<td rowspan="${issueKeys.length}" class="sticky-col col-total col-yellow text-bold" data-sticky-idx="1">
                        ${formatSeconds(grp.total)}
                    </td>`;
                }
                
                // UX Tooltip refinado: exibe o pai (se houver) + o título do ticket ao passar o mouse
                const tooltipText = iss.parentKey ? `[${iss.parentKey}] ${iss.summary}` : iss.summary;

                html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="2">
                    <div class="flex-align">
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" title="${tooltipText}">
                            <img src="${grp.icon}" onerror="this.style.display='none'"> 
                        </a>
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" title="${tooltipText}">${key}</a>
                        <button class="btn-details" onclick="openModal('${key}')" title="Ver detalhes">${btnIcon}</button>
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
            
            const tooltipText = iss.parentKey ? `[${iss.parentKey}] ${iss.summary}` : iss.summary;

            html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="0">
                <div class="flex-align">
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" title="${tooltipText}">
                        <img src="${iss.icon}" onerror="this.style.display='none'"> 
                    </a>
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank" title="${tooltipText}">${key}</a>
                    <button class="btn-details" onclick="openModal('${key}')" title="Ver detalhes">${btnIcon}</button>
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
                    <span class="text-content" title="${key}">${key}</span>
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

// ================= LÓGICA DO MODAL =================
window.openModal = function(issueKey) {
    const worklogs = modalData[issueKey];
    if (!worklogs || worklogs.length === 0) return;

    const issueSummary = worklogs[0].summary;
    const parentKey = worklogs[0].parentKey;

    // Constrói o cabeçalho no padrão visual de breadcrumb do Jira (Pai / Filho) com destaque limpo
    let titleHtml = '';
    if (parentKey) {
        titleHtml = `<a href="https://guaranisistemas.atlassian.net/browse/${parentKey}" target="_blank" style="color: #5e6c84; text-decoration: none; font-weight: 500; font-size: 16px;">${parentKey}</a> <span style="color: #97a0af; margin: 0 4px; font-weight: 300;">/</span> `;
    }
    titleHtml += `<a href="https://guaranisistemas.atlassian.net/browse/${issueKey}" target="_blank" style="color: #0052cc; text-decoration: none; font-weight: 600;">${issueKey}</a>`;

    document.getElementById('modalTitle').innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; font-size: 20px; line-height: 1.2;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0052cc" stroke-width="2" style="margin-right: 10px; flex-shrink: 0;">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <div style="display: flex; align-items: center; flex-wrap: wrap;">
                    ${titleHtml}
                </div>
            </div>
            <div style="font-size: 14px; color: #5e6c84; font-weight: normal; margin-left: 32px; line-height: 1.4;">
                ${issueSummary}
            </div>
        </div>
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
    modal.style.paddingTop = '10vh';

    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.margin = '0'; 
        modalContent.style.maxHeight = '80vh';
        modalContent.style.display = 'grid';
        modalContent.style.gridTemplateRows = 'auto 1fr';
        modalContent.style.overflow = 'hidden'; 
    }

    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
        modalBody.style.overflowY = 'auto';
        modalBody.style.paddingRight = '4px';
    }
}

window.closeModal = function() {
    document.getElementById('worklogModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('worklogModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}
