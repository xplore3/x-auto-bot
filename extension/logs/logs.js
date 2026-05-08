let allLogs = [];
let currentLevel = 'all';
let currentSource = 'all';
let refreshInterval = null;

const LEVEL_LABELS = {
  info: '信息',
  success: '成功',
  warn: '警告',
  error: '错误'
};

const SOURCE_LABELS = {
  scraper: '内容抓取',
  automator: '自动操作',
  background: '后台服务'
};

document.addEventListener('DOMContentLoaded', () => {
  loadLogs();
  setupFilters();
  setupAutoRefresh();
  setupClearButton();
});

function formatTime(ts) {
  const d = new Date(ts);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function loadLogs() {
  chrome.storage.local.get(['logs'], (result) => {
    allLogs = result.logs || [];
    updateStats();
    renderTable();
  });
}

function updateStats() {
  const counts = { info: 0, success: 0, warn: 0, error: 0 };
  allLogs.forEach(log => {
    if (counts[log.level] !== undefined) counts[log.level]++;
  });

  document.getElementById('totalCount').textContent = allLogs.length;
  document.getElementById('infoCount').textContent = counts.info;
  document.getElementById('successCount').textContent = counts.success;
  document.getElementById('warnCount').textContent = counts.warn;
  document.getElementById('errorCount').textContent = counts.error;
}

function getFilteredLogs() {
  return allLogs.filter(log => {
    const levelMatch = currentLevel === 'all' || log.level === currentLevel;
    const sourceMatch = currentSource === 'all' || log.source === currentSource;
    return levelMatch && sourceMatch;
  }).slice().reverse();
}

function renderTable() {
  const tbody = document.getElementById('logTableBody');
  const filtered = getFilteredLogs();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">${allLogs.length === 0 ? '暂无操作记录' : '没有符合筛选条件的记录'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const time = formatTime(log.time);
    const levelClass = log.level || 'info';
    const levelText = LEVEL_LABELS[log.level] || log.level;
    const sourceText = SOURCE_LABELS[log.source] || log.source || '未知';
    const msg = escapeHtml(log.message || '');
    return `
      <tr>
        <td><span class="log-time">${time}</span></td>
        <td><span class="log-level ${levelClass}">${levelText}</span></td>
        <td><span class="log-source">${sourceText}</span></td>
        <td><span class="log-message">${msg}</span></td>
      </tr>
    `;
  }).join('');
}

function setupFilters() {
  // Level filter buttons
  const levelButtons = document.querySelectorAll('#levelFilters .filter-btn');
  levelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      levelButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLevel = btn.dataset.level;
      renderTable();
    });
  });

  // Source filter dropdown
  document.getElementById('sourceFilter').addEventListener('change', (e) => {
    currentSource = e.target.value;
    renderTable();
  });
}

function setupAutoRefresh() {
  const checkbox = document.getElementById('autoRefresh');

  function startRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      loadLogs();
    }, 2000);
  }

  function stopRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) startRefresh();
    else stopRefresh();
  });

  if (checkbox.checked) startRefresh();
}

function setupClearButton() {
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('确定要清空所有操作记录吗？此操作不可恢复。')) return;
    chrome.storage.local.set({ logs: [] }, () => {
      allLogs = [];
      updateStats();
      renderTable();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
