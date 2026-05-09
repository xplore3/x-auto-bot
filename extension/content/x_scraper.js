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
        if (response && response.reply) {
          const replyText = response.reply;
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
  if (botState.isRunning) ensureWidget();
}, 200);

// 每秒刷新 widget 内容（时间、状态、倒计时等）
setInterval(() => {
  if (botState.isRunning) renderWidget();
}, 1000);

function ensureWidget() {
  if (!chrome.runtime?.id) return;
  let widget = document.getElementById('x-auto-bot-widget');
  if (!botState.isRunning) {
    if (widget) widget.classList.add('hidden');
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

function createLogItem(log) {
  const div = document.createElement('div');
  div.className = 'x-bot-log-item';
  div.dataset.time = String(log.time);
  const time = formatLogTime(log.time);
  const level = log.level || 'info';
  const emoji = getLevelEmoji(level);
  div.innerHTML = `
    <span class="x-bot-log-time">${time}</span>
    <span class="x-bot-log-level">${emoji}</span>
    <span class="x-bot-log-msg ${level}">${escapeHtml(log.message)}</span>
  `;
  return div;
}

function renderWidget() {
  if (!chrome.runtime?.id) return;
  
  let widget = document.getElementById('x-auto-bot-widget');
  const isFirstRender = !widget;
  
  if (!botState.isRunning) {
    if (widget) widget.classList.add('hidden');
    return;
  }
  
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'x-auto-bot-widget';
    (document.body || document.documentElement).appendChild(widget);
  }
  widget.classList.remove('hidden');

  // 配置错误检测
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
  
  // Determine absolute focus status
  let focusStatus = "";
  let isError = false;
  
  if (botState.isTyping) {
    focusStatus = "⌨️ 正在模拟敲击发送回复...";
  } else if (botState.isGeneratingReply) {
    focusStatus = "💬 正在构思高转化神回复...";
  } else if (apiCooldownSecs > 0) {
    focusStatus = `⚠️ AI 接口额度受限，触发接口保护 (${apiCooldownSecs}s)...`;
    isError = true;
  } else if (twitterCooldownSecs > 0) {
    focusStatus = `🛡️ 评论成功！防封号静默中 (${twitterCooldownSecs}s)...`;
  } else if (botState.isAnalyzingPersona) {
    focusStatus = "🧠 正在深度分析账号画像...";
  } else if (botState.isAnalyzingCompetitors) {
    focusStatus = "📊 正在检索对标竞品框架...";
  } else if (botState.isGenerating) {
    focusStatus = "✍️ 正在批量创作推文草稿...";
  } else if (isPersonaEmpty || !botState.competitorReport) {
    focusStatus = "🏗️ 大脑构建中，暂停行动等待基建完成...";
  } else {
    focusStatus = "👀 正在模拟真人浏览时间线...";
  }

  // Determine milestone statuses
  const m1 = botState.accountBio ? '<span class="x-bot-icon">✅</span>' : '<span class="x-bot-icon">⏳</span>';
  const m2 = !isPersonaEmpty ? '<span class="x-bot-icon">✅</span>' : '<span class="x-bot-icon">⏳</span>';
  const m3 = botState.competitorReport ? '<span class="x-bot-icon">✅</span>' : '<span class="x-bot-icon">⏳</span>';
  const m4 = qLen >= 5 ? '<span class="x-bot-icon">✅</span>' : '<span class="x-bot-icon">⏳</span>';
  
  const repliesSent = botState.stats ? botState.stats.repliesSent : 0;
  
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  const nextPostStr = botState.nextPostTime ? botState.nextPostTime : "待计算";

  // Profile Progress
  const progress = botState.profileReadProgress || { stage: 'idle', percent: 0, message: '等待启动...' };
  const showProgress = !botState.accountBio && botState.isRunning;
  const progressClass = progress.stage === 'extracted' ? 'done' : (progress.stage === 'failed' ? 'error' : '');

  // Logs - 正序：最早在前，最新在后
  const logs = botState.logs || [];
  const recentLogs = logs.slice(-12);

  if (isFirstRender) {
    // 首次渲染：生成完整 HTML
    widget.innerHTML = `
      <style>
        #x-auto-bot-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 340px;
          background: #0f1419;
          border: 1px solid #2f3336;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          color: #e7e9ea;
          overflow: hidden;
        }
        #x-auto-bot-widget.hidden { display: none !important; }
        .x-bot-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #2f3336;
          background: rgba(29, 161, 242, 0.08);
        }
        .x-bot-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
        }
        .x-bot-pulse {
          width: 8px;
          height: 8px;
          background: #00BA7C;
          border-radius: 50%;
          animation: x-bot-pulse 2s infinite;
        }
        @keyframes x-bot-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .x-bot-header-time {
          font-family: monospace;
          font-size: 12px;
          color: #8899a6;
        }
        .x-bot-status-panel {
          padding: 12px 16px;
          border-bottom: 1px solid #2f3336;
        }
        .x-bot-status-label {
          font-size: 11px;
          color: #8899a6;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .x-bot-status-text {
          font-weight: 500;
        }
        .x-bot-config-alert {
          padding: 12px 16px;
          background: rgba(255, 77, 79, 0.08);
          border-left: 3px solid #ff4d4f;
        }
        .x-bot-config-alert-title {
          font-weight: 600;
          color: #ff4d4f;
          margin-bottom: 4px;
        }
        .x-bot-config-alert-items {
          font-size: 12px;
          color: rgba(255, 77, 79, 0.8);
        }
        .x-bot-config-alert-hint {
          font-size: 11px;
          color: #8899a6;
          margin-top: 6px;
        }
        .x-bot-progress-panel {
          padding: 12px 16px;
          border-bottom: 1px solid #2f3336;
        }
        .x-bot-progress-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .x-bot-progress-title {
          font-size: 12px;
          color: #8899a6;
        }
        .x-bot-progress-percent {
          font-family: monospace;
          font-size: 12px;
          color: #1DA1F2;
        }
        .x-bot-progress-bar-bg {
          height: 4px;
          background: #2f3336;
          border-radius: 2px;
          overflow: hidden;
        }
        .x-bot-progress-bar-fill {
          height: 100%;
          background: #1DA1F2;
          border-radius: 2px;
          transition: width 0.3s;
        }
        .x-bot-progress-msg {
          font-size: 11px;
          margin-top: 6px;
        }
        .x-bot-progress-msg.done { color: #00BA7C; }
        .x-bot-progress-msg.error { color: #ff4d4f; }
        .x-bot-milestones {
          padding: 10px 16px;
          border-bottom: 1px solid #2f3336;
        }
        .x-bot-milestone {
          font-size: 12px;
          padding: 4px 0;
          color: rgba(255,255,255,0.6);
        }
        .x-bot-milestone.done { color: #00BA7C; }
        .x-bot-icon { display: inline-block; width: 20px; }
        .x-bot-next-post {
          padding: 10px 16px;
          font-size: 12px;
          color: #8899a6;
          border-bottom: 1px solid #2f3336;
        }
        .x-bot-log-panel {
          border-top: 1px solid #2f3336;
        }
        .x-bot-log-toggle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 12px;
          color: #8899a6;
          user-select: none;
        }
        .x-bot-log-toggle:hover {
          background: rgba(255,255,255,0.02);
        }
        .x-bot-log-toggle-icon {
          font-size: 10px;
          transition: transform 0.2s;
        }
        .x-bot-log-toggle-icon.open {
          transform: rotate(90deg);
        }
        .x-bot-log-list {
          max-height: 0;
          overflow-y: auto;
          transition: max-height 0.3s;
          overscroll-behavior: contain;
        }
        .x-bot-log-list.open {
          max-height: 240px;
        }
        .x-bot-log-list::-webkit-scrollbar {
          width: 4px;
        }
        .x-bot-log-list::-webkit-scrollbar-thumb {
          background: #38444d;
          border-radius: 2px;
        }
        .x-bot-log-item {
          padding: 6px 16px;
          font-size: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          display: flex;
          gap: 6px;
          align-items: flex-start;
        }
        .x-bot-log-time {
          font-family: monospace;
          color: #8899a6;
          white-space: nowrap;
          font-size: 11px;
        }
        .x-bot-log-level {
          font-size: 11px;
        }
        .x-bot-log-msg {
          flex: 1;
          word-break: break-word;
          line-height: 1.4;
        }
        .x-bot-log-msg.info { color: rgba(255,255,255,0.75); }
        .x-bot-log-msg.success { color: #00BA7C; }
        .x-bot-log-msg.warn { color: #f5a623; }
        .x-bot-log-msg.error { color: #ff4d4f; }
        .x-bot-pause-panel {
          padding: 12px 16px;
          background: rgba(255, 77, 79, 0.12);
          border-left: 3px solid #ff4d4f;
        }
        .x-bot-pause-title {
          font-weight: 600;
          color: #ff4d4f;
          margin-bottom: 6px;
        }
        .x-bot-pause-reason {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 10px;
        }
        .x-bot-resume-btn {
          background: #ff4d4f;
          color: #fff;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .x-bot-resume-btn:hover {
          background: #ff7875;
        }
      </style>
      <div class="x-bot-header">
        <div class="x-bot-header-left">
          <div class="x-bot-pulse"></div>
          <span>X-Auto 指挥枢纽</span>
        </div>
        <div class="x-bot-header-time">${timeStr}</div>
      </div>
      
      <div class="x-bot-status-panel">
        <div class="x-bot-status-label">当前绝对焦点状态</div>
        <div class="x-bot-status-text" style="color: ${isError ? '#ff4d4f' : '#1DA1F2'}">${focusStatus}</div>
      </div>
      
      ${botState.isAutoPaused ? `
      <div class="x-bot-pause-panel" id="x-bot-pause-panel">
        <div class="x-bot-pause-title">🛑 自动操作已暂停</div>
        <div class="x-bot-pause-reason">${escapeHtml(botState.pauseReason || '操作失败，等待人工干预')}</div>
        <button class="x-bot-resume-btn" id="x-bot-resume-btn">▶ 继续自动运行</button>
      </div>
      ` : ''}
      
      ${configErrors.length > 0 ? `
      <div class="x-bot-config-alert">
        <div class="x-bot-config-alert-title">⚠️ 配置不完整</div>
        <div class="x-bot-config-alert-items">缺少：${configErrors.join('、')}</div>
        <div class="x-bot-config-alert-hint">请到扩展配置中心补全后再启动</div>
      </div>
      ` : ''}
      
      ${showProgress ? `
      <div class="x-bot-progress-panel">
        <div class="x-bot-progress-header">
          <span class="x-bot-progress-title">📋 Profile 读取进度</span>
          <span class="x-bot-progress-percent">${progress.percent}%</span>
        </div>
        <div class="x-bot-progress-bar-bg">
          <div class="x-bot-progress-bar-fill" style="width: ${progress.percent}%"></div>
        </div>
        <div class="x-bot-progress-msg ${progressClass}">${progress.message}</div>
      </div>
      ` : ''}
      
      <div class="x-bot-milestones">
        <div class="x-bot-milestone ${botState.accountBio ? 'done' : ''}">${m1} 读取主页简介</div>
        <div class="x-bot-milestone ${!isPersonaEmpty ? 'done' : ''}">${m2} AI 账号画像分析</div>
        <div class="x-bot-milestone ${botState.competitorReport ? 'done' : ''}">${m3} 提取竞品起号策略</div>
        <div class="x-bot-milestone ${qLen >= 5 ? 'done' : ''}">${m4} 储备发文草稿 (${qLen}/20)</div>
        <div class="x-bot-milestone"><span class="x-bot-icon">🚀</span> 今日引流互动 (${repliesSent} 次)</div>
      </div>
      
      <div class="x-bot-next-post">
        下一次发推时间: ${nextPostStr}
      </div>
      
      <div class="x-bot-log-panel">
        <div class="x-bot-log-toggle" id="x-bot-log-toggle">
          <span>📜 运行日志 (${logs.length})</span>
          <span class="x-bot-log-toggle-icon ${logPanelOpen ? 'open' : ''}">▶</span>
        </div>
        <div class="x-bot-log-list ${logPanelOpen ? 'open' : ''}" id="x-bot-log-list">
        </div>
      </div>
    `;
    
    // 填充日志列表（首次渲染）
    const logListEl = widget.querySelector('#x-bot-log-list');
    if (logListEl) {
      if (recentLogs.length === 0) {
        logListEl.innerHTML = '<div class="x-bot-log-item"><span class="x-bot-log-msg info">暂无日志...</span></div>';
      } else {
        recentLogs.forEach(log => logListEl.appendChild(createLogItem(log)));
      }
    }
    
    // 绑定 toggle 事件
    const toggleBtn = widget.querySelector('#x-bot-log-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        logPanelOpen = !logPanelOpen;
        const list = widget.querySelector('#x-bot-log-list');
        if (list) list.classList.toggle('open', logPanelOpen);
        const icon = widget.querySelector('.x-bot-log-toggle-icon');
        if (icon) icon.classList.toggle('open', logPanelOpen);
      });
    }
    
    // 绑定继续运行按钮
    const resumeBtn = widget.querySelector('#x-bot-resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        chrome.storage.local.set({ isAutoPaused: false, pauseReason: '' }, () => {
          addLog('info', '用户手动恢复自动运行');
          const pausePanel = widget.querySelector('#x-bot-pause-panel');
          if (pausePanel) pausePanel.remove();
        });
      });
    }
  } else {
    // 非首次渲染：增量更新可变元素
    const headerTime = widget.querySelector('.x-bot-header-time');
    if (headerTime) headerTime.textContent = timeStr;
    
    const statusText = widget.querySelector('.x-bot-status-text');
    if (statusText) {
      statusText.textContent = focusStatus;
      statusText.style.color = isError ? '#ff4d4f' : '#1DA1F2';
    }
    
    // 更新暂停面板
    let pausePanel = widget.querySelector('#x-bot-pause-panel');
    if (botState.isAutoPaused) {
      if (!pausePanel) {
        pausePanel = document.createElement('div');
        pausePanel.id = 'x-bot-pause-panel';
        pausePanel.className = 'x-bot-pause-panel';
        const statusPanel = widget.querySelector('.x-bot-status-panel');
        if (statusPanel) statusPanel.after(pausePanel);
      }
      pausePanel.innerHTML = `
        <div class="x-bot-pause-title">🛑 自动操作已暂停</div>
        <div class="x-bot-pause-reason">${escapeHtml(botState.pauseReason || '操作失败，等待人工干预')}</div>
        <button class="x-bot-resume-btn" id="x-bot-resume-btn">▶ 继续自动运行</button>
      `;
      pausePanel.style.display = '';
      // 绑定继续按钮
      const resumeBtn = pausePanel.querySelector('#x-bot-resume-btn');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
          chrome.storage.local.set({ isAutoPaused: false, pauseReason: '' }, () => {
            addLog('info', '用户手动恢复自动运行');
            if (pausePanel) pausePanel.remove();
          });
        });
      }
    } else if (pausePanel) {
      pausePanel.remove();
    }
    
    // 更新配置警告（如果状态变化，需要添加或移除）
    let configAlert = widget.querySelector('.x-bot-config-alert');
    if (configErrors.length > 0) {
      if (!configAlert) {
        configAlert = document.createElement('div');
        configAlert.className = 'x-bot-config-alert';
        const statusPanel = widget.querySelector('.x-bot-status-panel');
        if (statusPanel) statusPanel.after(configAlert);
      }
      configAlert.innerHTML = `
        <div class="x-bot-config-alert-title">⚠️ 配置不完整</div>
        <div class="x-bot-config-alert-items">缺少：${configErrors.join('、')}</div>
        <div class="x-bot-config-alert-hint">请到扩展配置中心补全后再启动</div>
      `;
      configAlert.style.display = '';
    } else if (configAlert) {
      configAlert.style.display = 'none';
    }
    
    // 更新进度条
    let progressPanel = widget.querySelector('.x-bot-progress-panel');
    if (showProgress) {
      if (!progressPanel) {
        progressPanel = document.createElement('div');
        progressPanel.className = 'x-bot-progress-panel';
        const alertEl = widget.querySelector('.x-bot-config-alert') || widget.querySelector('.x-bot-status-panel');
        if (alertEl) alertEl.after(progressPanel);
      }
      const pClass = progress.stage === 'extracted' ? 'done' : (progress.stage === 'failed' ? 'error' : '');
      progressPanel.innerHTML = `
        <div class="x-bot-progress-header">
          <span class="x-bot-progress-title">📋 Profile 读取进度</span>
          <span class="x-bot-progress-percent">${progress.percent}%</span>
        </div>
        <div class="x-bot-progress-bar-bg">
          <div class="x-bot-progress-bar-fill" style="width: ${progress.percent}%"></div>
        </div>
        <div class="x-bot-progress-msg ${pClass}">${progress.message}</div>
      `;
      progressPanel.style.display = '';
    } else if (progressPanel) {
      progressPanel.style.display = 'none';
    }
    
    // 更新里程碑
    const milestones = widget.querySelectorAll('.x-bot-milestone');
    if (milestones.length >= 5) {
      milestones[0].className = `x-bot-milestone ${botState.accountBio ? 'done' : ''}`;
      milestones[0].innerHTML = `${m1} 读取主页简介`;
      milestones[1].className = `x-bot-milestone ${!isPersonaEmpty ? 'done' : ''}`;
      milestones[1].innerHTML = `${m2} AI 账号画像分析`;
      milestones[2].className = `x-bot-milestone ${botState.competitorReport ? 'done' : ''}`;
      milestones[2].innerHTML = `${m3} 提取竞品起号策略`;
      milestones[3].className = `x-bot-milestone ${qLen >= 5 ? 'done' : ''}`;
      milestones[3].innerHTML = `${m4} 储备发文草稿 (${qLen}/20)`;
      milestones[4].innerHTML = `<span class="x-bot-icon">🚀</span> 今日引流互动 (${repliesSent} 次)`;
    }
    
    // 更新下次发推时间
    const nextPostEl = widget.querySelector('.x-bot-next-post');
    if (nextPostEl) nextPostEl.textContent = `下一次发推时间: ${nextPostStr}`;
    
    // 更新日志数量
    const logToggleSpan = widget.querySelector('#x-bot-log-toggle span:first-child');
    if (logToggleSpan) logToggleSpan.textContent = `📜 运行日志 (${logs.length})`;
    
    // 增量更新日志列表：只追加新日志，不动已有 DOM
    const logListEl = widget.querySelector('#x-bot-log-list');
    if (logListEl) {
      const existingItems = logListEl.querySelectorAll('.x-bot-log-item[data-time]');
      const existingTimes = new Set(Array.from(existingItems).map(el => Number(el.dataset.time)));
      
      // 追加新日志到底部
      recentLogs.forEach(log => {
        if (!existingTimes.has(log.time)) {
          logListEl.appendChild(createLogItem(log));
        }
      });
      
      // 移除已不在 recentLogs 中的旧日志（截断情况）
      const recentTimes = new Set(recentLogs.map(l => l.time));
      existingItems.forEach(el => {
        if (!recentTimes.has(Number(el.dataset.time))) {
          el.remove();
        }
      });
      
      // 如果没有日志了，显示空状态
      if (recentLogs.length === 0 && logListEl.children.length === 0) {
        logListEl.innerHTML = '<div class="x-bot-log-item"><span class="x-bot-log-msg info">暂无日志...</span></div>';
      }
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

})();
