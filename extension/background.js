// background.js

const MAX_LOGS = 50;
const DRAFT_TARGET_COUNT = 20;
const DRAFT_REFILL_THRESHOLD = 5;
const FIRST_AUTO_POST_DELAY_MS = 60 * 1000;
const REPLY_COOLDOWN_MS = 5 * 60 * 1000;
const REPLY_RETRY_LOCK_MS = 60 * 1000;
const POST_DELIVERY_MODE_LOCAL = 'localQueue';
const POST_DELIVERY_MODE_X_SCHEDULE = 'xNativeSchedule';

const DEFAULT_AGENT_MEMORY = {
  identity: '',
  marketPosition: '',
  audienceSegments: '',
  audiencePains: '',
  contentPillars: '',
  contentAngles: '',
  proofAssets: '',
  personalStories: '',
  coreOpinions: '',
  boundaries: '',
  voiceRules: '',
  bannedClaims: '',
  interactionTargets: '',
  replyStrategy: '',
  sourceInputs: '',
  weeklyReviewSignals: ''
};

const AGENT_MEMORY_LABELS = {
  identity: '身份与可信理由',
  marketPosition: '差异化定位',
  audienceSegments: '读者分层',
  audiencePains: '读者痛点',
  contentPillars: '内容支柱',
  contentAngles: '选题角度',
  proofAssets: '背书与成果资产',
  personalStories: '个人故事与案例',
  coreOpinions: '核心观点',
  boundaries: '表达边界',
  voiceRules: '表达规则',
  bannedClaims: '禁用话术',
  interactionTargets: '优先互动对象',
  replyStrategy: '评论引流策略',
  sourceInputs: '日常输入来源',
  weeklyReviewSignals: '复盘指标'
};

function normalizeAgentMemory(memory = {}) {
  return { ...DEFAULT_AGENT_MEMORY, ...(memory || {}) };
}

function memoryValueToText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ? String(value) : '';
}

function mergeAgentMemory(base = {}, incoming = {}) {
  const merged = normalizeAgentMemory(base);
  Object.keys(DEFAULT_AGENT_MEMORY).forEach((key) => {
    const value = memoryValueToText(incoming?.[key]).trim();
    if (value) {
      merged[key] = value;
    }
  });
  return merged;
}

function formatAgentMemory(memory = {}) {
  const normalized = normalizeAgentMemory(memory);
  const sections = Object.entries(AGENT_MEMORY_LABELS)
    .map(([key, label]) => {
      const value = memoryValueToText(normalized[key]).trim();
      return value ? `【${label}】\n${value}` : '';
    })
    .filter(Boolean);

  return sections.length > 0 ? sections.join('\n\n') : '暂无长期记忆。';
}

const GROWTH_PLAYBOOKS = {
  ai_product_kol: {
    id: 'ai_product_kol',
    label: 'AI / 产品型 KOL',
    triggers: ['ai', 'agent', '人工智能', '工具', '自动化', 'prompt', '产品', 'zarazhangrui', 'swyx', 'aakashg0', 'lennysan'],
    references: ['@zarazhangrui', '@swyx', '@aakashg0', '@lennysan'],
    method: [
      '把抽象趋势翻译成具体工作流：工具、场景、成本、结果。',
      '用强判断开头，再给一个可验证的案例或操作步骤。',
      '多做产品拆解、工作流拆解、失败复盘和“我会怎么做”。',
      '避免百科式科普，必须让读者觉得这条能立刻改变判断或行动。'
    ],
    mix: '35% 强观点 / 35% 实操工作流 / 20% 产品拆解 / 10% 互动问题'
  },
  monetization_global: {
    id: 'monetization_global',
    label: '出海 / 搞钱 / 个人商业化',
    triggers: ['出海', '搞钱', '副业', '变现', '海外', 'monetization', 'income', '赚钱', 'leobai825', 'levelsio', 'dvassallo', 'codie_sanchez'],
    references: ['@Leobai825', '@levelsio', '@dvassallo', '@codie_sanchez'],
    method: [
      '先讲机会差，再讲谁会付费、交付什么、如何降低交付成本。',
      '用案例和路径替代收益承诺，所有数字都必须是可验证或明确假设。',
      '把内容写成“避坑 + 路径 + 行动清单”，让读者收藏和转发给同类人。',
      '强 CTA 只放在自然相关处，不制造焦虑，不暗示稳赚。'
    ],
    mix: '40% 机会判断 / 30% 变现路径 / 20% 案例复盘 / 10% 低压转化'
  },
  indie_builder: {
    id: 'indie_builder',
    label: '独立开发者 / Build in Public',
    triggers: ['indie', '独立开发', 'build in public', 'mrr', 'saas', '开发者', 'solo', 'marckohlbrugge', 'patio11', 'robj3d3'],
    references: ['@levelsio', '@marckohlbrugge', '@patio11', '@robj3d3'],
    method: [
      '公开真实过程：今天 ship 了什么、遇到什么问题、学到什么。',
      '用小结果、小实验、小失败形成连续剧，而不是只发发布公告。',
      '少讲宏大愿景，多讲截图、用户反馈、定价、转化、留存和取舍。',
      '把产品故事写成人能共情的选择题：为什么这么做，不这么做会怎样。'
    ],
    mix: '35% 构建日志 / 25% 产品故事 / 25% 增长实验 / 15% 教训复盘'
  },
  research_growth: {
    id: 'research_growth',
    label: '产品增长 / 投资研究型账号',
    triggers: ['研究', '投资', '增长', '产品经理', 'research', 'vc', 'market', '趋势', 'shreyas', 'packym'],
    references: ['@aakashg0', '@lennysan', '@shreyas', '@packyM'],
    method: [
      '用结构化框架降低信息噪音：市场地图、决策树、对比表、反共识。',
      '每条内容先给结论，再给证据链，最后给读者一个判断标准。',
      '把热点变成“这意味着什么”，而不是复述新闻。',
      '用收藏价值建信任，用少量鲜明观点制造传播。'
    ],
    mix: '35% 趋势判断 / 30% 框架清单 / 20% 案例拆解 / 15% 观点讨论'
  },
  brand_official: {
    id: 'brand_official',
    label: '产品官方品牌号',
    triggers: ['brand', 'official', '官网', '产品', '公司', 'startup', 'saas'],
    references: ['@OpenAI', '@NotionHQ', '@Linear', '@vercel'],
    method: [
      '把功能更新写成用户问题被解决的故事，不写冷冰冰公告。',
      '用客户场景、模板、教程、案例建立产品可信度。',
      '语气专业克制，但要有人味：解释取舍、展示幕后、邀请反馈。',
      '品牌号少争议，多清晰；少口号，多可操作。'
    ],
    mix: '35% 用户场景 / 25% 产品教育 / 20% 发布故事 / 20% 客户证明'
  }
};

function collectSignalText(...items) {
  return items
    .map(item => memoryValueToText(item))
    .join('\n')
    .toLowerCase();
}

function includesAny(text, words = []) {
  return words.some(word => text.includes(String(word).toLowerCase()));
}

function selectGrowthPlaybook(context = {}) {
  const strategy = context.onboardingStrategy || {};
  const persona = context.persona || context.aiPersona || {};
  const memory = normalizeAgentMemory(context.agentMemory || {});
  const signalText = collectSignalText(
    strategy,
    persona,
    memory,
    context.accountBio,
    context.leadTarget,
    context.sourceInput
  );

  if (strategy.strategyArchetype && GROWTH_PLAYBOOKS[strategy.strategyArchetype]) {
    return GROWTH_PLAYBOOKS[strategy.strategyArchetype];
  }
  if (strategy.accountUse === 'brand') return GROWTH_PLAYBOOKS.brand_official;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.monetization_global.triggers)) return GROWTH_PLAYBOOKS.monetization_global;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.indie_builder.triggers)) return GROWTH_PLAYBOOKS.indie_builder;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.research_growth.triggers)) return GROWTH_PLAYBOOKS.research_growth;
  if (includesAny(signalText, GROWTH_PLAYBOOKS.ai_product_kol.triggers)) return GROWTH_PLAYBOOKS.ai_product_kol;
  return strategy.accountUse === 'kol' ? GROWTH_PLAYBOOKS.ai_product_kol : GROWTH_PLAYBOOKS.indie_builder;
}

function formatGrowthPlaybook(playbook) {
  if (!playbook) return '';
  return `【当前内容增长模板】${playbook.label}
参考账号：${playbook.references.join('、')}
方法论：
${playbook.method.map(item => `- ${item}`).join('\n')}
建议内容配比：${playbook.mix}
注意：只学习结构和方法，不仿写具体原文，不编造这些账号的经历。`;
}

function formatAllGrowthPlaybooks() {
  return Object.values(GROWTH_PLAYBOOKS)
    .map(playbook => `${playbook.id}：${playbook.label}
参考账号：${playbook.references.join('、')}
方法论：${playbook.method.join('；')}
内容配比：${playbook.mix}`)
    .join('\n\n');
}

function formatLeadAsset(strategy = {}) {
  const assetType = strategy.leadAssetType || 'none';
  const assetValue = memoryValueToText(strategy.leadAssetValue).trim();
  if (assetType === 'product') {
    return assetValue
      ? `【评论引流资产】产品/工具：${assetValue}。只在上下文强相关时轻量提及，先提供判断和帮助，不硬推。`
      : '【评论引流资产】产品/工具。尚未填写具体链接或名称，评论时先建立信任，不强行引流。';
  }
  if (assetType === 'post') {
    return assetValue
      ? `【评论引流资产】高质量帖子/资料：${assetValue}。适合在对方需要延伸阅读时自然引导。`
      : '【评论引流资产】高质量帖子/资料。尚未填写具体链接或标题，评论时先沉淀关注，不强行引导。';
  }
  return '【评论引流资产】暂不设置产品或资料入口。评论目标是高质量互动、主页访问和关注沉淀。';
}

function visualLength(text = '') {
  return Array.from(text).reduce((sum, char) => sum + (/[\x00-\x7F]/.test(char) ? 0.55 : 1), 0);
}

function hardSplitLine(line, maxLength) {
  const parts = [];
  let current = '';
  Array.from(line).forEach((char) => {
    if (visualLength(current + char) > maxLength && current) {
      parts.push(current.trim());
      current = char;
    } else {
      current += char;
    }
  });
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitTweetLine(line, maxLength = 34) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (visualLength(trimmed) <= maxLength) return [trimmed];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];

  const tokens = trimmed.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g) || [trimmed];
  const lines = [];
  let current = '';

  tokens.forEach((token) => {
    const next = `${current}${token}`.trim();
    if (current && visualLength(next) > maxLength) {
      lines.push(current.trim());
      current = token.trim();
    } else {
      current = next;
    }
  });
  if (current.trim()) lines.push(current.trim());

  return lines.flatMap(part => visualLength(part) > maxLength * 1.25 ? hardSplitLine(part, maxLength) : [part]);
}

function formatTweetForX(text = '') {
  const raw = memoryValueToText(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
  if (!raw) return '';

  const paragraphs = raw
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  const formatted = paragraphs.map((paragraph) => {
    const lines = paragraph
      .split('\n')
      .flatMap(line => splitTweetLine(line))
      .filter(Boolean);

    if (!paragraph.includes('\n') && lines.length >= 3) {
      const [hook, ...body] = lines;
      const grouped = [];
      body.forEach((line, index) => {
        grouped.push(line);
        if ((index + 1) % 3 === 0 && index < body.length - 1) grouped.push('');
      });
      return [hook, '', ...grouped].join('\n');
    }

    return lines.join('\n');
  });

  return formatted.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isResourceSeekingTweet(text = '') {
  const normalized = String(text || '').toLowerCase();
  return [
    /求|怎么|如何|哪里|推荐|有没有|发一下|给个|链接|资源|教程|工具|清单|模板|手册|pdf|repo|github/,
    /\b(need|looking for|how to|where can|anyone know|recommend|resource|tutorial|tool|template|link|guide|repo|github)\b/
  ].some(pattern => pattern.test(normalized));
}

function getGeneratedReplyRejectionReason(reply = '', tweet = '') {
  const normalized = String(reply || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const strongLeadPatterns = [
    /看.*主页/,
    /翻.*主页/,
    /主页.*(有|见|拿|领)/,
    /私信|dm我|发我消息/,
    /关注我|follow me/,
    /link in bio|check my bio/,
    /领取|加我|联系我/
  ];
  if (!isResourceSeekingTweet(tweet) && strongLeadPatterns.some(pattern => pattern.test(normalized))) {
    return 'AI 回复包含强引流话术，但原推没有明确求资源';
  }
  return '';
}

function scoreNumber(value, fallback = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, n));
}

function scoreObject(scores = {}) {
  return {
    hook: scoreNumber(scores.hook),
    shareability: scoreNumber(scores.shareability),
    replyTrigger: scoreNumber(scores.replyTrigger),
    identity: scoreNumber(scores.identity),
    audienceFit: scoreNumber(scores.audienceFit),
    nativeX: scoreNumber(scores.nativeX)
  };
}

function totalViralScore(scores = {}) {
  const s = scoreObject(scores);
  return s.hook + s.shareability + s.replyTrigger + s.identity + s.audienceFit + s.nativeX;
}

function bestViralCandidate(candidates = [], fallback = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) return formatTweetForX(fallback);
  const normalized = candidates
    .map(candidate => ({
      text: formatTweetForX(candidate?.text || candidate),
      scores: scoreObject(candidate?.scores || {}),
      rationale: memoryValueToText(candidate?.rationale)
    }))
    .filter(candidate => candidate.text);

  normalized.sort((a, b) => totalViralScore(b.scores) - totalViralScore(a.scores));
  return normalized[0]?.text || formatTweetForX(fallback);
}

function normalizeGeneratedTweets(parsed) {
  const rawItems = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tweets) ? parsed.tweets : []);
  return rawItems
    .map(item => {
      if (typeof item === 'string') {
        return {
          text: formatTweetForX(item),
          type: 'unknown',
          scores: scoreObject({}),
          score: totalViralScore({})
        };
      }

      const scores = scoreObject(item?.scores || {});
      return {
        text: formatTweetForX(item?.text),
        type: memoryValueToText(item?.type || item?.contentType || 'unknown'),
        scores,
        score: totalViralScore(scores)
      };
    })
    .filter(item => item.text)
    .filter(item => item.text.length <= 1000)
    .sort((a, b) => b.score - a.score);
}

function normalizeDraftQueue(queue = []) {
  const rawItems = Array.isArray(queue) ? queue : [];
  return rawItems
    .map((item) => {
      const rawText = typeof item === 'string' ? item : item?.text;
      const text = formatTweetForX(rawText);
      if (!text) return null;
      const scores = scoreObject(item?.scores || {});
      const storedScore = Number(item?.viralScore);
      const scheduledAt = Number(item?.scheduledAt);
      const nativeScheduleStatus = ['queued', 'scheduled', 'failed'].includes(item?.nativeScheduleStatus)
        ? item.nativeScheduleStatus
        : '';
      return {
        id: typeof item === 'object' && item ? item.id ?? null : null,
        text,
        type: typeof item === 'object' && item ? memoryValueToText(item.type || 'unknown') : 'legacy',
        viralScore: Number.isFinite(storedScore) ? storedScore : totalViralScore(scores),
        scores,
        scheduledAt: Number.isFinite(scheduledAt) ? scheduledAt : null,
        nativeScheduleStatus
      };
    })
    .filter(Boolean)
    .slice(0, DRAFT_TARGET_COUNT);
}

function addLog(level, message) {
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'background'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function debuggerCall(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

async function performTrustedClick(tabId, x, y) {
  if (!tabId) throw new Error('缺少目标标签页');
  if (!chrome.debugger) throw new Error('缺少 debugger 权限');

  const target = { tabId };
  const clickX = Math.round(Number(x));
  const clickY = Math.round(Number(y));
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    throw new Error('点击坐标无效');
  }

  await debuggerCall(callback => chrome.debugger.attach(target, '1.3', callback));
  try {
    await debuggerCall(callback => chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: clickX,
      y: clickY,
      button: 'none'
    }, callback));
    await debuggerCall(callback => chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: clickX,
      y: clickY,
      button: 'left',
      buttons: 1,
      clickCount: 1
    }, callback));
    await new Promise(resolve => setTimeout(resolve, 80));
    await debuggerCall(callback => chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: clickX,
      y: clickY,
      button: 'left',
      buttons: 0,
      clickCount: 1
    }, callback));
  } finally {
    try {
      await debuggerCall(callback => chrome.debugger.detach(target, callback));
    } catch (error) {
      addLog('warn', `释放调试点击通道失败: ${error.message}`);
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("X Auto Bot extension installed.");
  addLog('info', '扩展程序已安装/更新');
  // 初始化默认配置
  chrome.storage.local.get(['apiKey', 'targetUsers', 'promptTemplate', 'leadTarget', 'isRunning'], (result) => {
    if (!result.hasOwnProperty('isRunning')) {
      chrome.storage.local.set({
        isRunning: false,
        apiKey: '',
        apiProvider: 'gemini',
        aiModel: 'gemini-2.5-flash',
        targetUsers: '',
        promptTemplate: '你是一个 X 账号增长顾问。请根据推文内容，先判断是否值得回复；如果值得，只写一条自然、有信息增量、像真人评论的短回复。\n不要硬广，不要让对方看主页/私信/关注/领取，除非原推明确在求资源、教程、工具或链接。\n\n【推文】：{tweet}\n【可用引流信息，仅在强相关且对方明确求资源时使用】：{leadTarget}\n\n回复：',
        leadTarget: '',
        agentMemory: DEFAULT_AGENT_MEMORY,
        agentChatMessages: [],
        postInterval: 30,
        replyInterval: 30,
        postDeliveryMode: POST_DELIVERY_MODE_LOCAL
      });
    }
  });
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// 处理来自 content scripts 或 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateReply") {
    addLog('info', '收到回复生成请求，调用 AI 接口...');
    // 调用大模型 API 生成回复
    generateAIResponse(request.tweetContent || request.tweetText || '')
      .then(replyText => {
        addLog('success', 'AI 回复生成完成');
        sendResponse({ success: true, replyText, reply: replyText });
      })
      .catch(error => {
        addLog('error', `AI 接口调用失败: ${error.message}`);
        sendResponse({
          success: false,
          error: error.message,
          errorType: error.type || 'UNKNOWN',
          isApiCooldown: error.type === 'RATE_LIMIT'
        });
      });
    return true; // 保持通道异步开启
  } else if (request.action === "trustedClick") {
    performTrustedClick(sender.tab?.id, request.x, request.y)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        addLog('warn', `真实点击失败，回退 DOM 点击: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "queueUpdated") {
    checkAndSetupAlarm();
  } else if (request.action === "refreshXOfficialDraftCount") {
    refreshXOfficialDraftCount(sendResponse);
    return true;
  } else if (request.action === "xLoginDetected") {
    handleXLoginDetected();
    sendResponse({ success: true });
  } else if (request.action === "startAccountAutoSetup") {
    startAccountAutoSetup(sendResponse);
    return true;
  } else if (request.action === "analyzeOnboardingSource") {
    analyzeOnboardingSource(request.sourceInput || '')
      .then((analysis) => sendResponse({ success: true, analysis }))
      .catch((error) => {
        addLog('warn', `启动向导分析失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "agentChat") {
    handleAgentChat(request.message || '')
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        addLog('error', `Agent 对话失败: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === "maybeStartAgentAfterSetup") {
    maybeStartAgentAfterSetup(sendResponse);
    return true;
  } else if (request.action === "testPostNow") {
    const text = formatTweetForX(request.text || '');
    if (!text) {
      sendResponse({ success: false, error: '测试发帖内容为空' });
      return false;
    }
    chrome.storage.local.get(['pendingPost'], (existing) => {
      if (existing.pendingPost) {
        sendResponse({ success: false, error: '已有待发送推文，请先处理完成或停止自动化后再测试' });
        return;
      }
      chrome.storage.local.set({
        pendingPost: text,
        pendingPostId: null,
        pendingPostSource: 'manualTest',
        pendingScheduledAt: null,
        isAutoPaused: false,
        pauseReason: ''
      }, () => {
        addLog('info', '收到手动测试发帖请求');
        triggerPostInTab();
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "postCompleted") {
    handlePostCompleted(request.source || 'queue');
    sendResponse({ success: true });
  } else if (request.action === "postFailed") {
    const reason = request.reason || '发帖失败，请人工检查';
    addLog('error', reason);
    chrome.storage.local.set({ isAutoPaused: true, pauseReason: reason });
    sendResponse({ success: true });
  } else if (request.action === "replyCompleted") {
    const author = request.tweetAuthor || '未知用户';
    const replyText = request.replyText || '';
    const twitterCooldownUntil = Date.now() + REPLY_COOLDOWN_MS;
    chrome.storage.local.get(['stats'], (res) => {
      const stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
      stats.repliesSent = (stats.repliesSent || 0) + 1;
      chrome.storage.local.set({
        stats,
        twitterCooldownUntil,
        lastReplySent: {
          tweetAuthor: author,
          replyText,
          time: Date.now()
        }
      }, () => {
        addLog('success', `确认已回复 @${author}，进入 ${Math.round(REPLY_COOLDOWN_MS / 60000)} 分钟互动冷却`);
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.action === "replyFailed") {
    const reason = request.reason || '回复未完成，请检查 X 弹窗状态';
    addLog('warn', reason);
    chrome.storage.local.set({
      twitterCooldownUntil: Date.now() + REPLY_RETRY_LOCK_MS,
      lastReplyFailure: {
        reason,
        time: Date.now()
      }
    });
    sendResponse({ success: true });
  } else if (request.action === "extractBio" || request.action === "openProfileTab") {
    const rawUrl = request.url || request.profileUrl || request.profilePath || '';
    const profileUrl = rawUrl.startsWith('http') ? rawUrl : `https://x.com${rawUrl}`;
    addLog('info', `后台打开 Profile 页面: ${profileUrl}`);
    chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
      // Listen for bio extraction to close the tab
      chrome.storage.onChanged.addListener(function listener(changes, namespace) {
        if (namespace === 'local' && changes.accountBio) {
          addLog('success', 'Profile 页面读取完成，关闭后台标签页');
          chrome.tabs.remove(tab.id);
          chrome.storage.onChanged.removeListener(listener);
        }
      });
    });
  }
});

function refreshXOfficialDraftCount(sendResponse) {
  chrome.storage.local.set({
    xOfficialDraftStatus: 'reading',
    xOfficialDraftError: ''
  }, () => {
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      const target = tabs.find(t => t.active) || tabs[0];
      if (!target) {
        const error = '未找到已打开的 X 页面';
        chrome.storage.local.set({
          xOfficialDraftStatus: 'failed',
          xOfficialDraftError: error,
          xOfficialDraftReadAt: Date.now()
        });
        sendResponse?.({ success: false, error });
        return;
      }

      chrome.tabs.sendMessage(target.id, { action: 'readXOfficialDraftCount' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          const error = chrome.runtime.lastError?.message || response?.error || 'X 页面未响应草稿读取';
          chrome.storage.local.set({
            xOfficialDraftStatus: 'failed',
            xOfficialDraftError: error,
            xOfficialDraftReadAt: Date.now()
          });
          sendResponse?.({ success: false, error });
          return;
        }
        sendResponse?.({ success: true, count: response.count });
      });
    });
  });
}

// ==========================================
// Configuration Check
// ==========================================
function getConfigErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if (!config.leadTarget) errors.push('缺少引流目标');
  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function getAIConnectionErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if ((config.apiProvider || 'gemini') !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function isConfigValid(config) {
  return getConfigErrors(config).length === 0;
}

function hasPersona(persona) {
  return Boolean(persona && (persona.targetUsers || persona.characteristics || persona.goals));
}

function getAutomationMode(config = {}) {
  return config.onboardingStrategy?.automationMode || 'review';
}

function canAutoPublish(config = {}) {
  return getAutomationMode(config) === 'auto';
}

function getPostDeliveryMode(config = {}) {
  return config.postDeliveryMode || POST_DELIVERY_MODE_LOCAL;
}

function handleXLoginDetected() {
  chrome.storage.local.get(['xLoginSettingsOpened', 'apiKey', 'leadTarget', 'aiPersona', 'competitorReport'], (res) => {
    const ready = Boolean(res.apiKey && res.leadTarget && hasPersona(res.aiPersona) && res.competitorReport);
    if (res.xLoginSettingsOpened || ready) return;

    chrome.storage.local.set({ xLoginSettingsOpened: true }, () => {
      addLog('info', '检测到 X 已登录，自动打开策略中心');
      chrome.runtime.openOptionsPage();
    });
  });
}

function startAccountAutoSetup(sendResponse) {
  chrome.storage.local.set({
    profileReadRequested: true,
    setupAutoStartRequested: true,
    isAutoPaused: false,
    pauseReason: '',
    profileReadProgress: {
      stage: 'queued',
      message: '已开始读取 X 账号，等待页面响应...',
      percent: 10,
      updatedAt: Date.now()
    }
  }, () => {
    chrome.storage.local.get(['accountBio'], (res) => {
      if (res.accountBio) {
        addLog('info', '使用已读取的主页简介重新分析账号画像');
        analyzeAccountPersona(res.accountBio);
        sendResponse({ success: true, message: '已使用当前简介开始 AI 分析' });
        return;
      }

      triggerProfileReadInTab();
      sendResponse({ success: true, message: '已开始读取 X 账号，请保持 X 页面已登录' });
    });
  });
}

function triggerProfileReadInTab() {
  chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
    const target = tabs.find(t => t.active) || tabs[0];
    if (!target) {
      addLog('info', '未找到 X 标签页，打开 X 首页等待登录/读取');
      chrome.tabs.create({ url: 'https://x.com/home', active: true });
      return;
    }

    chrome.tabs.sendMessage(target.id, { action: 'forceReadProfileBio' }, () => {
      if (chrome.runtime.lastError) {
        addLog('warn', `X 标签页未响应读取指令，刷新到 X 首页: ${chrome.runtime.lastError.message}`);
        chrome.tabs.update(target.id, { url: 'https://x.com/home', active: true });
      }
    });
  });
}

function maybeStartAgentAfterSetup(sendResponse) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'aiPersona', 'competitorReport'], (res) => {
    const errors = getConfigErrors(res);
    const ready = errors.length === 0 && hasPersona(res.aiPersona) && Boolean(res.competitorReport);
    if (!ready) {
      if (errors.length > 0) chrome.storage.local.set({ configErrors: errors });
      sendResponse?.({ success: true, started: false, errors });
      return;
    }

    chrome.storage.local.set({
      isRunning: true,
      isAutoPaused: false,
      pauseReason: '',
      twitterCooldownUntil: 0,
      apiCooldownUntil: 0,
      isGeneratingReply: false,
      isTyping: false,
      setupAutoStartRequested: false,
      configErrors: []
    }, () => {
      chrome.storage.local.remove(['configErrors']);
      addLog('success', '策略配置完成，Agent 已自动启动');
      sendResponse?.({ success: true, started: true });
    });
  });
}

// ==========================================
// LLM Calling
// ==========================================
async function callLLM(prompt, config, requireJson = false) {
  const provider = config.apiProvider || 'gemini';
  
  // Gemini Native API
  if (provider === 'gemini') {
    const bodyObj = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    if (requireJson) {
      bodyObj.generationConfig = { responseMimeType: "application/json" };
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj)
    });
    const data = await response.json();
    if (data.error) {
       let err = new Error(data.error.message);
       err.type = 'RATE_LIMIT';
       throw err;
    }
    return data.candidates[0].content.parts[0].text;
  }
  
  // OpenAI-compatible providers: openrouter, qwen, deepseek
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions'
  };
  
  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(`不支持的 AI 服务商: ${provider}`);
  }
  
  const model = config.aiModel || 'google/gemini-2.5-flash';
  const reqBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }]
  };
  
  // JSON hint for supported providers
  if (requireJson && provider === 'deepseek') {
    reqBody.response_format = { type: "json_object" };
  }
  
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // OpenRouter requires extra headers
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://x.com';
    headers['X-Title'] = 'X Auto Bot';
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(reqBody)
  });
  
  const data = await response.json();
  if (data.error) {
     let err = new Error(data.error.message || JSON.stringify(data.error));
     err.type = data.error.code === 'rate_limit_exceeded' || data.error.type === 'rate_limit' ? 'RATE_LIMIT' : 'API_ERROR';
     throw err;
  }
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('API 返回格式异常: ' + JSON.stringify(data).substring(0, 200));
  }
  return data.choices[0].message.content;
}

function checkAndSetupAlarm() {
  chrome.storage.local.get(['tweetQueue', 'isRunning', 'onboardingStrategy', 'postDeliveryMode'], (result) => {
    if (!result.isRunning) {
       chrome.alarms.clear("postTweetAlarm");
       return;
    }
    if (!canAutoPublish(result)) {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '先审后发：等待人工确认' });
      return;
    }
    const queue = normalizeDraftQueue(result.tweetQueue);
    if (getPostDeliveryMode(result) === POST_DELIVERY_MODE_X_SCHEDULE) {
      chrome.alarms.clear("postTweetAlarm");
      if (queue.length > 0) {
        chrome.storage.local.set({ nextPostTime: `写入 X 定时发布：待处理 ${queue.length} 条` });
        scheduleNativeQueue();
      } else {
        chrome.storage.local.set({ nextPostTime: '等待内容队列生成' });
      }
      return;
    }
    if (queue.length > 0) {
      chrome.alarms.get("postTweetAlarm", (alarm) => {
        if (!alarm) {
          scheduleNextPost();
        }
      });
    } else {
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '等待内容队列生成' });
    }
  });
}

// ==========================================
// Post Scheduling
// ==========================================
function parseTimeSlots(slotsStr) {
  if (!slotsStr) return [{ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 }];
  return slotsStr.split(',').map(s => {
    const parts = s.trim().split('-');
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return { start: isNaN(start) ? 0 : start, end: isNaN(end) ? 24 : end };
  }).filter(s => s.start < s.end);
}

function scheduleNextPost() {
  const now = new Date();
  chrome.storage.local.get([
    'postsToday', 'lastPostDate', 'isAutoPaused',
    'postsPerDay', 'postScheduleMode', 'smartTimeSlots', 'postInterval'
  ], (res) => {
    if (res.isAutoPaused) {
      addLog('info', '自动操作已暂停，跳过发推调度');
      return;
    }
    const postsToday = (res.lastPostDate === now.toDateString()) ? (res.postsToday || 0) : 0;
    const postsPerDay = res.postsPerDay || 10;
    const mode = res.postScheduleMode || 'smart';
    
    if (postsToday >= postsPerDay) {
      addLog('info', `今日已发 ${postsToday}/${postsPerDay} 条，暂停发推至次日`);
      scheduleForTomorrow(now, res);
      return;
    }

    if (postsToday === 0) {
      const firstRunTime = new Date(now.getTime() + FIRST_AUTO_POST_DELAY_MS);
      setAlarmAtDate(firstRunTime, '纯自动发布：启动后快速执行第一条发推');
      return;
    }
    
    if (mode === 'interval') {
      scheduleInterval(now, res);
    } else {
      scheduleSmart(now, res, postsToday, postsPerDay);
    }
  });
}

function scheduleInterval(now, config) {
  const interval = (config.postInterval || 60) * 60000;
  const targetTime = new Date(now.getTime() + interval);
  const targetHour = targetTime.getHours();
  const targetMin = targetTime.getMinutes();
  const addDays = targetTime.getDate() !== now.getDate() ? 1 : 0;
  setAlarm(targetHour, targetMin, addDays);
  addLog('info', `固定间隔模式：计划 ${targetTime.toLocaleString()} 发推`);
}

function scheduleSmart(now, config, postsToday, postsPerDay) {
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    addLog('warn', '智能时段配置为空，使用默认时段');
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  
  const hour = now.getHours();
  let targetSlot = null;
  let addDays = 0;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (hour < slot.start) {
      // 当前时间在该时段开始之前
      targetSlot = slot;
      break;
    } else if (hour >= slot.start && hour < slot.end) {
      // 当前时间在该时段内，跳到下一个时段
      if (i + 1 < slots.length) {
        targetSlot = slots[i + 1];
      } else {
        targetSlot = slots[0];
        addDays = 1;
      }
      break;
    }
  }
  
  // 当前时间在所有时段之后
  if (!targetSlot) {
    targetSlot = slots[0];
    addDays = 1;
  }
  
  const range = Math.max(1, targetSlot.end - targetSlot.start);
  const targetHour = targetSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  
  setAlarm(targetHour, targetMin, addDays);
  const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin);
  addLog('info', `智能分布模式：计划 ${targetTime.toLocaleString()} 发推（今日 ${postsToday}/${postsPerDay}）`);
}

function scheduleForTomorrow(now, config) {
  // 达到每日上限后，统一安排到次日第一个时段的随机时间点
  const slots = parseTimeSlots(config.smartTimeSlots);
  const firstSlot = slots[0] || { start: 8, end: 10 };
  const range = Math.max(1, firstSlot.end - firstSlot.start);
  const targetHour = firstSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  setAlarm(targetHour, targetMin, 1);
}

function setAlarm(targetHour, targetMin, addDays) {
  const now = new Date();
  let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin, 0, 0);
  
  if (targetTime.getTime() <= now.getTime()) {
      targetTime = new Date(now.getTime() + 5 * 60000); // fallback 5 mins later
  }

  setAlarmAtDate(targetTime);
}

function setAlarmAtDate(targetTime, reason = '已安排下一次发推') {
  chrome.alarms.clear("postTweetAlarm", () => {
    chrome.alarms.create("postTweetAlarm", { when: targetTime.getTime() });
  });
  addLog('info', `${reason}: ${targetTime.toLocaleString()}`);
  chrome.storage.local.set({ nextPostTime: targetTime.toLocaleString() }, () => {
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
  });
}

function chooseMinute(start = 0) {
  const min = Math.max(0, Math.min(59, Number(start) || 0));
  return min + Math.floor(Math.random() * Math.max(1, 60 - min));
}

function buildSmartSchedulePlan(count, config = {}) {
  const now = new Date();
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  const postsPerDay = Math.max(1, Number(config.postsPerDay) || 5);
  const plan = [];
  let dayOffset = 0;

  while (plan.length < count && dayOffset < 21) {
    const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, 0, 0, 0);
    const availableSlots = slots
      .map((slot) => {
        const range = Math.max(1, slot.end - slot.start);
        const hour = slot.start + Math.floor(Math.random() * range);
        const minute = chooseMinute();
        return new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate(), hour, minute, 0, 0);
      })
      .filter(date => date.getTime() > now.getTime() + 5 * 60000)
      .sort((a, b) => a.getTime() - b.getTime());

    availableSlots.slice(0, postsPerDay).forEach(date => {
      if (plan.length < count) plan.push(date.getTime());
    });
    dayOffset++;
  }

  return plan;
}

function buildIntervalSchedulePlan(count, config = {}) {
  const interval = Math.max(15, Number(config.postInterval) || 60) * 60000;
  const firstAt = Date.now() + Math.max(interval, 10 * 60000);
  return Array.from({ length: count }, (_, index) => firstAt + index * interval);
}

function buildPostSchedulePlan(count, config = {}) {
  if (count <= 0) return [];
  return (config.postScheduleMode || 'smart') === 'interval'
    ? buildIntervalSchedulePlan(count, config)
    : buildSmartSchedulePlan(count, config);
}

function ensureNativeScheduleTimes(queue = [], config = {}) {
  const normalized = normalizeDraftQueue(queue);
  const missing = normalized.filter(item => !item.scheduledAt || item.nativeScheduleStatus === 'failed');
  const plan = buildPostSchedulePlan(missing.length, config);
  let planIndex = 0;

  return normalized.map((item) => {
    if (item.nativeScheduleStatus === 'scheduled') return item;
    if (item.scheduledAt && item.nativeScheduleStatus !== 'failed') return item;
    return {
      ...item,
      scheduledAt: plan[planIndex++] || Date.now() + (planIndex + 1) * 30 * 60000,
      nativeScheduleStatus: 'queued'
    };
  });
}

function formatScheduleTime(ts) {
  const date = new Date(Number(ts));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '未设置';
}

function scheduleNativeQueue() {
  chrome.storage.local.get([
    'tweetQueue', 'pendingPost', 'isRunning', 'isAutoPaused', 'onboardingStrategy',
    'postDeliveryMode', 'postsPerDay', 'postScheduleMode', 'smartTimeSlots', 'postInterval'
  ], (result) => {
    if (!result.isRunning || result.isAutoPaused || !canAutoPublish(result)) return;
    if (getPostDeliveryMode(result) !== POST_DELIVERY_MODE_X_SCHEDULE) return;
    if (result.pendingPost) {
      addLog('info', '已有待处理发布任务，等待当前 X 定时发布完成');
      return;
    }

    let queue = ensureNativeScheduleTimes(result.tweetQueue, result);
    const nextTweet = queue.find(item => item.nativeScheduleStatus !== 'scheduled');
    if (!nextTweet) {
      chrome.storage.local.set({ tweetQueue: queue, nextPostTime: 'X 定时发布已全部写入' });
      return;
    }

    queue = queue.map(item => item.id === nextTweet.id ? { ...item, nativeScheduleStatus: 'queued' } : item);
    chrome.storage.local.set({
      tweetQueue: queue,
      pendingPost: nextTweet.text,
      pendingPostId: nextTweet.id || null,
      pendingPostSource: POST_DELIVERY_MODE_X_SCHEDULE,
      pendingScheduledAt: nextTweet.scheduledAt,
      nextPostTime: `正在写入 X 定时发布：${formatScheduleTime(nextTweet.scheduledAt)}`
    }, () => {
      addLog('info', `准备写入 X 原生定时发布：${formatScheduleTime(nextTweet.scheduledAt)}`);
      triggerPostInTab();
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "postTweetAlarm") {
    addLog('info', '定时器触发，准备执行发推');
    executeNextPost();
  }
});

function executeNextPost() {
  chrome.storage.local.get(['tweetQueue', 'pendingPost', 'postsToday', 'lastPostDate', 'postsPerDay', 'isAutoPaused', 'onboardingStrategy', 'postDeliveryMode'], (result) => {
    if (!canAutoPublish(result)) {
      addLog('info', '当前为先审后发/影子模式，跳过自动发推执行');
      chrome.alarms.clear("postTweetAlarm");
      chrome.storage.local.set({ nextPostTime: '先审后发：等待人工确认' });
      return;
    }
    if (getPostDeliveryMode(result) === POST_DELIVERY_MODE_X_SCHEDULE) {
      addLog('info', '当前为 X 原生定时发布模式，改为写入 X 定时器');
      chrome.alarms.clear("postTweetAlarm");
      scheduleNativeQueue();
      return;
    }
    if (result.isAutoPaused) {
      addLog('info', '自动操作已暂停，跳过本次发推执行');
      return;
    }
    let queue = normalizeDraftQueue(result.tweetQueue);
    if (queue.length === 0) {
      checkAndSetupAlarm();
      return;
    }
    
    if (result.pendingPost) {
       triggerPostInTab();
       return;
    }
    
    const postsPerDay = result.postsPerDay || 10;
    const todayStr = new Date().toDateString();
    const postsToday = result.lastPostDate === todayStr ? (result.postsToday || 0) : 0;
    if (postsToday >= postsPerDay) {
      addLog('info', `今日已达发推上限 ${postsToday}/${postsPerDay}，跳过本次执行`);
      scheduleForTomorrow(new Date(), result);
      return;
    }

    const nextTweet = queue[0];
    const postText = formatTweetForX(nextTweet.text);
    if (!postText) {
      addLog('warn', '队列首条推文为空，已移除并重新调度');
      chrome.storage.local.set({ tweetQueue: queue.slice(1) }, () => checkAndSetupAlarm());
      return;
    }
    addLog('info', `执行发推，当前队列 ${queue.length} 条，发送成功后剩余 ${Math.max(queue.length - 1, 0)} 条`);
    
    chrome.storage.local.set({ 
      pendingPost: postText,
      pendingPostId: nextTweet.id || null,
      pendingPostSource: 'queue'
    }, () => {
      triggerPostInTab();
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
    });
  });
}

function getIntentPostUrl(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text || '')}`;
}

function triggerPostInTab() {
  chrome.storage.local.get(['pendingPost'], (result) => {
    const intentUrl = getIntentPostUrl(result.pendingPost || '');
    chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        let tab = tabs.find(t => t.active) || tabs[0];
        addLog('info', `向标签页 ${tab.id} 发送发推指令`);
        chrome.tabs.sendMessage(tab.id, { action: "postNewTweet" }, () => {
          if (chrome.runtime.lastError) {
            addLog('warn', `标签页未响应内容脚本，改用 intent/post 导航: ${chrome.runtime.lastError.message}`);
            chrome.tabs.update(tab.id, { url: intentUrl });
          }
        });
      } else {
        addLog('info', '未找到 X.com 标签页，新建 intent/post 标签页');
        chrome.tabs.create({ url: intentUrl });
      }
    });
  });
}

function handlePostCompleted(source) {
  chrome.storage.local.get(['postsToday', 'lastPostDate', 'tweetQueue', 'pendingPost', 'pendingPostId', 'nativeScheduledCount'], (result) => {
    const updates = {
      pendingPost: null,
      pendingPostId: null,
      pendingPostSource: null,
      pendingScheduledAt: null,
      isAutoPaused: false,
      pauseReason: ''
    };

    if (source === 'queue') {
      const now = new Date();
      const todayStr = now.toDateString();
      let postsToday = result.postsToday || 0;
      if (result.lastPostDate !== todayStr) postsToday = 0;
      updates.postsToday = postsToday + 1;
      updates.lastPostDate = todayStr;
      const queue = normalizeDraftQueue(result.tweetQueue);
      if (result.pendingPostId !== null && result.pendingPostId !== undefined) {
        updates.tweetQueue = queue.filter(item => item.id !== result.pendingPostId);
      } else if (queue[0] && queue[0].text === result.pendingPost) {
        updates.tweetQueue = queue.slice(1);
      }
      addLog('success', `队列推文发送成功，今日已发 ${updates.postsToday} 条`);
    } else if (source === POST_DELIVERY_MODE_X_SCHEDULE) {
      const queue = normalizeDraftQueue(result.tweetQueue);
      updates.tweetQueue = queue.filter(item => item.id !== result.pendingPostId);
      updates.nativeScheduledCount = (Number(result.nativeScheduledCount) || 0) + 1;
      addLog('success', `X 原生定时发布写入成功，剩余 ${updates.tweetQueue.length} 条待处理`);
    } else {
      addLog('success', '测试推文发送成功');
    }

    chrome.storage.local.set(updates, () => {
      chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
      if (source === POST_DELIVERY_MODE_X_SCHEDULE) {
        setTimeout(scheduleNativeQueue, 2500);
      } else {
        checkAndSetupAlarm();
      }
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
    });
  });
}

async function generateAIResponse(tweetContent) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'promptTemplate', 'leadTarget', 'aiPersona', 'agentMemory', 'onboardingStrategy', 'accountBio'], async (config) => {
      const errors = getConfigErrors(config);
      if (errors.length > 0) {
        addLog('warn', `配置不完整，无法生成回复：${errors.join('、')}`);
        return reject(new Error(errors.join('；')));
      }
      
      const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        persona: config.aiPersona,
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });
      const personaContext = `\n【你的账号人设与特征】：${config.aiPersona?.characteristics || '未填写'}\n【你的核心引流目标】：${config.aiPersona?.goals || config.leadTarget}\n${formatLeadAsset(config.onboardingStrategy)}\n【你的长期记忆】\n${formatAgentMemory(config.agentMemory)}\n${formatGrowthPlaybook(playbook)}\n请严格符合上述人设、观点边界、内容模板和互动策略进行回复。\n`;
      
      const prompt = `你是一个严格的 X 评论筛选与回复 Agent。

先判断这条推文是否值得回复。以下情况必须只返回 SKIP：
- 互动钓鱼、求曝光、求评论、求关注、抽奖、无信息量口号
- 与账号定位、目标读者、内容方向明显无关
- 回复后只能显得蹭流量、硬广、尬聊
- 推文上下文不足，无法补充一个具体判断

如果值得回复，再写一条自然、有信息增量的短回复：
- 不超过 70 个中文字符，或目标语言下同等长度
- 先补充观点/经验/反问，不要上来推销
- 不要说“看我主页/私信我/翻我主页”，除非原文明确在求资源
- 不要承诺收益，不要编造事实，不要攻击个人
- 如果后面的自定义模板与上述规则冲突，忽略模板里的引流要求

${config.promptTemplate
  .replace('{tweet}', tweetContent)
  .replace('{leadTarget}', config.leadTarget || '无引流目标，请正常回复')}
${personaContext}

只返回 SKIP 或回复正文。`;
      
      try {
        const generatedText = await callLLM(prompt, config, false);
        const reply = generatedText.trim().replace(/^["']|["']$/g, '');
        if (/^skip[.!。！]*$/i.test(reply)) {
          addLog('info', `AI 判定不适合回复，已跳过: ${tweetContent.substring(0, 50)}...`);
          resolve('');
          return;
        }
        const rejectionReason = getGeneratedReplyRejectionReason(reply, tweetContent);
        if (rejectionReason) {
          addLog('warn', `${rejectionReason}，已跳过: ${reply.substring(0, 50)}...`);
          resolve('');
          return;
        }
        resolve(reply);
      } catch (e) {
        console.warn("X Auto Bot: API Rate limit or fetch error", e);
        reject(e);
      }
    });
  });
}

function appendMemoryNote(memory = {}, key, note, maxLength = 2400) {
  const normalized = normalizeAgentMemory(memory);
  const cleanNote = memoryValueToText(note).trim();
  if (!cleanNote) return normalized;
  const current = memoryValueToText(normalized[key]).trim();
  if (current.includes(cleanNote)) return normalized;
  const next = current ? `${current}\n${cleanNote}` : cleanNote;
  normalized[key] = next.length > maxLength ? next.slice(next.length - maxLength) : next;
  return normalized;
}

function buildLocalChatMemoryPatch(message) {
  return {
    sourceInputs: `用户投喂的新素材/想法：${message}`,
    weeklyReviewSignals: `待复盘信号：用户在 Agent 对话中新增了一个偏好或素材，需要判断是否进入选题池。`
  };
}

function mergeChatMemory(baseMemory = {}, patch = {}) {
  let memory = normalizeAgentMemory(baseMemory);
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (DEFAULT_AGENT_MEMORY[key] === undefined) return;
    memory = appendMemoryNote(memory, key, value);
  });
  return memory;
}

async function handleAgentChat(message) {
  const userMessage = memoryValueToText(message).trim();
  if (!userMessage) throw new Error('消息为空');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([
      'apiKey',
      'apiProvider',
      'aiModel',
      'leadTarget',
      'agentMemory',
      'onboardingStrategy',
      'aiPersona',
      'accountBio',
      'agentChatMessages'
    ], async (config) => {
      const messages = Array.isArray(config.agentChatMessages) ? config.agentChatMessages.slice(-60) : [];
      const userEntry = { role: 'user', content: userMessage, time: Date.now() };
      const errors = getAIConnectionErrors(config);

      if (errors.length > 0) {
        const memoryPatch = buildLocalChatMemoryPatch(userMessage);
        const agentMemory = mergeChatMemory(config.agentMemory, memoryPatch);
        const assistantEntry = {
          role: 'assistant',
          content: `我先把这条输入记录进素材池。\n\n当前还缺少 API Key 或模型配置，所以我不能做深度拆解。配置好模型后，我会把这类输入进一步转成：选题角度、表达规则、评论策略或可发布内容。`,
          time: Date.now()
        };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);
        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('info', 'Agent 对话已本地记录到长期记忆');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
        return;
      }

      const playbook = selectGrowthPlaybook({
        onboardingStrategy: config.onboardingStrategy,
        persona: config.aiPersona,
        agentMemory: config.agentMemory,
        accountBio: config.accountBio,
        leadTarget: config.leadTarget
      });

      const recentContext = messages.slice(-12)
        .map(item => `${item.role === 'user' ? '用户' : 'Agent'}：${item.content}`)
        .join('\n');

      const prompt = `你是一个专用的 X 发声 Agent 策略编辑器，不是通用聊天机器人。
用户会把好帖子、想法、复盘、偏好、产品方向或评论引流资产发给你。

你的任务：
1. 判断这条输入应该沉淀为：选题角度、核心观点、语气规则、读者痛点、评论策略、风险边界、素材来源或复盘信号。
2. 用简短但有判断力的方式回复用户，告诉他这条输入可以如何用于 X 发声。
3. 必须提炼 memoryPatch，写入长期记忆。不要覆盖原记忆，只提供新增内容。
4. 如适合，给一个 X 原生表达样例，但不要承诺收益，不要编造事实，不要变成公众号腔。

账号画像：
- 目标用户：${config.aiPersona?.targetUsers || '未填写'}
- 发文特征：${config.aiPersona?.characteristics || '未填写'}
- 核心目标：${config.aiPersona?.goals || config.leadTarget || '未填写'}
${formatLeadAsset(config.onboardingStrategy)}

当前长期记忆：
${formatAgentMemory(config.agentMemory)}

当前增长模板：
${formatGrowthPlaybook(playbook)}

最近对话：
${recentContext || '暂无'}

用户最新输入：
${userMessage}

只返回 JSON，不要 Markdown 代码块：
{
  "reply": "给用户看的回复，必须明确说明这不是泛聊，而是如何更新 X 发声策略",
  "memoryPatch": {
    "identity": "",
    "marketPosition": "",
    "audienceSegments": "",
    "audiencePains": "",
    "contentPillars": "",
    "contentAngles": "",
    "proofAssets": "",
    "personalStories": "",
    "coreOpinions": "",
    "boundaries": "",
    "voiceRules": "",
    "bannedClaims": "",
    "interactionTargets": "",
    "replyStrategy": "",
    "sourceInputs": "",
    "weeklyReviewSignals": ""
  },
  "suggestedTweet": "如果适合，给一条带换行的候选推文；不适合则为空"
}`;

      try {
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch (parseError) {
          parsed = {
            reply: generatedText.trim(),
            memoryPatch: buildLocalChatMemoryPatch(userMessage),
            suggestedTweet: ''
          };
        }

        const agentMemory = mergeChatMemory(config.agentMemory, parsed.memoryPatch || {});
        const suggestedTweet = formatTweetForX(parsed.suggestedTweet || '');
        const replyText = [
          memoryValueToText(parsed.reply).trim() || '我已把这条输入转成 X Agent 的记忆更新。',
          suggestedTweet ? `\n可测试推文：\n${suggestedTweet}` : ''
        ].filter(Boolean).join('\n');
        const assistantEntry = { role: 'assistant', content: replyText, time: Date.now() };
        const nextMessages = [...messages, userEntry, assistantEntry].slice(-60);

        chrome.storage.local.set({ agentChatMessages: nextMessages, agentMemory }, () => {
          addLog('success', 'Agent 对话已更新长期记忆');
          resolve({ messages: nextMessages, agentMemory, memoryUpdated: true });
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function analyzeAccountPersona(bio) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'agentMemory'], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析账号画像：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
      return;
    }
    addLog('info', '开始 AI 账号画像分析...');
    
    const prompt = `你是 X/Twitter 增长操盘手，请把以下账号主页信息重构成一个“个人发声 Agent 的长期记忆”。
你不是普通品牌顾问。你的判断必须围绕：
- 这个账号靠什么被关注
- 哪类内容负责涨粉、建信任、转化、互动截流、人设加深
- 目标用户为什么会停留、转发、评论、收藏
- 账号应该避免哪些会降低可信度或触发风险的表达

账号简介：
${bio || '暂无'}

产品目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

请基于账号简介推断，但不要编造具体履历、收益、身份头衔或不可验证案例。输出要可直接填入设置页。
写法要像给 X 账号操盘用的作战记忆，不要像简历总结或咨询报告。

不要包含任何多余文字，严格以如下 JSON 对象格式返回：
{
  "targetUsers": "...",
  "characteristics": "...",
  "goals": "...",
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  }
}`;
    
    chrome.storage.local.set({ isAnalyzingPersona: true });
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      const persona = {
        targetUsers: parsed.targetUsers || '',
        characteristics: parsed.characteristics || '',
        goals: parsed.goals || ''
      };
      const agentMemory = mergeAgentMemory(config.agentMemory, parsed.memory || parsed.agentMemory || {});
      
      chrome.storage.local.set({ aiPersona: persona, agentMemory, isAnalyzingPersona: false }, () => {
         addLog('success', '账号画像分析完成');
         analyzeCompetitors(persona, agentMemory);
      });
    } catch (e) {
      addLog('error', `账号画像分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
    }
  });
}

async function analyzeOnboardingSource(sourceInput) {
  const source = (sourceInput || '').trim();
  if (!source) throw new Error('缺少产品网站或 X 账号');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel'], async (config) => {
      const errors = getAIConnectionErrors(config);
      if (errors.length > 0) {
        reject(new Error(errors.join('；')));
        return;
      }

      const playbookCatalog = formatAllGrowthPlaybooks();
      const prompt = `你是一个真正懂 X/Twitter 推荐机制和中文/英文科技圈传播的账号增长操盘手，不是普通市场顾问。
你的工作方式：
- 先判断账号能靠什么被转发、被评论、被收藏、被关注。
- 所有建议都要服务于 X 上的流量结构：Hook 强度、身份标签、争议/反常识、收藏价值、评论诱因、转化路径。
- 输出必须像给一个创始人或 KOL 的实战作战台，而不是咨询报告。

请根据用户输入的产品网站、X 主页、竞品网站或希望模仿的账号，设计一套“X 发声 Agent 启动向导”的初始策略。

用户输入：
${source}

目标用户是：想在 X 上建立影响力的创始人、独立开发者、出海从业者、AI 工具人、投资/研究人员；以及有想法但输出不稳定、会刷 X 但不会把输入转化为观点和内容、强烈想做 KOL 的人。

可选策略模板如下。你必须根据输入选择最匹配的 strategyArchetype，并把对应方法论写进后续策略，不要所有账号都用同一个口吻：
${playbookCatalog}

请遵守：
- 如果无法真实访问链接，不要编造具体数据、融资、客户、收益、产品功能。
- 可以基于 URL、handle、行业关键词进行保守推断。
- 输出要用于前端多选卡片确认，同时必须体现“流量操盘手”的判断。
- 不做收益承诺，不建议擦边、政治动员或刷屏。
- 不要写公众号腔、品牌公关腔、咨询报告腔。要像 X 原生表达：短、具体、有判断、有传播点。
- 生成推文时必须考虑移动端阅读：Hook 单独一行，长句每 28-36 个中文字符主动换行，逻辑块之间可以留空行。

你必须内部完成以下判断：
1. 这个账号最可能的增长飞轮是什么：观点传播、实操收藏、故事共鸣、评论截流、产品转化中的哪几个。
2. 目标用户为什么会关注：情绪价值、工具价值、行业内幕、身份认同、可复制方法中的哪几个。
3. 第一周内容矩阵：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容。
4. 评论引流资产：判断用户是否更适合导向产品/工具、高质量帖子/资料，还是暂不设置引流资产。
5. 爆款热帖风格：必须生成 3 个候选首帖，并按 6 项 1-10 分打分。

评分维度：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

只能返回 JSON 对象，格式如下：
{
  "sourceInput": "${source.replace(/"/g, '\\"')}",
  "strategyArchetype": "ai_product_kol|monetization_global|indie_builder|research_growth|brand_official",
  "accountUse": "brand|evangelist|curator|kol",
  "audience": ["founders", "indie"],
  "audienceCustom": "",
  "content": ["insights", "playbooks"],
  "contentCustom": "",
  "contentMode": "balanced|growth|trust",
  "leadAssetType": "product|post|none",
  "leadAssetValue": "产品/工具链接、置顶帖/资料链接或空字符串",
  "postStyle": "concise|story|contrarian",
  "preferredLanguage": "en|ja|ko|zh-CN|zh-TW",
  "targetTimezone": "Asia/Shanghai|America/Los_Angeles|America/New_York|Europe/London|Asia/Tokyo|Asia/Seoul",
  "growthGoal": "首月新增 1000 粉丝",
  "automationMode": "review",
  "firstTweetText": "从 firstTweetCandidates 中选择总分最高的一条",
  "firstTweetCandidates": [
    {
      "text": "候选首帖 1，必须包含移动端友好的手动换行",
      "style": "concise|story|contrarian",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      },
      "rationale": "为什么这条更可能在 X 上被关注"
    }
  ],
  "leadTarget": "低压、可信、不硬广的行动入口；如果 leadAssetType 是 none，就强调关注沉淀，不强行引流。",
  "persona": {
    "targetUsers": "...",
    "characteristics": "...",
    "goals": "..."
  },
  "memory": {
    "identity": "...",
    "marketPosition": "...",
    "audienceSegments": "...",
    "audiencePains": "...",
    "contentPillars": "...",
    "contentAngles": "...",
    "proofAssets": "...",
    "personalStories": "...",
    "coreOpinions": "...",
    "boundaries": "...",
    "voiceRules": "...",
    "bannedClaims": "...",
    "interactionTargets": "...",
    "replyStrategy": "...",
    "sourceInputs": "...",
    "weeklyReviewSignals": "..."
  },
  "competitorReport": "Markdown，必须包含：流量假设、第一周内容矩阵、低粉爆款钩子、互动截流策略、风险边界。"
}`;

      try {
        addLog('info', '开始启动向导来源分析');
        const generatedText = await callLLM(prompt, config, true);
        const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJsonStr);
        const analysis = normalizeOnboardingAnalysis(parsed, source);
        chrome.storage.local.set({ onboardingSourceAnalysis: analysis }, () => {
          addLog('success', '启动向导来源分析完成');
          resolve(analysis);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeOnboardingAnalysis(parsed = {}, sourceInput = '') {
  const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  const pickList = (values, allowed, fallback) => {
    const list = Array.isArray(values) ? values.filter(value => allowed.includes(value)) : [];
    return list.length > 0 ? list : fallback;
  };
  const fallbackPlaybook = selectGrowthPlaybook({
    onboardingStrategy: parsed,
    persona: parsed.persona,
    agentMemory: parsed.memory || parsed.agentMemory,
    sourceInput
  });

  return {
    sourceInput: parsed.sourceInput || sourceInput,
    strategyArchetype: pick(parsed.strategyArchetype, Object.keys(GROWTH_PLAYBOOKS), fallbackPlaybook.id),
    accountUse: pick(parsed.accountUse, ['brand', 'evangelist', 'curator', 'kol'], 'evangelist'),
    audience: pickList(parsed.audience, ['founders', 'indie', 'global', 'aiBuilders', 'researchers'], ['founders', 'indie']),
    audienceCustom: memoryValueToText(parsed.audienceCustom),
    content: pickList(parsed.content, ['insights', 'playbooks', 'stories', 'curation', 'softPromo'], ['insights', 'playbooks']),
    contentCustom: memoryValueToText(parsed.contentCustom),
    contentMode: pick(parsed.contentMode, ['balanced', 'growth', 'trust'], 'balanced'),
    leadAssetType: pick(parsed.leadAssetType, ['product', 'post', 'none'], 'none'),
    leadAssetValue: memoryValueToText(parsed.leadAssetValue),
    postStyle: pick(parsed.postStyle, ['concise', 'story', 'contrarian'], 'concise'),
    preferredLanguage: pick(parsed.preferredLanguage, ['en', 'ja', 'ko', 'zh-CN', 'zh-TW'], 'zh-CN'),
    targetTimezone: pick(parsed.targetTimezone, ['Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Seoul'], 'Asia/Shanghai'),
    growthGoal: memoryValueToText(parsed.growthGoal) || '首月新增 1000 粉丝',
    automationMode: pick(parsed.automationMode, ['auto', 'review', 'shadowReply'], 'review'),
    firstTweetText: bestViralCandidate(parsed.firstTweetCandidates, memoryValueToText(parsed.firstTweetText)),
    firstTweetCandidates: Array.isArray(parsed.firstTweetCandidates) ? parsed.firstTweetCandidates : [],
    leadTarget: memoryValueToText(parsed.leadTarget),
    persona: {
      targetUsers: memoryValueToText(parsed.persona?.targetUsers),
      characteristics: memoryValueToText(parsed.persona?.characteristics),
      goals: memoryValueToText(parsed.persona?.goals)
    },
    memory: mergeAgentMemory(DEFAULT_AGENT_MEMORY, parsed.memory || parsed.agentMemory || {}),
    competitorReport: memoryValueToText(parsed.competitorReport)
  };
}

async function analyzeCompetitors(persona, agentMemoryOverride) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'agentMemory', 'onboardingStrategy', 'accountBio'], async (config) => {
    const errors = getAIConnectionErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析竞品：${errors.join('、')}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
      return;
    }
    addLog('info', '开始竞品对标与爆款策略分析...');
    const playbook = selectGrowthPlaybook({
      onboardingStrategy: config.onboardingStrategy,
      persona,
      agentMemory: agentMemoryOverride || config.agentMemory,
      accountBio: config.accountBio,
      leadTarget: config.leadTarget
    });
    
    const prompt = `你是 X 增长操盘手，正在为一个低粉账号设计“可执行的爆款拆解与截流计划”。

账号定位：
- 目标用户：${persona.targetUsers}
- 发文特征：${persona.characteristics}
- 核心目标：${persona.goals}
- 长期记忆：
${formatAgentMemory(agentMemoryOverride || config.agentMemory)}

${formatGrowthPlaybook(playbook)}

报告必须像操盘文档，不要像市场报告。必须包含：
1. 【流量假设】：这个账号靠什么被转发、收藏、评论、关注，各写 1 条。
2. 【对标账号类型】：列出 10 个应观察的账号类型或具体账号方向，说明他们的钩子来源、互动方式和可借鉴点。
3. 【低粉爆款框架】：给 5 个框架，每个包含 Hook 模板、正文结构、评论诱因、适合内容类型。
4. 【第一周执行矩阵】：涨粉内容、建信任内容、转化内容、互动钩子内容、人设加深内容，每类给 2 个选题。
5. 【评论截流策略】：在哪些大 V/赛道话题下面评论、评论结构怎么写、什么情况下不要评论。
6. 【风险边界】：不要承诺收益、不要编造案例、不要刷屏、不要碰擦边/政治动员。

请直接返回纯 Markdown 格式的报告内容，不要包裹在JSON里，也不要加额外的问候语。`;

    chrome.storage.local.set({ isAnalyzingCompetitors: true });
    try {
      const report = await callLLM(prompt, config, false);
      
      chrome.storage.local.set({ competitorReport: report, isAnalyzingCompetitors: false }, () => {
         addLog('success', '竞品分析报告生成完成');
         chrome.storage.local.get(['setupAutoStartRequested'], (res) => {
            if (res.setupAutoStartRequested) {
               maybeStartAgentAfterSetup(() => {});
            }
         });
         generateAutoDrafts();
      });
    } catch (e) {
      addLog('error', `竞品分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
    }
  });
}

async function generateAutoDrafts() {
  chrome.storage.local.get([
    'apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'isRunning', 'tweetQueue',
    'isGenerating', 'aiPersona', 'agentMemory', 'accountBio', 'competitorReport',
    'onboardingStrategy', 'postDeliveryMode', 'postsPerDay', 'postScheduleMode',
    'smartTimeSlots', 'postInterval'
  ], async (config) => {
    const errors = getConfigErrors(config);
    const isPersonaEmpty = !config.aiPersona || (!config.aiPersona.targetUsers && !config.aiPersona.characteristics && !config.aiPersona.goals);
    if (!config.isRunning || errors.length > 0 || config.isGenerating || isPersonaEmpty) {
      if (errors.length > 0) {
        addLog('warn', `配置不完整，无法生成内容队列：${errors.join('、')}`);
      }
      return;
    }
    const rawQueue = Array.isArray(config.tweetQueue) ? config.tweetQueue : [];
    let queue = normalizeDraftQueue(rawQueue);
    if (queue.length !== rawQueue.length) {
      chrome.storage.local.set({ tweetQueue: queue });
    }
    if (queue.length >= DRAFT_TARGET_COUNT) return;
    const draftNeeded = Math.max(0, DRAFT_TARGET_COUNT - queue.length);

    addLog('info', `开始补齐 Agent 内容队列，当前 ${queue.length}/${DRAFT_TARGET_COUNT}...`);
    chrome.storage.local.set({ isGenerating: true });
    chrome.runtime.sendMessage({ action: "generationStatus", status: true }).catch(() => {});
    
    const persona = config.aiPersona;
    const memoryContext = formatAgentMemory(config.agentMemory);
    const playbook = selectGrowthPlaybook({
      onboardingStrategy: config.onboardingStrategy,
      persona,
      agentMemory: config.agentMemory,
      accountBio: config.accountBio,
      leadTarget: config.leadTarget
    });
    const playbookContext = formatGrowthPlaybook(playbook);
    const reportContext = config.competitorReport ? `\n可用的流量操盘报告如下，必须严格吸收其中的钩子、矩阵和风险边界：\n${config.competitorReport}\n` : "";
    
    const prompt = `你是这个账号的 X 内容操盘手，目标不是“写得完整”，而是写出更像 X 原生内容、能被停留/转发/评论/关注的候选推文。

账号简介：
${config.accountBio || '暂无'}

账号画像定位：
- 目标用户：${persona.targetUsers}
- 发文特征与语气：${persona.characteristics}
- 核心发文目标：${persona.goals}

长期记忆，必须优先遵守：
${memoryContext}
${playbookContext}
${formatLeadAsset(config.onboardingStrategy)}
${reportContext}

请生成 ${Math.max(draftNeeded + 4, draftNeeded)} 条候选推文，然后只返回你自评后最强的 ${draftNeeded} 条。尽量覆盖以下内容类型：
- opinion：强观点/反常识/行业判断，用于涨粉和转发
- playbook：框架/清单/工具/步骤，用于收藏和信任
- story：经历/复盘/Build in Public，用于人设和共鸣
- reply_bait：能引发评论或站队的问题/判断
- soft_conversion：低压产品/服务/行动入口，不硬广

每条推文必须像 X 原生表达：
- 开头第一行必须有 Hook，不要铺垫。
- 一条推文只讲一个判断。
- 少形容词，多具体场景、数字、对比、动作。
- 必须主动换行，适合手机阅读：Hook 单独一行；长句每 28-36 个中文字符切分；清单每项单独一行；逻辑块之间用一个空行。
- 不要把 3 个以上的判断塞进同一段，也不要写成公众号长段落。
- 不要承诺收益，不要编造客户/融资/数据，不要使用擦边或政治动员。

给每条内容按 1-10 分自评：
- hook: 开头是否能让人停住
- shareability: 是否有转发理由
- replyTrigger: 是否能引发评论
- identity: 是否强化账号身份标签
- audienceFit: 是否精准击中目标用户
- nativeX: 是否像 X 原生表达

严格只返回 JSON 对象，不要额外解释：
{
  "tweets": [
    {
      "type": "opinion|playbook|story|reply_bait|soft_conversion",
      "text": "推文正文",
      "scores": {
        "hook": 8,
        "shareability": 8,
        "replyTrigger": 7,
        "identity": 8,
        "audienceFit": 9,
        "nativeX": 9
      }
    }
  ]
}`;
    
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedTweets = JSON.parse(cleanJsonStr);
      const newTweets = normalizeGeneratedTweets(parsedTweets).slice(0, draftNeeded);
      
      if (newTweets.length > 0) {
        newTweets.forEach(t => {
           queue.push({
             id: Date.now() + Math.random(),
             text: t.text,
             type: t.type,
             viralScore: t.score,
             scores: t.scores,
             scheduledAt: null,
             nativeScheduleStatus: ''
           });
        });
        queue = queue.slice(0, DRAFT_TARGET_COUNT);
        if (getPostDeliveryMode(config) === POST_DELIVERY_MODE_X_SCHEDULE) {
          queue = ensureNativeScheduleTimes(queue, config);
        }
        chrome.storage.local.set({ tweetQueue: queue, isGenerating: false }, () => {
           addLog('success', `成功生成 ${newTweets.length} 条内容，当前 Agent 队列 ${queue.length}/${DRAFT_TARGET_COUNT}`);
           chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
           chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
           checkAndSetupAlarm(); // re-evaluate alarm
        });
      } else {
        chrome.storage.local.set({ isGenerating: false }, () => {
          addLog('warn', 'AI 未返回可用内容，已停止本轮生成');
          chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
        });
      }
    } catch (e) {
      addLog('error', `内容队列生成失败: ${e.message}`);
      chrome.storage.local.set({ isGenerating: false });
      chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.accountBio && changes.accountBio.newValue) {
       addLog('info', '检测到主页简介更新，触发画像分析');
       analyzeAccountPersona(changes.accountBio.newValue);
    }
    if (changes.isRunning && changes.isRunning.newValue) {
       chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'accountBio', 'aiPersona', 'tweetQueue'], (res) => {
          const errors = getConfigErrors(res);
          if (errors.length > 0) {
             addLog('error', `启动失败：${errors.join('、')}，请先到配置中心完善设置`);
             chrome.storage.local.set({ isRunning: false, configErrors: errors });
             return;
          }
          chrome.storage.local.remove(['configErrors']);
          addLog('info', '机器人已启动');
          chrome.storage.local.set({
             twitterCooldownUntil: 0,
             apiCooldownUntil: 0,
             isGeneratingReply: false,
             isTyping: false,
             isAutoPaused: false,
             pauseReason: '',
             tweetQueue: normalizeDraftQueue(res.tweetQueue)
          });
          const isPersonaEmpty = !res.aiPersona || (!res.aiPersona.targetUsers && !res.aiPersona.characteristics && !res.aiPersona.goals);
          if (res.accountBio && isPersonaEmpty) {
             analyzeAccountPersona(res.accountBio);
          } else if (!isPersonaEmpty) {
             generateAutoDrafts();
          }
          checkAndSetupAlarm();
       });
    } else if (changes.isRunning && !changes.isRunning.newValue) {
       addLog('info', '机器人已停止');
       chrome.alarms.clear("postTweetAlarm");
       chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
    }
    if (changes.isAutoPaused && changes.isAutoPaused.oldValue && !changes.isAutoPaused.newValue) {
       chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], (res) => {
          if (res.pendingPost && (res.isRunning || res.pendingPostSource === 'manualTest')) {
             addLog('info', '检测到自动操作恢复，继续处理待发送推文');
             triggerPostInTab();
          } else {
             checkAndSetupAlarm();
          }
       });
    }
    if (changes.tweetQueue) {
       chrome.storage.local.get(['aiPersona'], (res) => {
          const queue = normalizeDraftQueue(changes.tweetQueue.newValue);
          if (queue.length !== (Array.isArray(changes.tweetQueue.newValue) ? changes.tweetQueue.newValue.length : 0)) {
             chrome.storage.local.set({ tweetQueue: queue });
             return;
          }
          if (res.aiPersona && changes.tweetQueue.newValue && queue.length < DRAFT_REFILL_THRESHOLD) {
             generateAutoDrafts();
          }
       });
    }
    if (changes.aiPersona && changes.aiPersona.newValue) {
       const p = changes.aiPersona.newValue;
       const isPersonaEmpty = !p || (!p.targetUsers && !p.characteristics && !p.goals);
       if (isPersonaEmpty) {
          chrome.storage.local.get(['accountBio'], (res) => {
             if (res.accountBio) analyzeAccountPersona(res.accountBio);
          });
       } else {
          chrome.storage.local.get(['tweetQueue'], (res) => {
             const q = normalizeDraftQueue(res.tweetQueue);
             if (q.length < DRAFT_REFILL_THRESHOLD) generateAutoDrafts();
          });
       }
    }
  }
});
