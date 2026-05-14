// content/x_scraper.js
(function() {
'use strict';

console.log("X Auto Bot: Scraper loaded on X.com");

// Global cooldown to prevent hitting Gemini API rate limits (15 requests/min)
const REPLY_COOLDOWN_MS = 300000; // 5 minutes
const REPLY_ATTEMPT_LOCK_MS = 60000; // short lock while the automator tries to send
const MAX_LOGS = 50;
const MIN_REPLY_OPPORTUNITY_SCORE = 58;
const SEARCH_DISCOVERY_MIN_INTERVAL_MS = 90 * 1000;
const SEARCH_DISCOVERY_ROTATE_INTERVAL_MS = 2 * 60 * 1000;
const SEARCH_DISCOVERY_LOOKBACK_DAYS = 7;
const DEFAULT_INTERACTION_TARGETS = {
  ai_product_kol: ['zarazhangrui', 'swyx', 'aakashg0', 'lennysan', 'kfk_ai', 'karpathy', 'sama'],
  monetization_global: ['Leobai825', 'levelsio', 'dvassallo', 'codie_sanchez', 'naval', 'gregisenberg'],
  indie_builder: ['levelsio', 'marckohlbrugge', 'patio11', 'robj3d3', 'dvassallo', 'gregisenberg'],
  research_growth: ['aakashg0', 'lennysan', 'shreyas', 'packyM', 'benthompson', 'stratechery'],
  brand_official: ['OpenAI', 'NotionHQ', 'Linear', 'vercel', 'cursor_ai', 'AnthropicAI']
};
const DEFAULT_DISCOVERY_KEYWORDS = {
  ai_product_kol: ['AI工具', 'AI Agent', '提示词', 'AI自动化', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI副业', '出海', '独立开发', '海外获客', '产品增长', '小产品变现'],
  indie_builder: ['独立开发', 'Build in Public', 'SaaS', 'MVP', 'Product Hunt', 'Cursor 做产品'],
  research_growth: ['AI 投资', '产品增长', '市场趋势', '增长框架', '商业模式', '创始人洞察'],
  brand_official: ['AI产品', '产品发布', '用户案例', '产品更新', '工作流自动化', '效率工具']
};

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

function incrementProcessedTweets() {
  chrome.storage.local.get(['stats'], (res) => {
    const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
    stats.tweetsProcessed = (stats.tweetsProcessed || 0) + 1;
    chrome.storage.local.set({ stats });
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

function getProfileLinkNode() {
  const directSelectors = [
    'a[data-testid="AppTabBar_Profile_Link"]',
    'header[role="banner"] a[aria-label*="Profile"]',
    'header[role="banner"] a[aria-label*="个人"]',
    'nav a[aria-label*="Profile"]',
    'nav a[aria-label*="个人"]'
  ];

  for (const selector of directSelectors) {
    const node = document.querySelector(selector);
    if (node?.href) return node;
  }

  return Array.from(document.querySelectorAll('header[role="banner"] nav a[href^="/"], nav a[href^="/"]'))
    .find(link => isProfilePath(new URL(link.href).pathname));
}

function isProfilePath(pathname = '') {
  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  const blocked = new Set([
    'home', 'explore', 'notifications', 'messages', 'i', 'settings',
    'compose', 'search', 'jobs', 'communities', 'premium', 'verified_orgs'
  ]);
  return /^[A-Za-z0-9_]{1,15}$/.test(firstSegment) && !blocked.has(firstSegment.toLowerCase());
}

function getCurrentProfilePath() {
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return isProfilePath(`/${firstSegment}`) ? `/${firstSegment}` : '';
}

function getProfilePathFromNav() {
  const profileLinkNode = getProfileLinkNode();
  if (!profileLinkNode?.href) return '';
  return new URL(profileLinkNode.href).pathname.split('/').slice(0, 2).join('/');
}

function isOnTargetProfilePage(profilePath) {
  const currentProfilePath = getCurrentProfilePath();
  if (!currentProfilePath) return false;
  return profilePath ? currentProfilePath.toLowerCase() === profilePath.toLowerCase() : true;
}

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractProfileSnapshot() {
  const bioText = document.querySelector('div[data-testid="UserDescription"]')?.innerText?.trim() || '';
  const nameText = document.querySelector('div[data-testid="UserName"]')?.innerText?.trim() || '';
  const nameLines = nameText.split('\n').map(line => line.trim()).filter(Boolean);
  const displayName = nameLines.find(line => !line.startsWith('@')) || '';
  const handleFromName = extractFirstMatch(nameText, [/@([A-Za-z0-9_]{1,15})/]);
  const handleFromPath = getCurrentProfilePath().replace('/', '');
  const handle = handleFromName || handleFromPath;
  const mainText = document.querySelector('main')?.innerText || document.body.innerText || '';
  const following = extractFirstMatch(mainText, [
    /([0-9,.万千Kk]+)\s*(?:Following|正在关注|关注中)/,
    /(?:Following|正在关注|关注中)\s*([0-9,.万千Kk]+)/
  ]);
  const followers = extractFirstMatch(mainText, [
    /([0-9,.万千Kk]+)\s*(?:Followers|粉丝|关注者)/,
    /(?:Followers|粉丝|关注者)\s*([0-9,.万千Kk]+)/
  ]);

  const lines = [];
  if (displayName || handle) lines.push(`账号：${displayName || '未读取到昵称'}${handle ? ` (@${handle})` : ''}`);
  lines.push(`主页简介：${bioText || '未填写或未公开显示'}`);
  if (following || followers) {
    lines.push(`账号数据：${following ? `关注 ${following}` : ''}${following && followers ? '，' : ''}${followers ? `粉丝 ${followers}` : ''}`);
  }
  if (handle) lines.push(`主页链接：https://x.com/${handle}`);

  return {
    text: lines.join('\n').trim(),
    hasIdentity: Boolean(displayName || handle || bioText),
    hasBio: Boolean(bioText)
  };
}

// ==========================================
// Auto Scroll Logic
// ==========================================
let scrollInterval = null;
let restTimeout = null;
let scrollCountInCycle = 0;
let xLoginDetectedNotified = false;

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
      isReplying = false;
      twitterCooldownUntil = 0;
      apiCooldownUntil = 0;
      startAutoScroll();
      ensureBioExtracted();
    } else {
      stopAutoScroll();
    }
  }
  if (namespace === 'local' && changes.profileReadRequested?.newValue) {
    ensureBioExtracted({ force: true });
  }
});

// Initial check for auto-scroll
chrome.storage.local.get(['isRunning', 'profileReadRequested'], (result) => {
  if (result.isRunning) {
    startAutoScroll();
    ensureBioExtracted();
  } else if (result.profileReadRequested) {
    ensureBioExtracted({ force: true });
  }
});

function notifyXLoginDetectedIfNeeded() {
  if (xLoginDetectedNotified || !chrome.runtime?.id) return;
  const profileLinkNode = getProfileLinkNode();
  const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (!profileLinkNode && !accountSwitcher) return;
  xLoginDetectedNotified = true;
  chrome.runtime.sendMessage({ action: 'xLoginDetected' }, () => {});
}

const loginDetectInterval = setInterval(() => {
  notifyXLoginDetectedIfNeeded();
  if (xLoginDetectedNotified) clearInterval(loginDetectInterval);
}, 1500);
setTimeout(() => clearInterval(loginDetectInterval), 30000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'forceReadProfileBio') {
    ensureBioExtracted({ force: true });
    sendResponse({ success: true });
  }
});

// ==========================================
// Bio Extraction Logic with Progress Tracking
// ==========================================
function ensureBioExtracted(options = {}) {
  if (!chrome.runtime?.id) return;
  const force = Boolean(options.force);
  chrome.storage.local.get(['accountBio', 'isRunning', 'profileReadProgress', 'isAutoPaused'], (result) => {
    if (result.isAutoPaused && !force) return;
    if ((!result.isRunning && !force) || (result.accountBio && !force)) {
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
      
      const profilePath = getProfilePathFromNav();
      if (!profilePath && !getCurrentProfilePath()) {
        if (force && checkCount > 20) {
          addLog('warn', '未检测到 X 登录态，无法读取主页简介');
          chrome.storage.local.set({
            accountBio: '',
            profileReadRequested: false
          });
          setProfileProgress('failed', '未检测到 X 登录态，请先登录 X 后重试', 0);
          clearInterval(checkInterval);
          return;
        }
        if (checkCount % 3 === 0) {
          addLog('info', `等待 Profile 导航链接加载... (${checkCount}s)`);
        }
        return;
      }
      
      if (isOnTargetProfilePage(profilePath)) {
        setProfileProgress('waiting_bio', '正在 Profile 页面读取账号信息...', 65);
        const snapshot = extractProfileSnapshot();
        if (snapshot.hasIdentity) {
          chrome.storage.local.set({ accountBio: snapshot.text, profileReadRequested: false }, () => {
            addLog('success', `主页信息已提取: ${snapshot.text.substring(0, 50)}...`);
            setProfileProgress(
              'extracted',
              snapshot.hasBio ? '主页简介已读取' : '主页信息已读取，简介为空，已使用账号信息兜底',
              100
            );
          });
          clearInterval(checkInterval);
          return;
        }
        if (checkCount > 30) {
          addLog('warn', '在 Profile 页面等待账号信息超时，未读取到简介');
          chrome.storage.local.set({ accountBio: '', profileReadRequested: false });
          setProfileProgress('failed', '简介读取失败，可在长期记忆中心手动填写人设', 0);
          clearInterval(checkInterval);
        }
      } else {
        if (checkCount === 1) {
          setProfileProgress('opening_page', '正在打开 Profile 页面...', 35);
          addLog('info', '当前不在 Profile 页面，后台静默打开...');
          chrome.runtime.sendMessage({ action: 'openProfileTab', url: `https://x.com${profilePath}` });
          clearInterval(checkInterval);
        }
        if (checkCount > 25) {
          addLog('warn', '等待 Profile 页面加载超时，跳过简介提取');
          chrome.storage.local.set({ accountBio: '', profileReadRequested: false });
          setProfileProgress('failed', '简介读取失败，可刷新 X 后重试或手动填写人设', 0);
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

function getTweetCreatedAt(tweetNode) {
  const datetime = tweetNode.querySelector('time')?.getAttribute('datetime') || '';
  const ts = Date.parse(datetime);
  return Number.isFinite(ts) ? ts : 0;
}

function getTweetAgeMinutes(tweetNode) {
  const createdAt = getTweetCreatedAt(tweetNode);
  if (!createdAt) return null;
  return Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
}

function getOwnHandle() {
  return (getProfilePathFromNav() || getCurrentProfilePath()).replace('/', '').toLowerCase();
}

function isPromotedTweet(tweetNode) {
  return /Promoted|Ad\b|广告|推广/.test(tweetNode?.innerText || '');
}

function isNestedReplyTweet(tweetNode) {
  return /Replying to|回复给|正在回复/.test(tweetNode?.innerText || '');
}

function isLowValueReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const engagementBaitPatterns = [
    /\bjust say\b/,
    /\bsay ["']?hey["']?\b/,
    /\bneed .*impressions?\b/,
    /\bthank me later\b/,
    /\breply\b.*\b(i|me|this|below)\b/,
    /\bcomment\b.*\b(i|me|below|for)\b/,
    /\bdrop\b.*\b(reply|comment|handle|link)\b/,
    /\bfollow (me|for|back)\b/,
    /\blike (and|&)?\s*(rt|repost|share)\b/,
    /\b(rt|repost) (if|and|to)\b/,
    /\bwho wants\b/,
    /\btag someone\b/,
    /转发.*抽/,
    /评论.*领取/,
    /回复.*领取/,
    /求.*互/
  ];

  if (engagementBaitPatterns.some(pattern => pattern.test(normalized))) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  const hasUrlOnly = /https?:\/\/|pic\.x\.com|t\.co\//.test(normalized) && words.length < 10;
  const tooShort = normalized.length < 28 && words.length < 8;
  const mostlyEmojiOrPunctuation = normalized.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{P}\p{S}\s]/gu, '').length < 8;
  return hasUrlOnly || tooShort || mostlyEmojiOrPunctuation;
}

function parseTargetHandles(text = '') {
  return String(text || '')
    .split(/[\s,，、\n]+/)
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item))
    .map(item => item.toLowerCase());
}

function inferStrategyArchetype(state = {}) {
  const strategy = state.onboardingStrategy || {};
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const signal = [
    strategy.strategyArchetype,
    strategy.sourceInput,
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.marketPosition
  ].join('\n').toLowerCase();

  if (DEFAULT_INTERACTION_TARGETS[strategy.strategyArchetype]) return strategy.strategyArchetype;
  if (/leobai825|levelsio|出海|搞钱|副业|变现|monetization|income/.test(signal)) return 'monetization_global';
  if (/indie|独立开发|build in public|mrr|saas/.test(signal)) return 'indie_builder';
  if (/研究|投资|增长|research|vc|market|趋势/.test(signal)) return 'research_growth';
  if (/brand|official|品牌|官网|产品官方/.test(signal)) return 'brand_official';
  return 'ai_product_kol';
}

function getDefaultInteractionTargets(state = {}) {
  return DEFAULT_INTERACTION_TARGETS[inferStrategyArchetype(state)] || DEFAULT_INTERACTION_TARGETS.ai_product_kol;
}

function getDefaultDiscoveryKeywords(state = {}) {
  return DEFAULT_DISCOVERY_KEYWORDS[inferStrategyArchetype(state)] || DEFAULT_DISCOVERY_KEYWORDS.indie_builder;
}

function collectTargetHandles(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseTargetHandles(state.targetUsers),
    ...parseTargetHandles(memory.interactionTargets),
    ...parseTargetHandles(getDefaultInteractionTargets(state).join('\n'))
  ])];
}

function parseDiscoveryKeywords(text = '') {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 80);
}

function collectDiscoveryKeywords(state = {}) {
  const memory = state.agentMemory || {};
  return [...new Set([
    ...parseDiscoveryKeywords(memory.discoveryKeywords),
    ...getDefaultDiscoveryKeywords(state)
  ])].slice(0, 12);
}

function getSearchLanguageOperator(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  if (lang === 'en') return 'lang:en';
  if (lang === 'ja') return 'lang:ja';
  if (lang === 'ko') return 'lang:ko';
  return 'lang:zh';
}

function getSearchThresholds(state = {}) {
  const lang = state.onboardingStrategy?.preferredLanguage || 'zh-CN';
  const isChinese = lang === 'zh-CN' || lang === 'zh-TW';
  return isChinese
    ? { minFaves: 50, minRetweets: 5 }
    : { minFaves: 120, minRetweets: 15 };
}

function getRecentSinceDate(days = SEARCH_DISCOVERY_LOOKBACK_DAYS) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function quoteSearchTerm(term = '') {
  const clean = String(term || '').trim().replace(/"/g, '');
  if (!clean) return '';
  if (isAdvancedSearchQuery(clean)) {
    return clean;
  }
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

function isAdvancedSearchQuery(value = '') {
  return /\b(min_faves|min_retweets|from|lang|filter|since|until):|\bOR\b/i.test(String(value || ''));
}

function getNegativeSearchOperators(state = {}) {
  const memory = state.agentMemory || {};
  const signal = [
    state.onboardingStrategy?.strategyArchetype,
    state.onboardingStrategy?.sourceInput,
    memory.marketPosition,
    memory.contentPillars,
    memory.contentAngles,
    memory.coreOpinions
  ].join('\n').toLowerCase();
  if (/web3|crypto|defi|nft|blockchain|token|链上|加密|币圈/.test(signal)) return '';
  return '-web3 -crypto -defi -nft -airdrop -token -btc -eth';
}

function buildDiscoverySearchQueries(state = {}) {
  const keywords = collectDiscoveryKeywords(state);
  const lang = getSearchLanguageOperator(state);
  const { minFaves, minRetweets } = getSearchThresholds(state);
  const since = getRecentSinceDate();
  const negative = getNegativeSearchOperators(state);
  const topicQueries = keywords
    .map(keyword => {
      const term = quoteSearchTerm(keyword);
      if (!term) return '';
      if (isAdvancedSearchQuery(term)) {
        const langPart = /\blang:/i.test(term) ? '' : lang;
        const sincePart = /\bsince:/i.test(term) ? '' : `since:${since}`;
        return `${term} ${langPart} -filter:replies ${sincePart} ${negative}`.trim();
      }
      return `${term} ${lang} min_faves:${minFaves} min_retweets:${minRetweets} -filter:replies since:${since} ${negative}`.trim();
    })
    .filter(Boolean);
  const accountQueries = collectTargetHandles(state)
    .slice(0, 6)
    .map(handle => `from:${handle} ${lang} min_faves:${minFaves} -filter:replies since:${since} ${negative}`.trim());
  return [...new Set([...topicQueries, ...accountQueries])].slice(0, 18);
}

function isSearchPage() {
  return window.location.pathname === '/search';
}

function getCurrentSearchQuery() {
  try {
    return new URL(window.location.href).searchParams.get('q') || '';
  } catch (error) {
    return '';
  }
}

function hasOpenEditorText() {
  const editors = Array.from(document.querySelectorAll('[role="textbox"][contenteditable="true"], div[data-testid="tweetTextarea_0"]'));
  return editors.some(editor => (editor.innerText || editor.textContent || '').trim().length > 0);
}

function isDiscoveryNavigationUnsafe(state = {}) {
  const pathname = window.location.pathname || '';
  if (/^\/intent\//.test(pathname) || pathname.includes('/compose/')) return true;
  if (state.pendingReply || state.pendingPost) return true;
  return hasOpenEditorText();
}

function maybeNavigateToDiscoverySearch(state = {}, reason = '当前页面没有匹配候选') {
  if (isDiscoveryNavigationUnsafe(state)) {
    addLog('info', '检测到未完成编辑器，暂不切换关键词搜索页');
    return false;
  }

  const queries = buildDiscoverySearchQueries(state);
  if (queries.length === 0) return false;

  const now = Date.now();
  const lastSearchAt = Number(state.lastDiscoverySearchAt) || 0;
  const minInterval = isSearchPage() ? SEARCH_DISCOVERY_ROTATE_INTERVAL_MS : SEARCH_DISCOVERY_MIN_INTERVAL_MS;
  if (lastSearchAt && now - lastSearchAt < minInterval) return false;

  const currentQuery = getCurrentSearchQuery();
  let nextIndex = Number(state.discoverySearchIndex) || 0;
  if (isSearchPage() && currentQuery) {
    const currentIndex = queries.findIndex(query => query === currentQuery);
    if (currentIndex >= 0) nextIndex = currentIndex + 1;
  }
  const query = queries[nextIndex % queries.length];
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;

  chrome.storage.local.set({
    lastDiscoverySearchAt: now,
    discoverySearchIndex: (nextIndex + 1) % queries.length,
    currentDiscoveryQuery: query,
    currentDiscoveryReason: reason
  });
  addLog('info', `切换到关键词热帖搜索：${query}`);
  window.location.assign(url);
  return true;
}

function isSensitiveReplyTarget(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /\b(trump|biden|hunter biden|maga|democrat|republican|election|president|congress|senate)\b/,
    /\b(gaza|israel|palestine|ukraine|russia|war|military)\b/,
    /总统|大选|民主党|共和党|拜登|特朗普|川普|战争|军事|俄乌|巴以|以色列|巴勒斯坦|加沙/
  ].some(pattern => pattern.test(normalized));
}

function collectTopicKeywords(state = {}) {
  const memory = state.agentMemory || {};
  const persona = state.aiPersona || {};
  const strategy = state.onboardingStrategy || {};
  const base = [
    'ai', 'agent', 'chatgpt', 'claude', 'gemini', 'openai', 'llm', 'prompt',
    'automation', 'workflow', 'tool', 'startup', 'founder', 'indie', 'saas',
    'product', 'growth', 'marketing', 'monetization', 'mrr', 'build in public',
    'creator', 'research', 'investment', 'vc',
    '人工智能', '模型', '提示词', '自动化', '工作流', '工具', '创业', '创始人',
    '独立开发', '产品', '增长', '营销', '获客', '流量', '出海', '搞钱', '副业',
    '变现', '商业化', '用户', '付费', '研究', '投资', '复盘'
  ];
  const mapped = {
    insights: ['观点', '趋势', '判断'],
    playbooks: ['方法', '框架', '清单', '实操'],
    stories: ['复盘', '经历', '故事'],
    curation: ['报告', '信息', '新闻', '拆解'],
    softPromo: ['产品', '工具', '案例']
  };
  const configured = [
    persona.targetUsers,
    persona.characteristics,
    persona.goals,
    memory.contentPillars,
    memory.contentAngles,
    memory.audienceSegments,
    memory.audiencePains,
    strategy.contentCustom,
    strategy.audienceCustom
  ].join('\n');
  const extracted = configured
    .split(/[\s,，、。；;：:\n/|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length >= 2 && item.length <= 24);
  const strategyKeywords = Array.isArray(strategy.content)
    ? strategy.content.flatMap(item => mapped[item] || [])
    : [];
  return [...new Set([...base, ...strategyKeywords, ...extracted])];
}

function hasRelevantTopic(text = '', state = {}) {
  const normalized = String(text || '').toLowerCase();
  return collectTopicKeywords(state).some(keyword => normalized.includes(keyword));
}

function hasStandaloneReplyPotential(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /不是.*而是|not .* but|really about|本质|关键|核心|真正/,
    /because|why|how|lesson|mistake|framework|playbook|workflow|case|example/,
    /为什么|如何|怎么|经验|教训|框架|路径|清单|案例|复盘|步骤|判断|标准|边界/,
    /\d+[.)、]|[一二三四五六七八九十]个/
  ].some(pattern => pattern.test(normalized));
}

function scoreFreshness(ageMinutes) {
  if (ageMinutes === null) return { score: 4, label: '未知发布时间' };
  if (ageMinutes <= 30) return { score: 24, label: '30分钟内' };
  if (ageMinutes <= 120) return { score: 20, label: '2小时内' };
  if (ageMinutes <= 360) return { score: 14, label: '6小时内' };
  if (ageMinutes <= 1440) return { score: 6, label: '24小时内' };
  if (ageMinutes <= 2880) return { score: -8, label: '24小时以上' };
  return { score: -24, label: '48小时以上' };
}

function getReplyOpportunity(article, author, text, state = {}) {
  const targetHandles = collectTargetHandles(state);
  const authorHandle = String(author || '').toLowerCase();
  const isTargetAuthor = targetHandles.includes(authorHandle);
  const topicRelevant = hasRelevantTopic(text, state);
  const ageMinutes = getTweetAgeMinutes(article);
  const freshness = scoreFreshness(ageMinutes);
  const ownHandle = getOwnHandle();

  let score = 0;
  const reasons = [];

  if (ownHandle && authorHandle === ownHandle) {
    return { score: -999, reasons: ['自己的推文'], ageMinutes, isTargetAuthor, topicRelevant };
  }
  if (isPromotedTweet(article)) {
    return { score: -999, reasons: ['广告/推广内容'], ageMinutes, isTargetAuthor, topicRelevant };
  }
  if (isNestedReplyTweet(article) && !isTargetAuthor) {
    score -= 12;
    reasons.push('非目标账号的二级回复');
  }

  if (isTargetAuthor) {
    score += 36;
    reasons.push('优先互动账号');
  } else if (targetHandles.length > 0) {
    score -= 8;
    reasons.push('非目标账号');
  }

  if (topicRelevant) {
    score += 22;
    reasons.push('主题相关');
  }

  score += freshness.score;
  reasons.push(freshness.label);

  const visualChars = Array.from(text).length;
  if (visualChars >= 80 && visualChars <= 520) {
    score += 12;
    reasons.push('信息量适中');
  } else if (visualChars > 520) {
    score -= 8;
    reasons.push('原推过长');
  }

  if (hasStandaloneReplyPotential(text)) {
    score += 18;
    reasons.push('适合补充观点');
  }

  if (/[?？]|\bhow\b|\bwhy\b|如何|怎么|为什么/.test(text)) {
    score += 8;
    reasons.push('可回答问题');
  }

  if (/launch|released|introducing|发布|上线|刚做了|复盘|case study|案例|数据|增长|转化|用户/.test(text.toLowerCase())) {
    score += 8;
    reasons.push('适合补充经验/判断');
  }

  return {
    score,
    reasons,
    ageMinutes,
    isTargetAuthor,
    topicRelevant
  };
}

function getReplySkipReason(author, text, state = {}) {
  if (isSensitiveReplyTarget(text)) return '涉及政治/战争等敏感话题';
  const targetHandles = collectTargetHandles(state);
  const isTargetAuthor = targetHandles.includes(String(author || '').toLowerCase());
  if (targetHandles.length > 0 && !isTargetAuthor && !hasRelevantTopic(text, state)) {
    return '非优先互动账号，且主题与账号策略不相关';
  }
  if (targetHandles.length === 0 && !hasRelevantTopic(text, state)) {
    return '主题与账号策略不相关';
  }
  return '';
}

function stableHash(text) {
  let hash = 0;
  const input = String(text || '');
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getStatusIdFromHref(href = '') {
  const match = String(href || '').match(/\/status\/(\d+)/);
  return match?.[1] || '';
}

function getTweetStatusMeta(tweetNode) {
  const links = Array.from(tweetNode.querySelectorAll('a[href*="/status/"]'));
  const link = links.find(item => item.querySelector('time'))
    || links.find(item => getStatusIdFromHref(item.getAttribute('href') || ''));
  const href = link?.getAttribute('href') || '';
  return {
    href,
    id: getStatusIdFromHref(href)
  };
}

function getTweetStatusHref(tweetNode) {
  return getTweetStatusMeta(tweetNode).href;
}

function getTweetBotId(tweetNode, author, text) {
  if (tweetNode.dataset.botId) return tweetNode.dataset.botId;
  const status = getTweetStatusMeta(tweetNode);
  const seed = status.id || status.href || `${author}:${text.slice(0, 160)}`;
  const id = `xbot-${stableHash(seed)}`;
  tweetNode.dataset.botId = id;
  return id;
}

function getAutomationMode(state = {}) {
  return state.onboardingStrategy?.automationMode || 'review';
}

function shouldGenerateReplySuggestion(mode) {
  return mode === 'auto' || mode === 'shadowReply';
}

function shouldSendReply(mode) {
  return mode === 'auto';
}

let processedTweetIds = new Set();
let isReplying = false;
let twitterCooldownUntil = 0;
let apiCooldownUntil = 0;

function rememberProcessedTweet(tweetId) {
  processedTweetIds.add(tweetId);
  if (processedTweetIds.size > 500) {
    const oldest = processedTweetIds.values().next().value;
    processedTweetIds.delete(oldest);
  }
}

function scrapeTweets() {
  if (!chrome.runtime?.id) return;
  if (isReplying) return;
  if (Date.now() < twitterCooldownUntil) return;
  if (Date.now() < apiCooldownUntil) return;

  chrome.storage.local.get([
    'isRunning', 'isAutoPaused', 'aiPersona', 'agentMemory', 'competitorReport',
    'twitterCooldownUntil', 'apiCooldownUntil', 'onboardingStrategy', 'targetUsers',
    'pendingReply', 'pendingPost', 'lastDiscoverySearchAt', 'discoverySearchIndex',
    'currentDiscoveryQuery'
  ], (result) => {
    if (!result.isRunning) return;
    if (result.isAutoPaused) {
      addLog('info', '自动操作已暂停，跳过推文抓取');
      return;
    }
    const automationMode = getAutomationMode(result);
    if (!shouldGenerateReplySuggestion(automationMode)) return;
    if (result.twitterCooldownUntil && Date.now() < result.twitterCooldownUntil) return;
    if (result.apiCooldownUntil && Date.now() < result.apiCooldownUntil) return;
    
    const persona = result.aiPersona;
    const hasPersona = persona && (persona.targetUsers || persona.characteristics || persona.goals);
    if (!hasPersona || !result.competitorReport) return;
    
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length === 0) {
      maybeNavigateToDiscoverySearch(result, '当前页面没有可读推文');
      return;
    }

    const candidates = [];
    for (const article of articles) {
      const author = getTweetAuthor(article);
      const text = getTweetText(article);
      const tweetStatus = getTweetStatusMeta(article);
      
      if (!text || text.length < 10) continue;
      const tweetId = getTweetBotId(article, author, text);
      if (processedTweetIds.has(tweetId)) continue;

      if (isLowValueReplyTarget(text)) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过低价值互动目标 @${author}: ${text.substring(0, 50)}...`);
        continue;
      }
      const skipReason = getReplySkipReason(author, text, result);
      if (skipReason) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: ${skipReason}。${text.substring(0, 50)}...`);
        continue;
      }
      if (shouldSendReply(automationMode) && !tweetStatus.id) {
        rememberProcessedTweet(tweetId);
        addLog('warn', `跳过 @${author}: 未读取到推文 status id，无法走官方 intent 回复。${text.substring(0, 50)}...`);
        continue;
      }

      const opportunity = getReplyOpportunity(article, author, text, result);
      if (opportunity.score < MIN_REPLY_OPPORTUNITY_SCORE) {
        rememberProcessedTweet(tweetId);
        addLog('info', `跳过 @${author}: 互动机会分 ${opportunity.score} 低于 ${MIN_REPLY_OPPORTUNITY_SCORE}（${opportunity.reasons.join('、')}）`);
        continue;
      }

      candidates.push({ article, author, text, tweetStatus, tweetId, opportunity });
    }

    if (candidates.length === 0) {
      maybeNavigateToDiscoverySearch(result, '当前页面没有高价值互动候选');
      return;
    }

    candidates.sort((a, b) => b.opportunity.score - a.opportunity.score);
    const selected = candidates[0];
    rememberProcessedTweet(selected.tweetId);

    addLog('info', `选择互动 @${selected.author}: 机会分 ${selected.opportunity.score}（${selected.opportunity.reasons.join('、')}）`);
    incrementProcessedTweets();

    isReplying = true;
    chrome.storage.local.set({ isGeneratingReply: true });

    chrome.runtime.sendMessage({
      action: 'generateReply',
      tweetText: selected.text,
      tweetContent: selected.text,
      tweetAuthor: selected.author,
      tweetElementId: selected.tweetId,
      tweetStatusHref: selected.tweetStatus.href,
      tweetStatusId: selected.tweetStatus.id,
      replyOpportunity: selected.opportunity
    }, (response) => {
      isReplying = false;
      chrome.storage.local.set({ isGeneratingReply: false });
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
        const willSend = shouldSendReply(automationMode);
        twitterCooldownUntil = Date.now() + (willSend ? REPLY_ATTEMPT_LOCK_MS : REPLY_COOLDOWN_MS);
        chrome.storage.local.set({
          twitterCooldownUntil,
          lastReplySuggestion: {
            tweetAuthor: selected.author,
            tweetContent: selected.text,
            replyText,
            mode: automationMode,
            opportunityScore: selected.opportunity.score,
            opportunityReasons: selected.opportunity.reasons,
            time: Date.now()
          }
        });
        addLog('success', willSend
          ? `已生成回复 @${selected.author}: ${replyText.substring(0, 40)}...`
          : `影子回复建议 @${selected.author}: ${replyText.substring(0, 40)}...`);

        if (willSend) {
          // Dispatch event for automator
          window.dispatchEvent(new CustomEvent('xAutoBot_ReadyToReply', {
            detail: {
              tweetElementId: selected.tweetId,
              replyText,
              tweetAuthor: selected.author,
              tweetContent: selected.text,
              tweetStatusHref: selected.tweetStatus.href,
              tweetStatusId: selected.tweetStatus.id
            }
          }));
        }
      }
    });
  });
}

setInterval(scrapeTweets, 5000);

// ==========================================
// Widget System
// ==========================================
let botState = {};
let logPanelOpen = false;

refreshBotStateFromStorage();

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

// 定期从 Chrome storage 重新拉取全量状态，避免 X 页面小组件显示旧缓存。
setInterval(() => {
  refreshBotStateFromStorage();
}, 3000);

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

function isResultLog(log = {}) {
  const message = String(log.message || '');
  if (/跳过推文抓取|不启动自动滚动|停止自动滚动|跳过发推调度|跳过本次发推|跳过发推|跳过 intent 回复|机器人已停止|用户手动恢复/.test(message)) {
    return false;
  }
  if (/跳过低价值互动目标|互动机会分 .*低于|主题与账号策略不相关|非优先互动账号|未读取到推文 status id/.test(message)) {
    return false;
  }
  const resultPatterns = [
    /已通过 X 官方 intent 回复/,
    /X 提示已回复过/,
    /X 提示这条内容已发布过/,
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

function formatResultLogMessage(log = {}) {
  const message = String(log.message || '');
  return message
    .replace(/^✅\s*/, '')
    .replace(/^⚠️\s*/, '')
    .replace(/，进入 \d+ 分钟互动冷却$/, '')
    .replace(/：检测到 X 发送成功提示$/, '')
    .replace(/：编辑器已关闭$/, '')
    .trim();
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

function refreshBotStateFromStorage() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(null, (res) => {
    botState = res || {};
    renderWidget();
  });
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
  const automationMode = getAutomationMode(botState);
  const replySuggestionEnabled = shouldGenerateReplySuggestion(automationMode);
  const autoPublishEnabled = automationMode === 'auto';
  const xNativeScheduleMode = botState.postDeliveryMode === 'xNativeSchedule';
  
  const twitterCooldownSecs = botState.twitterCooldownUntil && botState.twitterCooldownUntil > now 
    ? Math.ceil((botState.twitterCooldownUntil - now) / 1000) : 0;
  
  const apiCooldownSecs = botState.apiCooldownUntil && botState.apiCooldownUntil > now
    ? Math.ceil((botState.apiCooldownUntil - now) / 1000) : 0;

  const progress = botState.profileReadProgress || { stage: 'idle', percent: 0, message: '等待启动...' };
  const profileFailed = progress.stage === 'failed';
  const profileProgressValue = profileFailed ? 0 : Math.max(0, Math.min(100, progress.percent || 0));
  const profileProgressLabel = profileFailed ? '失败' : `${profileProgressValue}%`;
  const showProgress = botState.isRunning && (!botState.accountBio || profileFailed);
  const progressClass = progress.stage === 'extracted' ? 'done' : (profileFailed ? 'error' : '');
  const strategyGaps = [];
  if (isPersonaEmpty) strategyGaps.push('人设与目标用户');
  if (!botState.competitorReport) strategyGaps.push('竞品与爆款框架');
  
  let focusStatus = '';
  let statusClass = 'idle';

  if (!botState.isRunning) {
    focusStatus = configErrors.length > 0 ? `待配置：${configErrors.join('、')}` : '待启动：点击扩展按钮启动 Agent';
    statusClass = configErrors.length > 0 ? 'warn' : 'idle';
  } else if (botState.isAutoPaused) {
    focusStatus = botState.pauseReason || '已暂停，等待人工检查';
    statusClass = 'error';
  } else if (botState.isTyping) {
    focusStatus = xNativeScheduleMode ? '正在写入 X 原生定时发布' : '正在处理发布或回复动作';
    statusClass = 'active';
  } else if (botState.isGeneratingReply) {
    focusStatus = '正在生成互动回复';
    statusClass = 'active';
  } else if (apiCooldownSecs > 0) {
    focusStatus = `AI 接口保护中，${apiCooldownSecs}s 后重试`;
    statusClass = 'warn';
  } else if (replySuggestionEnabled && twitterCooldownSecs > 0 && botState.lastReplyFailure?.time && now - botState.lastReplyFailure.time < 90000) {
    focusStatus = `回复失败保护中，${twitterCooldownSecs}s 后重新观察`;
    statusClass = 'warn';
  } else if (replySuggestionEnabled && twitterCooldownSecs > 0 && automationMode === 'shadowReply') {
    focusStatus = `影子回复冷却中，${twitterCooldownSecs}s 后继续生成建议`;
    statusClass = 'active';
  } else if (replySuggestionEnabled && twitterCooldownSecs > 0) {
    focusStatus = `互动冷却中，${twitterCooldownSecs}s 后继续`;
    statusClass = 'active';
  } else if (botState.isAnalyzingPersona) {
    focusStatus = '正在分析账号画像';
    statusClass = 'active';
  } else if (botState.isAnalyzingCompetitors) {
    focusStatus = '正在整理竞品和爆款框架';
    statusClass = 'active';
  } else if (botState.isGenerating) {
    focusStatus = '正在生成 Agent 内容队列';
    statusClass = 'active';
  } else if (replySuggestionEnabled && botState.currentDiscoveryQuery) {
    const query = String(botState.currentDiscoveryQuery).replace(/\s+/g, ' ').slice(0, 48);
    focusStatus = `关键词热帖搜索：${query}`;
    statusClass = 'active';
  } else if (profileFailed && isPersonaEmpty) {
    focusStatus = '简介读取失败：请在长期记忆中心手动填写人设';
    statusClass = 'warn';
  } else if (strategyGaps.length > 0) {
    focusStatus = `待补齐：${strategyGaps.join('、')}`;
    statusClass = 'warn';
  } else if (!autoPublishEnabled && automationMode === 'review') {
    focusStatus = '先审后发：只生成待确认内容，不自动发帖或回复';
    statusClass = 'active';
  } else if (!autoPublishEnabled && automationMode === 'shadowReply') {
    focusStatus = '影子回复：生成评论建议，不自动发送';
    statusClass = 'active';
  } else {
    focusStatus = xNativeScheduleMode ? '运行中：生成内容并写入 X 定时发布' : '运行中：正在观察时间线和本地排期';
    statusClass = 'active';
  }

  const repliesSent = botState.stats ? botState.stats.repliesSent : 0;
  const postsToday = Number(botState.postsToday) || 0;
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
  const nextPostStr = botState.nextPostTime ? botState.nextPostTime : '待计算';
  const logoUrl = chrome.runtime.getURL('assets/icons/icon-48.png');
  const xDraftStatus = (() => {
    if (botState.xOfficialDraftStatus === 'reading') return '读取中';
    if (botState.xOfficialDraftStatus === 'failed') return '读取失败';
    if (botState.xOfficialDraftStatus === 'success' && Number.isFinite(Number(botState.xOfficialDraftCount))) {
      return `${Number(botState.xOfficialDraftCount)} 个`;
    }
    return '未读取';
  })();

  const logs = botState.logs || [];
  const resultLogs = logs.filter(isResultLog);
  const recentResultLogs = resultLogs.slice(-8).reverse();
  const logRows = recentResultLogs.length === 0
    ? '<div class="x-bot-log-item"><span class="x-bot-log-msg info">暂无成果记录：完成发布或回复后会显示在这里</span></div>'
    : recentResultLogs.map(log => `
        <div class="x-bot-log-item" data-time="${log.time}">
          <span class="x-bot-log-time">${formatLogTime(log.time)}</span>
          <span class="x-bot-log-level">${getLevelEmoji(log.level || 'info')}</span>
          <span class="x-bot-log-msg ${log.level || 'info'}">${escapeHtml(formatResultLogMessage(log))}</span>
        </div>
      `).join('');

  const milestone = (state, label, meta = '') => `
    <div class="x-bot-milestone ${state}">
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
      .x-bot-logo {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background: #fff;
        object-fit: contain;
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
      .x-bot-progress-percent.error {
        color: #d64545;
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
      .x-bot-progress-bar-fill.error {
        background: #d64545;
      }
      .x-bot-progress-msg {
        margin-top: 7px;
        color: #65717e;
        font-size: 12px;
      }
      .x-bot-progress-msg.error {
        color: #d64545;
        font-weight: 700;
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
      .x-bot-milestone.failed {
        color: #d64545;
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
      .x-bot-milestone.failed .x-bot-dot {
        background: #d64545;
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
        <img class="x-bot-logo" src="${logoUrl}" alt="">
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
          <span class="x-bot-progress-percent ${progressClass}">${profileProgressLabel}</span>
        </div>
        <div class="x-bot-progress-bar-bg">
          <div class="x-bot-progress-bar-fill ${progressClass}" style="width: ${profileProgressValue}%"></div>
        </div>
        <div class="x-bot-progress-msg ${progressClass}">${escapeHtml(progress.message)}</div>
      </div>
    ` : ''}

    <div class="x-bot-milestones">
      ${milestone(botState.accountBio ? 'done' : (profileFailed ? 'failed' : 'pending'), '读取主页简介')}
      ${milestone(!isPersonaEmpty ? 'done' : 'pending', '人设与目标用户')}
      ${milestone(botState.competitorReport ? 'done' : 'pending', '竞品与爆款框架')}
      ${milestone(botState.xOfficialDraftStatus === 'success' ? 'done' : (botState.xOfficialDraftStatus === 'failed' ? 'failed' : 'pending'), 'X 官方草稿', xDraftStatus)}
    </div>

    <div class="x-bot-next-post">
      <div class="x-bot-mini-stat">
        <span>${xNativeScheduleMode ? 'X 定时排程' : '下次本地发布'}</span>
        <strong>${escapeHtml(nextPostStr)}</strong>
      </div>
      <div class="x-bot-mini-stat">
        <span>今日成果</span>
        <strong>已发 ${postsToday} / 已回 ${repliesSent}</strong>
      </div>
    </div>

    <div class="x-bot-log-panel">
      <div class="x-bot-log-toggle" id="x-bot-log-toggle">
        <span>成果记录 (${resultLogs.length})</span>
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
