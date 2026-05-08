// content/x_scraper.js
console.log("X Auto Bot: Scraper loaded on X.com");

// Global cooldown to prevent hitting Gemini API rate limits (15 requests/min)
const REPLY_COOLDOWN_MS = 60000; // 60 seconds
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
// Tweet Scraping
// ==========================================
function scrapeTweets() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['isRunning', 'twitterCooldownUntil', 'apiCooldownUntil', 'aiPersona', 'competitorReport'], (result) => {
    if (!result.isRunning) return;

    // Priority Engine: Must have persona and competitor report before browsing/replying
    const isPersonaEmpty = !result.aiPersona || (!result.aiPersona.targetUsers && !result.aiPersona.characteristics && !result.aiPersona.goals);
    if (isPersonaEmpty || !result.competitorReport) return;

    // Find all tweet articles on the page
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    
    let processedOneInBatch = false;

    tweets.forEach(tweetNode => {
      if (processedOneInBatch) return; // Only process max 1 tweet per batch
      
      // Avoid processing already processed tweets
      if (tweetNode.hasAttribute('data-bot-processed')) return;
      
      const textDiv = tweetNode.querySelector('div[data-testid="tweetText"]');
      if (textDiv) {
        // Mark as processed immediately to prevent duplicate triggers
        tweetNode.setAttribute('data-bot-processed', 'true');
        
        const now = Date.now();
        if (result.twitterCooldownUntil && now < result.twitterCooldownUntil) return;
        if (result.apiCooldownUntil && now < result.apiCooldownUntil) return;
        
        processedOneInBatch = true;
        chrome.storage.local.set({ isGeneratingReply: true });
        
        const textContent = textDiv.innerText;
        addLog('info', `发现新推文，准备生成回复: ${textContent.substring(0, 40)}...`);
        
        // Trigger background to generate AI response
        chrome.runtime.sendMessage({
          action: "generateReply",
          tweetContent: textContent
        }, (response) => {
          chrome.storage.local.set({ isGeneratingReply: false });
          if (response && response.success) {
            // Set full 60s cooldown to prevent sending multiple replies quickly
            chrome.storage.local.set({ twitterCooldownUntil: Date.now() + REPLY_COOLDOWN_MS });
            
            addLog('success', `AI 回复生成成功: ${response.replyText.substring(0, 40)}...`);
            // Dispatch custom event so the automator can handle typing and clicking
            const event = new CustomEvent('xAutoBot_ReadyToReply', {
              detail: {
                tweetElementId: getUniqueIdForNode(tweetNode),
                replyText: response.replyText
              }
            });
            // Attach unique ID to node
            tweetNode.setAttribute('data-bot-id', event.detail.tweetElementId);
            window.dispatchEvent(event);
            
            // Update stats
            updateStats();
          } else {
            addLog('error', `回复生成失败: ${response ? response.error : 'Unknown error'}`);
            // API failed (e.g. rate limit), trigger API cooldown
            chrome.storage.local.set({ apiCooldownUntil: Date.now() + REPLY_COOLDOWN_MS });
          }
        });
      }
    });
  });
}

function getUniqueIdForNode(node) {
  return 'bot_' + Math.random().toString(36).substr(2, 9);
}

function updateStats() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['stats'], (result) => {
    let stats = result.stats || { tweetsProcessed: 0, repliesSent: 0 };
    stats.tweetsProcessed += 1;
    chrome.storage.local.set({ stats });
  });
}

// Observe timeline changes to scrape new tweets dynamically
const observer = new MutationObserver(() => {
  scrapeTweets();
});

// Start observing when the timeline container is ready
function initObserver() {
  const mainNode = document.querySelector('main');
  if (mainNode) {
    observer.observe(mainNode, { childList: true, subtree: true });
    addLog('info', '已开始监听时间线动态');
  } else {
    setTimeout(initObserver, 2000);
  }
}

initObserver();

// Auto Scroll Logic
let scrollInterval = null;

function startAutoScroll() {
  if (scrollInterval) return;
  addLog('info', '启动自动滚动模拟');
  scrollInterval = setInterval(() => {
    if (!chrome.runtime?.id) { stopAutoScroll(); return; }
    const scrollAmount = Math.floor(Math.random() * 500) + 300;
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
  }, Math.floor(Math.random() * 3000) + 5000); // 5-8 seconds
}

function stopAutoScroll() {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
    addLog('info', '停止自动滚动');
  }
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
  chrome.storage.local.get(['accountBio', 'isRunning', 'profileReadProgress'], (result) => {
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
        // 如果当前就在 Profile 页，从 65% 开始（跳过了打开页面的阶段）
        setProfileProgress('waiting_bio', '正在 Profile 页面等待简介 DOM...', 65);
        const bioNode = document.querySelector('div[data-testid="UserDescription"]');
        if (bioNode) {
          clearInterval(checkInterval);
          const bioText = bioNode.innerText || "无简介";
          addLog('success', `主页简介提取成功: ${bioText.substring(0, 50)}${bioText.length > 50 ? '...' : ''}`);
          setProfileProgress('extracted', '主页简介读取完成', 100);
          chrome.storage.local.set({ accountBio: bioText });
        } else if (checkCount % 3 === 0) {
          addLog('info', '等待 UserDescription DOM 渲染...');
        }
      } else {
        // Not on profile page, ask background to open it
        clearInterval(checkInterval);
        addLog('info', `当前不在 Profile 页，准备打开: ${profilePath}`);
        setProfileProgress('opening_profile', '正在打开 Profile 页面...', 35);
        chrome.runtime.sendMessage({ action: "extractBio", profileUrl: profilePath });
      }
    }, 1000);
  });
}

// ==========================================
// Widget UI Logic
// ==========================================
const widgetStyles = `
  #x-auto-bot-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 360px;
    max-height: 85vh;
    overflow-y: auto;
    background: rgba(21, 32, 43, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 16px;
    z-index: 999999;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    transition: opacity 0.3s ease, transform 0.3s ease;
    transform: translateY(0);
  }
  #x-auto-bot-widget.hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
  }
  #x-auto-bot-widget::-webkit-scrollbar {
    width: 4px;
  }
  #x-auto-bot-widget::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15);
    border-radius: 2px;
  }
  .x-bot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
  .x-bot-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
  }
  .x-bot-header-time {
    font-size: 12px;
    color: rgba(255,255,255,0.6);
    font-variant-numeric: tabular-nums;
  }
  .x-bot-pulse {
    width: 8px;
    height: 8px;
    background-color: #00BA7C;
    border-radius: 50%;
    animation: x-bot-pulse 2s infinite;
  }
  @keyframes x-bot-pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 186, 124, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(0, 186, 124, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 186, 124, 0); }
  }
  .x-bot-status-panel {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .x-bot-status-label {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .x-bot-status-text {
    font-size: 14px;
    font-weight: 500;
    color: #1DA1F2;
    line-height: 1.4;
  }
  
  /* Profile Progress Bar */
  .x-bot-progress-panel {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .x-bot-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .x-bot-progress-title {
    font-size: 11px;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .x-bot-progress-percent {
    font-size: 11px;
    color: #00BA7C;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .x-bot-progress-bar-bg {
    width: 100%;
    height: 6px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .x-bot-progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #1DA1F2, #00BA7C);
    border-radius: 3px;
    transition: width 0.5s ease;
  }
  .x-bot-progress-msg {
    font-size: 12px;
    color: rgba(255,255,255,0.7);
  }
  .x-bot-progress-msg.done {
    color: #00BA7C;
  }
  .x-bot-progress-msg.error {
    color: #ff4d4f;
  }
  
  .x-bot-milestones {
    font-size: 12px;
  }
  .x-bot-milestone {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.7);
  }
  .x-bot-milestone.done { color: rgba(255,255,255,0.4); }
  .x-bot-icon { margin-right: 8px; font-size: 13px; min-width: 16px; text-align: center; }
  .x-bot-next-post {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed rgba(255,255,255,0.1);
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  }
  
  /* Log Panel */
  .x-bot-log-panel {
    margin-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 10px;
  }
  .x-bot-log-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    user-select: none;
  }
  .x-bot-log-toggle:hover {
    color: rgba(255,255,255,0.8);
  }
  .x-bot-log-toggle-icon {
    font-size: 10px;
    transition: transform 0.2s ease;
  }
  .x-bot-log-toggle-icon.open {
    transform: rotate(90deg);
  }
  .x-bot-log-list {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
    font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
  }
  .x-bot-log-list.open {
    max-height: 240px;
    overflow-y: auto;
  }
  .x-bot-log-list::-webkit-scrollbar {
    width: 3px;
  }
  .x-bot-log-list::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
  }
  .x-bot-log-item {
    font-size: 10px;
    line-height: 1.5;
    padding: 2px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    display: flex;
    gap: 6px;
  }
  .x-bot-log-time {
    color: rgba(255,255,255,0.3);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .x-bot-log-level {
    flex-shrink: 0;
    min-width: 14px;
  }
  .x-bot-log-msg {
    color: rgba(255,255,255,0.75);
    word-break: break-all;
  }
  .x-bot-log-msg.info { color: rgba(255,255,255,0.75); }
  .x-bot-log-msg.success { color: #00BA7C; }
  .x-bot-log-msg.warn { color: #f5a623; }
  .x-bot-log-msg.error { color: #ff4d4f; }
  
  /* Config Alert Panel */
  .x-bot-config-alert {
    background: rgba(255, 77, 79, 0.12);
    border: 1px solid rgba(255, 77, 79, 0.3);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
  }
  .x-bot-config-alert-title {
    font-size: 12px;
    font-weight: 600;
    color: #ff4d4f;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .x-bot-config-alert-items {
    font-size: 12px;
    color: rgba(255, 200, 200, 0.9);
    line-height: 1.5;
  }
  .x-bot-config-alert-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 4px;
  }
`;

if (!document.getElementById('x-auto-bot-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'x-auto-bot-styles';
  styleEl.textContent = widgetStyles;
  document.head.appendChild(styleEl);
}

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
    renderWidget();
  }
});

setInterval(() => {
  if (botState.isRunning) renderWidget();
}, 1000);

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
  
  if (!botState.isRunning) {
    if (widget) widget.classList.add('hidden');
    return;
  }
  
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'x-auto-bot-widget';
    document.body.appendChild(widget);
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

  // Logs
  const logs = botState.logs || [];
  const recentLogs = logs.slice(-12).reverse();
  const logListHtml = recentLogs.map(log => {
    const time = formatLogTime(log.time);
    const level = log.level || 'info';
    const emoji = getLevelEmoji(level);
    return `<div class="x-bot-log-item">
      <span class="x-bot-log-time">${time}</span>
      <span class="x-bot-log-level">${emoji}</span>
      <span class="x-bot-log-msg ${level}">${escapeHtml(log.message)}</span>
    </div>`;
  }).join('');

  widget.innerHTML = `
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
      <div class="x-bot-log-list ${logPanelOpen ? 'open' : ''}">
        ${logListHtml || '<div class="x-bot-log-item"><span class="x-bot-log-msg info">暂无日志...</span></div>'}
      </div>
    </div>
  `;

  // Attach toggle listener
  const toggleBtn = widget.querySelector('#x-bot-log-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      logPanelOpen = !logPanelOpen;
      renderWidget();
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
