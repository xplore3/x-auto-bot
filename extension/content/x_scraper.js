// content/x_scraper.js
(function() {
'use strict';

console.log("X Auto Bot: Scraper loaded on X.com");

// Global cooldown to prevent hitting Gemini API rate limits (15 requests/min)
const REPLY_COOLDOWN_MS = 300000; // 5 minutes
const MAX_LOGS = 50;

// ==========================================
// Logging System
// ==========================================
function addLog(level, message) {
  if (!chrome.runtime?.id) return;
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'scraper'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function setProfileProgress(stage, message, percent) {
  if (!chrome.runtime?.id) return;
  const progress = {
    stage,
    message,
    percent,
    updatedAt: Date.now()
  };
  chrome.storage.local.set({ profileReadProgress: progress });
}

// ==========================================
// Auto Scroll Logic
// ==========================================
let scrollInterval = null;
let restTimeout = null;
let scrollCountInCycle = 0;

function startAutoScroll() {
  if (scrollInterval || restTimeout) return;
  chrome.storage.local.get(['isAutoPaused'], (result) => {
    if (result.isAutoPaused) {
      addLog('info', '自动操作已暂停，不启动自动滚动');
      return;
    }
    addLog('info', '启动自动滚动时间线');
    beginScrollCycle();
  });
}

function beginScrollCycle() {
  scrollCountInCycle = 0;
  const scrollsInThisCycle = 3 + Math.floor(Math.random() * 4); // 3~6 次
  addLog('info', `本轮计划滚动 ${scrollsInThisCycle} 次，然后休息`);

  function doOneScroll() {
    scrollCountInCycle++;
    const distance = 400 + Math.floor(Math.random() * 400); // 400~800 px，只向下
    window.scrollBy({ top: distance, behavior: 'smooth' });

    if (scrollCountInCycle >= scrollsInThisCycle) {
      // 本轮滚动结束，进入休息
      clearInterval(scrollInterval);
      scrollInterval = null;
      const restSec = 20 + Math.floor(Math.random() * 21); // 20~40 秒休息
      addLog('info', `滚动本轮结束，休息 ${restSec} 秒...`);
      restTimeout = setTimeout(() => {
        restTimeout = null;
        beginScrollCycle();
      }, restSec * 1000);
    }
  }

  // 首次立即滚动一次
  doOneScroll();
  // 后续每隔 2~5 秒滚动一次
  scrollInterval = setInterval(doOneScroll, 2000 + Math.floor(Math.random() * 3000));
}

function stopAutoScroll() {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  if (restTimeout) {
    clearTimeout(restTimeout);
    restTimeout = null;
  }
  addLog('info', '停止自动滚动');
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.isRunning) {
    if (changes.isRunning.newValue) {
      startAutoScroll();
      ensureBioExtracted();
    } else {
      stopAutoScroll();
    }
  }
});

// Initial check for auto-scroll
chrome.storage.local.get(['isRunning'], (result) => {
  if (result.isRunning) {
    startAutoScroll();
    ensureBioExtracted();
  }
});

// ==========================================
// Bio Extraction Logic with Progress Tracking
// ==========================================
function ensureBioExtracted() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['accountBio', 'isRunning', 'profileReadProgress', 'isAutoPaused'], (result) => {
    if (result.isAutoPaused) return;
    if (!result.isRunning || result.accountBio) {
      if (result.accountBio) {
        setProfileProgress('extracted', '主页简介已读取', 100);
      }
      return;
    }
    
    addLog('info', '开始提取账号主页简介...');
    setProfileProgress('checking_link', '正在检测 Profile 导航链接...', 15);
    
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      if (!chrome.runtime?.id) { clearInterval(checkInterval); return; }
      checkCount++;
      
      const profileLinkNode = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (!profileLinkNode) {
        if (checkCount % 3 === 0) {
          addLog('info', `等待 Profile 导航链接加载... (${checkCount}s)`);
        }
        return;
      }
      
      const profilePath = new URL(profileLinkNode.href).pathname;
      if (window.location.pathname.includes(profilePath)) {
        // We are on the profile page, wait for UserDescription
        setProfileProgress('waiting_bio', '正在 Profile 页面等待简介 DOM...', 65);
        const bioNode = document.querySelector('div[data-testid="UserDescription"]');
        if (bioNode) {
          const bioText = bioNode.innerText.trim();
          chrome.storage.local.set({ accountBio: bioText }, () => {
            addLog('success', `主页简介已提取: ${bioText.substring(0, 30)}...`);
            setProfileProgress('extracted', '主页简介已读取', 100);
          });
          clearInterval(checkInterval);
          return;
        }
        if (checkCount > 20) {
          addLog('warn', '在 Profile 页面等待简介超时，尝试从当前页面提取...');
          chrome.storage.local.set({ accountBio: document.querySelector('div[data-testid="UserDescription"]')?.innerText?.trim() || '' });
          setProfileProgress('extracted', '已尝试提取', 100);
          clearInterval(checkInterval);
        }
      } else {
        // Not on profile page, open it in background
        if (checkCount === 1) {
          setProfileProgress('opening_page', '正在打开 Profile 页面...', 35);
          addLog('info', '当前不在 Profile 页面，后台静默打开...');
          chrome.runtime.sendMessage({ action: 'openProfileTab', url: `https://x.com${profilePath}` });
        }
        if (checkCount > 15) {
          addLog('warn', '等待 Profile 页面加载超时，跳过简介提取');
          chrome.storage.local.set({ accountBio: '' });
          setProfileProgress('failed', '简介提取超时', 100);
          clearInterval(checkInterval);
        }
      }
    }, 1000);
  });
}

// ==========================================
// Tweet Scraping Logic
// ==========================================
function getTweetAuthor(tweetNode) {
  const userLinks = tweetNode.querySelectorAll('a[href^="/"]');
  for (const link of userLinks) {
    const match = link.getAttribute('href').match(/^\/(\w{1,15})\/?$/);
    if (match) return match[1];
  }
  const nameDiv = tweetNode.querySelector('div[data-testid="User-Name"]');
  if (nameDiv) {
    const atText = nameDiv.innerText.match(/@(\w{1,15})/);
    if (atText) return atText[1];
  }
  return '未知用户';
}

function getTweetText(tweetNode) {
  const textDiv = tweetNode.querySelector('div[data-testid="tweetText"]');
  if (textDiv) return textDiv.innerText.trim();
  const altText = tweetNode.querySelector('[data-testid="tweet"] span');
  if (altText) return altText.innerText.trim();
  return '';
}

let processedTweetIds = new Set();
let isReplying = false;
let twitterCooldownUntil = 0;
let apiCooldownUntil = 0;

function scrapeTweets() {
  if (!chrome.runtime?.id) return;
  if (isReplying) return;
  if (Date.now() < twitterCooldownUntil) return;
  if (Date.now() < apiCooldownUntil) return;

  chrome.storage.local.get(['isRunning', 'isAutoPaused', 'aiPersona', 'competitorReport', 'twitterCooldownUntil', 'apiCooldownUntil'], (result) => {
    if (!result.isRunning) return;
    if (result.isAutoPaused) {
      addLog('info', '自动操作已暂停，跳过推文抓取');
      return;
    }
    if (result.twitterCooldownUntil && Date.now() < result.twitterCooldownUntil) return;
    if (result.apiCooldownUntil && Date.now() < result.apiCooldownUntil) return;
    
    const persona = result.aiPersona;
    const hasPersona = persona && (persona.targetUsers || persona.characteristics || persona.goals);
    if (!hasPersona || !result.competitorReport) return;
    
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length === 0) return;
    
    for (const article of articles) {
      const tweetId = article.getAttribute('data-testid') + '_' + (article.querySelector('a[href*="/status/"]')?.getAttribute('href') || Math.random());
      
      if (processedTweetIds.has(tweetId)) continue;
      processedTweetIds.add(tweetId);
      
      const author = getTweetAuthor(article);
      const text = getTweetText(article);
      
      if (!text || text.length < 10) continue;
      
      addLog('info', `发现推文 @${author}: ${text.substring(0, 50)}...`);
      
      isReplying = true;
      twitterCooldownUntil = Date.now() + REPLY_COOLDOWN_MS;
      chrome.storage.local.set({ twitterCooldownUntil });
      
      chrome.runtime.sendMessage({
        action: 'generateReply',
        tweetText: text,
        tweetContent: text,
        tweetAuthor: author,
        tweetElementId: tweetId
      }, (response) => {
        isReplying = false;
        if (chrome.runtime.lastError) {
          addLog('error', '生成回复失败: ' + chrome.runtime.lastError.message);
          return;
        }
        if (response && response.error) {
          addLog('error', 'AI 生成回复失败: ' + response.error);
          if (response.isApiCooldown) {
            apiCooldownUntil = Date.now() + 60000;
            chrome.storage.local.set({ apiCooldownUntil });
          }
          return;
        }
        const replyText = response ? (response.replyText || response.reply) : '';
        if (replyText) {
          addLog('success', `已生成回复 @${author}: ${replyText.substring(0, 40)}...`);
          
          // Dispatch event for automator
          window.dispatchEvent(new CustomEvent('xAutoBot_ReadyToReply', {
            detail: { tweetElementId: tweetId, replyText, tweetAuthor: author, tweetContent: text }
          }));
        }
      });
      
      break; // Only process one tweet per cycle
    }
  });
}

setInterval(scrapeTweets, 5000);

// ==========================================
// Widget System
// ==========================================
let botState = {};
let logPanelOpen = false;

chrome.storage.local.get(null, (res) => {
  botState = res || {};
  renderWidget();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    Object.keys(changes).forEach(key => {
      botState[key] = changes[key].newValue;
    });
    if (changes.isAutoPaused && changes.isAutoPaused.newValue) {
      stopAutoScroll();
      addLog('info', '自动操作已暂停，停止自动滚动');
    }
    renderWidget();
  }
});

// 高频检查，确保 SPA 路由切换后 widget 能快速恢复
setInterval(() => {
  ensureWidget();
}, 1000);

// 每秒刷新 widget 内容（时间、状态、倒计时等）
setInterval(() => {
  renderWidget();
}, 1000);

function ensureWidget() {
  if (!chrome.runtime?.id) return;
  let widget = document.getElementById('x-auto-bot-widget');
  if (!botState.isRunning) {
    if (!widget) renderWidget();
    return;
  }
  if (!widget) {
    renderWidget();
  } else if (widget.classList.contains('hidden')) {
    widget.classList.remove('hidden');
  }
}

function formatLogTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function getLevelEmoji(level) {
  switch (level) {
    case 'success': return '✅';
    case 'warn': return '⚠️';
    case 'error': return '❌';
    default: return 'ℹ️';
  }
}

function getWidgetConfigErrors(state) {
  const errors = [];
  if (!state.apiKey) errors.push('API Key');
  if (!state.leadTarget) errors.push('引流目标');
  if (state.apiProvider && state.apiProvider !== 'gemini' && !state.aiModel) errors.push('模型名称');
  return errors;
}

function renderWidget() {
  if (!chrome.runtime?.id) return;
  
  let widget = document.getElementById('x-auto-bot-widget');
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'x-auto-bot-widget';
    (document.body || document.documentElement).appendChild(widget);
  }

  const configErrors = botState.configErrors && botState.configErrors.length > 0 
    ? botState.configErrors 
    : getWidgetConfigErrors(botState);

  const now = Date.now();
  const isPersonaEmpty = !botState.aiPersona || (!botState.aiPersona.targetUsers && !botState.aiPersona.characteristics && !botState.aiPersona.goals);
  const qLen = botState.tweetQueue ? botState.tweetQueue.length : 0;
  
  const twitterCooldownSecs = botState.twitterCooldownUntil && botState.twitterCooldownUntil > now 
    ? Math.ceil((botState.twitterCooldownUntil - now) / 1000) : 0;
  
  const apiCooldownSecs = botState.apiCooldownUntil && botState.apiCooldownUntil > now
    ? Math.ceil((botState.apiCooldownUntil - now) / 1000) : 0;
  
  let focusStatus = '';
  let statusClass = 'idle';

  if (!botState.isRunning) {
    focusStatus = configErrors.length > 0 ? `待配置：${configErrors.join('、')}` : '待启动：点击扩展按钮启动 Agent';
    statusClass = configErrors.length > 0 ? 'warn' : 'idle';
  } else if (botState.isAutoPaused) {
    focusStatus = botState.pauseReason || '已暂停，等待人工检查';
    statusClass = 'error';
  } else if (botState.isTyping) {
    focusStatus = '正在处理发布或回复动作';
    statusClass = 'active';
  } else if (botState.isGeneratingReply) {
    focusStatus = '正在生成互动回复';
    statusClass = 'active';
  } else if (apiCooldownSecs > 0) {
    focusStatus = `AI 接口保护中，${apiCooldownSecs}s 后重试`;
    statusClass = 'warn';
  } else if (twitterCooldownSecs > 0) {
    focusStatus = `互动冷却中，${twitterCooldownSecs}s 后继续`;
    statusClass = 'active';
  } else if (botState.isAnalyzingPersona) {
    focusStatus = '正在分析账号画像';
    statusClass = 'active';
  } else if (botState.isAnalyzingCompetitors) {
    focusStatus = '正在整理竞品和爆款框架';
    statusClass = 'active';
  } else if (botState.isGenerating) {
    focusStatus = '正在生成内容草稿';
    statusClass = 'active';
  } else if (isPersonaEmpty || !botState.competitorReport) {
    focusStatus = '策略基建未完成，暂不执行互动';
    statusClass = 'warn';
  } else {
    focusStatus = '运行中：正在观察时间线和排期';
    statusClass = 'active';
  }

  const repliesSent = botState.stats ? botState.stats.repliesSent : 0;
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  const nextPostStr = botState.nextPostTime ? botState.nextPostTime : '待计算';

  const progress = botState.profileReadProgress || { stage: 'idle', percent: 0, message: '等待启动...' };
  const showProgress = !botState.accountBio && botState.isRunning;
  const progressClass = progress.stage === 'extracted' ? 'done' : (progress.stage === 'failed' ? 'error' : '');

  const logs = botState.logs || [];
  const recentLogs = logs.slice(-12);
  const logRows = recentLogs.length === 0
    ? '<div class="x-bot-log-item"><span class="x-bot-log-msg info">暂无日志...</span></div>'
    : recentLogs.map(log => `
        <div class="x-bot-log-item" data-time="${log.time}">
          <span class="x-bot-log-time">${formatLogTime(log.time)}</span>
          <span class="x-bot-log-level">${getLevelEmoji(log.level || 'info')}</span>
          <span class="x-bot-log-msg ${log.level || 'info'}">${escapeHtml(log.message || '')}</span>
        </div>
      `).join('');

  const milestone = (done, label, meta = '') => `
    <div class="x-bot-milestone ${done ? 'done' : ''}">
      <span class="x-bot-dot"></span>
      <span>${label}${meta ? ` <em>${meta}</em>` : ''}</span>
    </div>
  `;

  widget.innerHTML = `
    <style>
      #x-auto-bot-widget {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 340px;
        background: #ffffff;
        border: 1px solid #dce3ea;
        border-radius: 10px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
        z-index: 99999;
        color: #17212b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        overflow: hidden;
      }
      .x-bot-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 14px;
        background: #111923;
        color: #f8fafc;
      }
      .x-bot-title {
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 800;
      }
      .x-bot-status-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #94a3b8;
      }
      .x-bot-status-dot.active { background: #0f9f6e; box-shadow: 0 0 0 4px rgba(15,159,110,0.18); }
      .x-bot-status-dot.warn { background: #b7791f; }
      .x-bot-status-dot.error { background: #d64545; }
      .x-bot-time {
        color: #9aa7b5;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
      }
      .x-bot-status-panel,
      .x-bot-progress-panel,
      .x-bot-milestones,
      .x-bot-next-post,
      .x-bot-log-toggle {
        border-bottom: 1px solid #dce3ea;
      }
      .x-bot-status-panel {
        padding: 13px 14px;
      }
      .x-bot-status-label,
      .x-bot-progress-title {
        color: #65717e;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .x-bot-status-text {
        margin-top: 5px;
        color: #17212b;
        font-weight: 750;
        line-height: 1.4;
      }
      .x-bot-status-text.warn { color: #b7791f; }
      .x-bot-status-text.error { color: #d64545; }
      .x-bot-alert,
      .x-bot-pause-panel {
        padding: 11px 14px;
        border-bottom: 1px solid #dce3ea;
        background: #fff7e8;
        color: #7c520f;
      }
      .x-bot-pause-panel {
        background: #fff1f1;
        color: #9f2f2f;
      }
      .x-bot-alert-title,
      .x-bot-pause-title {
        font-weight: 800;
        margin-bottom: 4px;
      }
      .x-bot-alert-text,
      .x-bot-pause-reason {
        font-size: 12px;
        line-height: 1.45;
      }
      .x-bot-resume-btn {
        margin-top: 9px;
        min-height: 30px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        background: #d64545;
        color: #fff;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .x-bot-progress-panel {
        padding: 12px 14px;
      }
      .x-bot-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .x-bot-progress-percent {
        color: #0f8bd6;
        font-weight: 800;
        font-size: 12px;
      }
      .x-bot-progress-bar-bg {
        height: 5px;
        background: #eef2f5;
        border-radius: 999px;
        overflow: hidden;
      }
      .x-bot-progress-bar-fill {
        height: 100%;
        background: #0f8bd6;
        border-radius: 999px;
      }
      .x-bot-progress-msg {
        margin-top: 7px;
        color: #65717e;
        font-size: 12px;
      }
      .x-bot-milestones {
        display: grid;
        gap: 7px;
        padding: 12px 14px;
      }
      .x-bot-milestone {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #65717e;
        font-size: 12px;
      }
      .x-bot-milestone.done {
        color: #17212b;
      }
      .x-bot-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #cfd8e3;
      }
      .x-bot-milestone.done .x-bot-dot {
        background: #0f9f6e;
      }
      .x-bot-milestone em {
        color: #0f8bd6;
        font-style: normal;
        font-weight: 750;
      }
      .x-bot-next-post {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        background: #dce3ea;
      }
      .x-bot-mini-stat {
        padding: 10px 14px;
        background: #fff;
      }
      .x-bot-mini-stat span {
        display: block;
        color: #65717e;
        font-size: 11px;
        margin-bottom: 4px;
      }
      .x-bot-mini-stat strong {
        display: block;
        color: #17212b;
        font-size: 12px;
        line-height: 1.3;
        word-break: break-word;
      }
      .x-bot-log-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        color: #65717e;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        user-select: none;
      }
      .x-bot-log-toggle-icon {
        transition: transform 0.2s;
      }
      .x-bot-log-toggle-icon.open {
        transform: rotate(90deg);
      }
      .x-bot-log-list {
        max-height: 0;
        overflow-y: auto;
        transition: max-height 0.2s;
        overscroll-behavior: contain;
      }
      .x-bot-log-list.open {
        max-height: 220px;
      }
      .x-bot-log-item {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        padding: 7px 14px;
        border-bottom: 1px solid #eef2f5;
        font-size: 12px;
      }
      .x-bot-log-time {
        flex: 0 0 auto;
        color: #65717e;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px;
      }
      .x-bot-log-level {
        flex: 0 0 auto;
        font-size: 11px;
      }
      .x-bot-log-msg {
        flex: 1;
        color: #17212b;
        line-height: 1.4;
        word-break: break-word;
      }
      .x-bot-log-msg.success { color: #0f9f6e; }
      .x-bot-log-msg.warn { color: #b7791f; }
      .x-bot-log-msg.error { color: #d64545; }
    </style>
    <div class="x-bot-header">
      <div class="x-bot-title">
        <span class="x-bot-status-dot ${statusClass}"></span>
        <span>Voice Agent</span>
      </div>
      <div class="x-bot-time">${timeStr}</div>
    </div>

    <div class="x-bot-status-panel">
      <div class="x-bot-status-label">Current Focus</div>
      <div class="x-bot-status-text ${statusClass}">${escapeHtml(focusStatus)}</div>
    </div>

    ${botState.isAutoPaused ? `
      <div class="x-bot-pause-panel" id="x-bot-pause-panel">
        <div class="x-bot-pause-title">自动操作已暂停</div>
        <div class="x-bot-pause-reason">${escapeHtml(botState.pauseReason || '操作失败，等待人工干预')}</div>
        <button class="x-bot-resume-btn" id="x-bot-resume-btn">继续运行</button>
      </div>
    ` : ''}

    ${configErrors.length > 0 ? `
      <div class="x-bot-alert">
        <div class="x-bot-alert-title">配置未完成</div>
        <div class="x-bot-alert-text">缺少：${escapeHtml(configErrors.join('、'))}</div>
      </div>
    ` : ''}

    ${showProgress ? `
      <div class="x-bot-progress-panel">
        <div class="x-bot-progress-header">
          <span class="x-bot-progress-title">Profile Readiness</span>
          <span class="x-bot-progress-percent">${progress.percent}%</span>
        </div>
        <div class="x-bot-progress-bar-bg">
          <div class="x-bot-progress-bar-fill" style="width: ${progress.percent}%"></div>
        </div>
        <div class="x-bot-progress-msg ${progressClass}">${escapeHtml(progress.message)}</div>
      </div>
    ` : ''}

    <div class="x-bot-milestones">
      ${milestone(Boolean(botState.accountBio), '读取主页简介')}
      ${milestone(!isPersonaEmpty, '人设与目标用户')}
      ${milestone(Boolean(botState.competitorReport), '竞品与爆款框架')}
      ${milestone(qLen >= 5, '内容草稿库存', `${qLen}/20`)}
    </div>

    <div class="x-bot-next-post">
      <div class="x-bot-mini-stat">
        <span>下次发布</span>
        <strong>${escapeHtml(nextPostStr)}</strong>
      </div>
      <div class="x-bot-mini-stat">
        <span>今日互动</span>
        <strong>${repliesSent} 次</strong>
      </div>
    </div>

    <div class="x-bot-log-panel">
      <div class="x-bot-log-toggle" id="x-bot-log-toggle">
        <span>行动记录 (${logs.length})</span>
        <span class="x-bot-log-toggle-icon ${logPanelOpen ? 'open' : ''}">›</span>
      </div>
      <div class="x-bot-log-list ${logPanelOpen ? 'open' : ''}" id="x-bot-log-list">
        ${logRows}
      </div>
    </div>
  `;

  const toggleBtn = widget.querySelector('#x-bot-log-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      logPanelOpen = !logPanelOpen;
      renderWidget();
    });
  }

  const resumeBtn = widget.querySelector('#x-bot-resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      chrome.storage.local.set({ isAutoPaused: false, pauseReason: '' }, () => {
        addLog('info', '用户手动恢复自动运行');
      });
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

})();
