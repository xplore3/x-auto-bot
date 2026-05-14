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
    const newLogs = result.logs || [];
    if (isSameLogs(allLogs, newLogs)) return;
    allLogs = newLogs;
    updateStats();
    renderTable();
  });
}

function isSameLogs(oldArr, newArr) {
  if (oldArr.length !== newArr.length) return false;
  if (oldArr.length === 0) return true;
  return oldArr[0].time === newArr[0].time &&
         oldArr[oldArr.length - 1].time === newArr[newArr.length - 1].time;
}

function updateStats() {
  const resultLogs = allLogs.filter(isResultLog);
  const counts = { post: 0, reply: 0, skip: 0, issue: 0 };
  resultLogs.forEach(log => {
    const kind = getResultLogKind(log);
    if (counts[kind] !== undefined) counts[kind]++;
  });

  document.getElementById('totalCount').textContent = resultLogs.length;
  document.getElementById('infoCount').textContent = counts.post;
  document.getElementById('successCount').textContent = counts.reply;
  document.getElementById('warnCount').textContent = counts.skip;
  document.getElementById('errorCount').textContent = counts.issue;
}

function getFilteredLogs() {
  return allLogs.filter(isResultLog).filter(log => {
    const levelMatch = currentLevel === 'all' || log.level === currentLevel;
    const sourceMatch = currentSource === 'all' || log.source === currentSource;
    return levelMatch && sourceMatch;
  });
}

function createLogRow(log) {
  const tr = document.createElement('tr');
  tr.dataset.time = String(log.time);
  const time = formatTime(log.time);
  const levelClass = log.level || 'info';
  const levelText = LEVEL_LABELS[log.level] || log.level;
  const sourceText = SOURCE_LABELS[log.source] || log.source || '未知';
  const msg = escapeHtml(formatResultLogMessage(log));

  tr.innerHTML = `
    <td><span class="log-time">${time}</span></td>
    <td><span class="log-level ${levelClass}">${levelText}</span></td>
    <td><span class="log-source">${sourceText}</span></td>
    <td><span class="log-message">${msg}</span></td>
  `;
  return tr;
}

function createEmptyRow(message) {
  const tr = document.createElement('tr');
  tr.className = 'empty-row';
  tr.innerHTML = `<td colspan="4">${message}</td>`;
  return tr;
}

function renderTable() {
  const tbody = document.getElementById('logTableBody');
  const filtered = getFilteredLogs();

  if (filtered.length === 0) {
    const resultCount = allLogs.filter(isResultLog).length;
    tbody.replaceChildren(createEmptyRow(resultCount === 0 ? '暂无成果记录：完成发布或回复后会显示在这里' : '没有符合筛选条件的成果记录'));
    return;
  }

  // 获取当前 DOM 中已存在的日志时间戳
  const existingTimes = new Set(
    Array.from(tbody.querySelectorAll('tr[data-time]')).map(tr => tr.dataset.time)
  );

  // 只把不在 DOM 中的新日志追加到 tbody 末尾（底部）
  const frag = document.createDocumentFragment();
  let appended = false;
  filtered.forEach(log => {
    if (!existingTimes.has(String(log.time))) {
      frag.appendChild(createLogRow(log));
      appended = true;
    }
  });

  if (appended) {
    tbody.appendChild(frag);
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
  }

  // 清理已不在 filtered 中的旧行（截断或筛选变化时）
  const filteredTimes = new Set(filtered.map(l => String(l.time)));
  tbody.querySelectorAll('tr[data-time]').forEach(tr => {
    if (!filteredTimes.has(tr.dataset.time)) {
      tr.remove();
    }
  });
}

function setupFilters() {
  const levelButtons = document.querySelectorAll('#levelFilters .filter-btn');
  levelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      levelButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLevel = btn.dataset.level;
      renderTable();
    });
  });

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
    if (!confirm('确定要清空所有记录吗？此操作不可恢复。')) return;
    chrome.storage.local.set({ logs: [] }, () => {
      allLogs = [];
      updateStats();
      renderTable();
    });
  });
}

function isResultLog(log = {}) {
  const message = String(log.message || '');
  const resultPatterns = [
    /已通过 X 官方 intent 回复/,
    /确认已回复/,
    /已回复 @/,
    /队列推文发送成功/,
    /测试推文发送成功/,
    /定时推文发送成功/,
    /X 原生定时发布(创建|写入)成功/,
    /已发 \d+ 条/,
    /已跳过/,
    /跳过 @/,
    /自动操作已暂停/,
    /已暂停/,
    /未确认成功/,
    /发送失败/,
    /发推失败/,
    /回复失败/
  ];
  return resultPatterns.some(pattern => pattern.test(message));
}

function getResultLogKind(log = {}) {
  const message = String(log.message || '');
  if (/已跳过|跳过 @/.test(message)) return 'skip';
  if (/已通过 X 官方 intent 回复|确认已回复|已回复 @|已回/.test(message)) return 'reply';
  if (/推文发送成功|定时推文发送成功|测试推文发送成功|X 原生定时发布|已发 \d+ 条/.test(message)) return 'post';
  if (/已暂停|失败|未确认成功|发送失败|未读取到|未找到|取消/.test(message) || log.level === 'error') return 'issue';
  return 'skip';
}

function formatResultLogMessage(log = {}) {
  return String(log.message || '')
    .replace(/^✅\s*/, '')
    .replace(/^⚠️\s*/, '')
    .replace(/，进入 \d+ 分钟互动冷却$/, '')
    .replace(/：检测到 X 发送成功提示$/, '')
    .replace(/：编辑器已关闭$/, '')
    .trim();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
