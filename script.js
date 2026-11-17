let globalIssuesData = [];
let activeGroups = ['tipo', 'issue'];
let currentWorklogs = [];
let currentDates = [];

window.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('dateTo').value = today.toISOString().split('T')[0];
    document.getElementById('dateFrom').value = firstDay.toISOString().split('T')[0];
});

document.getElementById('btnGenerate').addEventListener('click', async function() {
    const email = document.getElementById('jiraEmail').value.trim();
    const token = document.getElementById('jiraToken').value.trim();
    const fromStr = document.getElementById('dateFrom').value;
    const toStr = document.getElementById('dateTo').value;
    const statusMsg = document.getElementById('statusMsg');

    if (!token) {
        alert("Por favor, insira seu API Token do Jira.");
        return;
    }
    if (!fromStr || !toStr) {
        alert("Preencha as datas Inicial e Final.");
        return;
    }

    statusMsg.innerText = "Buscando dados no Jira...";
    document.getElementById('btnGenerate').disabled = true;

    const auth = btoa(`${email}:${token}`);
    const jql = `worklogDate >= "${fromStr}" AND worklogDate <= "${toStr}"`;

    const bodyData = {
        jql: jql,
        maxResults: 1000,
        fields: ["summary", "project", "issuetype", "worklog"]
    };

    try {
        const response = await fetch("https://guaranisistemas.atlassian.net/rest/api/3/search/jql", {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status}: Acesso bloqueado. Verifique seu Token e se a extensão CORS está ativa no navegador.`);
        }

        const data = await response.json();
        globalIssuesData = data.issues;
        
        statusMsg.innerText = "Dados carregados com sucesso!";
        
        applyFilters(email, fromStr, toStr);
        
        setTimeout(() => { statusMsg.innerText = ""; }, 3000);
        
    } catch (err) {
        console.error(err);
        statusMsg.innerText = "Falha na requisição.";
        alert(err.message);
    } finally {
        document.getElementById('btnGenerate').disabled = false;
    }
});

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

function applyFilters(emailTarget, fromStr, toStr) {
    if (!globalIssuesData || globalIssuesData.length === 0) {
        document.getElementById('reportContainer').innerHTML = "<div class='empty-msg'>Nenhum dado retornado do Jira para esse período.</div>";
        document.getElementById('groupBySection').style.display = 'none';
        return;
    }

    currentWorklogs = [];
    
    globalIssuesData.forEach(issue => {
        if (!issue.fields.worklog || !issue.fields.worklog.worklogs) return;
        
        issue.fields.worklog.worklogs.forEach(wl => {
            const email = wl.author.emailAddress ? wl.author.emailAddress.toLowerCase() : "";
            if (email === emailTarget.toLowerCase()) {
                const d = wl.started.split('T')[0];
                if (d >= fromStr && d <= toStr) {
                    currentWorklogs.push({
                        issueKey: issue.key,
                        type: issue.fields.issuetype.name,
                        typeIcon: issue.fields.issuetype.iconUrl,
                        date: d,
                        sec: wl.timeSpentSeconds
                    });
                }
            }
        });
    });

    const reportContainer = document.getElementById('reportContainer');

    if (currentWorklogs.length === 0) {
        reportContainer.innerHTML = "<div class='empty-msg'>Você não possui apontamentos nesse período.</div>";
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

function renderHTML() {
    if (activeGroups.length === 0) {
        document.getElementById('reportContainer').innerHTML = "<div class='empty-msg'>Selecione pelo menos um campo no 'Group By' para visualizar a tabela.</div>";
        return;
    }

    let html = `<div class="table-wrapper"><table><thead>`;
    
    html += `<tr>`;
    
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
                grp.issues[wl.issueKey] = { total: 0, daily: daily };
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
                
                html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="2">
                    <div class="flex-align">
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank">
                            <img src="${grp.icon}" onerror="this.style.display='none'"> 
                        </a>
                        <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank">${key}</a>
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
                issues[wl.issueKey] = { total: 0, icon: wl.typeIcon, daily: daily };
            }
            if (issues[wl.issueKey].daily[wl.date] !== undefined) {
                issues[wl.issueKey].daily[wl.date] += wl.sec;
            }
            issues[wl.issueKey].total += wl.sec;
        });

        Object.keys(issues).sort().forEach(key => {
            const iss = issues[key];
            html += `<tr>`;
            html += `<td class="sticky-col col-auto bg-white col-issue-cell" data-sticky-idx="0">
                <div class="flex-align">
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank">
                        <img src="${iss.icon}" onerror="this.style.display='none'"> 
                    </a>
                    <a href="https://guaranisistemas.atlassian.net/browse/${key}" target="_blank">${key}</a>
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

    // Fechamento do Corpo e Início do Footer
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

    // A mágica para ajustar os `left` das colunas sticky
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
