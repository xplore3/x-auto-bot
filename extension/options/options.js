document.addEventListener('DOMContentLoaded', initOptions);

const DEFAULT_TEST_POST = `AI副业别先找工具。

先找需求：
谁在海外平台付费？
他们反复买什么？
你能不能用AI把交付成本压低？

工具不值钱，能交付结果才值钱。`;

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
  discoveryKeywords: '',
  replyStrategy: '',
  sourceInputs: '',
  weeklyReviewSignals: ''
};

const DEFAULT_ONBOARDING_STRATEGY = {
  sourceInput: '',
  strategyArchetype: 'indie_builder',
  accountUse: 'brand',
  audience: ['founders', 'indie'],
  audienceCustom: '',
  content: ['insights', 'playbooks'],
  contentCustom: '',
  contentMode: 'balanced',
  leadAssetType: 'none',
  leadAssetValue: '',
  postStyle: 'concise',
  preferredLanguage: 'zh-CN',
  targetTimezone: 'Asia/Shanghai',
  growthGoal: '首月新增 1000 粉丝',
  automationMode: 'review',
  firstTweetText: ''
};

const POST_DELIVERY_MODE_LABELS = {
  localQueue: '本地到点自动发',
  xNativeSchedule: '写入 X 原生定时发布'
};

const AGENT_MEMORY_FIELD_IDS = {
  identity: 'memoryIdentity',
  marketPosition: 'marketPosition',
  audienceSegments: 'audienceSegments',
  audiencePains: 'audiencePains',
  contentPillars: 'contentPillars',
  contentAngles: 'contentAngles',
  proofAssets: 'proofAssets',
  personalStories: 'personalStories',
  coreOpinions: 'coreOpinions',
  boundaries: 'boundaries',
  voiceRules: 'voiceRules',
  bannedClaims: 'bannedClaims',
  interactionTargets: 'interactionTargets',
  discoveryKeywords: 'discoveryKeywords',
  replyStrategy: 'replyStrategy',
  sourceInputs: 'sourceInputs',
  weeklyReviewSignals: 'weeklyReviewSignals'
};

const PROVIDER_DEFAULTS = {
  gemini: { model: 'gemini-2.5-flash', showModel: false },
  openrouter: { model: 'google/gemini-2.5-flash', showModel: true },
  qwen: { model: 'qwen-turbo', showModel: true },
  deepseek: { model: 'deepseek-v4-flash', showModel: true }
};

const PROVIDER_HELP = {
  gemini: 'Gemini 使用原生 API，无需填写模型名称。',
  openrouter: '请在 OpenRouter 官网查找你想使用的模型 ID，如 <code>anthropic/claude-3-haiku</code>、<code>openai/gpt-4o-mini</code> 或 <code>google/gemini-2.5-flash</code>。',
  qwen: '千问常用模型：<code>qwen-turbo</code>、<code>qwen-plus</code>、<code>qwen-max</code>。',
  deepseek: 'DeepSeek 最新模型：<code>deepseek-v4-flash</code>（轻量高速）、<code>deepseek-v4-pro</code>（最强能力）。'
};

const ACCOUNT_USE_LABELS = {
  brand: '官方品牌账号',
  evangelist: '首席推销官',
  curator: '赛道观察家',
  kol: '赛道 KOL'
};

const AUDIENCE_LABELS = {
  founders: '创始人 / CEO',
  indie: '独立开发者',
  global: '出海从业者',
  aiBuilders: 'AI 工具人',
  researchers: '投资 / 研究人员'
};

const CONTENT_LABELS = {
  insights: '行业观点',
  playbooks: '实操干货',
  stories: '幕后故事',
  curation: '信息转译',
  softPromo: '产品软推广'
};

const LEAD_ASSET_LABELS = {
  product: '产品 / 工具',
  post: '高质量帖子 / 资料',
  none: '暂不设置引流资产'
};

const STYLE_LABELS = {
  concise: '极简利落流',
  story: '故事悬念流',
  contrarian: '观点对抗流'
};

const STRATEGY_ARCHETYPE_LABELS = {
  ai_product_kol: 'AI / 产品型 KOL',
  monetization_global: '出海 / 搞钱 / 个人商业化',
  indie_builder: '独立开发者 / Build in Public',
  research_growth: '产品增长 / 投资研究型账号',
  brand_official: '产品官方品牌号'
};

const DEFAULT_INTERACTION_TARGETS = {
  ai_product_kol: ['zarazhangrui', 'Leobai825', 'swyx', 'aakashg0', 'lennysan', 'kfk_ai', 'karpathy', 'sama'],
  monetization_global: ['Leobai825', 'levelsio', 'dvassallo', 'codie_sanchez', 'naval', 'gregisenberg'],
  indie_builder: ['levelsio', 'marckohlbrugge', 'patio11', 'robj3d3', 'dvassallo', 'gregisenberg'],
  research_growth: ['aakashg0', 'lennysan', 'shreyas', 'packyM', 'benthompson', 'stratechery'],
  brand_official: ['lennysan', 'shreyas', 'swyx', 'aakashg0', 'gregisenberg', 'patio11', 'levelsio']
};

const DEFAULT_DISCOVERY_KEYWORDS = {
  ai_product_kol: ['AI工具', 'AI Agent', '提示词', 'AI自动化', 'Cursor', 'Claude', 'ChatGPT'],
  monetization_global: ['AI副业', '出海', '独立开发', '海外获客', '产品增长', '小产品变现'],
  indie_builder: ['独立开发', 'Build in Public', 'SaaS', 'MVP', 'Product Hunt', 'Cursor 做产品'],
  research_growth: ['AI 投资', '产品增长', '市场趋势', '增长框架', '商业模式', '创始人洞察'],
  brand_official: ['AI产品', '产品发布', '用户案例', '产品更新', '工作流自动化', '效率工具']
};

const LANGUAGE_LABELS = {
  en: '英语',
  ja: '日语',
  ko: '韩语',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文'
};

const LANGUAGE_TIMEZONE_DEFAULTS = {
  en: 'America/Los_Angeles',
  ja: 'Asia/Tokyo',
  ko: 'Asia/Seoul',
  'zh-CN': 'Asia/Shanghai',
  'zh-TW': 'Asia/Shanghai'
};

const LOG_LEVEL_LABELS = {
  info: '信息',
  success: '成功',
  warn: '警告',
  error: '错误'
};

const LOG_SOURCE_LABELS = {
  scraper: '内容抓取',
  automator: '自动操作',
  background: '后台服务'
};

function hasChromeStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

const TIMEZONE_SCHEDULES = {
  'Asia/Shanghai': '9-11,12-14,20-23',
  'America/Los_Angeles': '7-9,12-14,18-22',
  'America/New_York': '8-10,12-14,19-22',
  'Europe/London': '8-10,12-14,18-21',
  'Asia/Tokyo': '8-10,12-14,19-22',
  'Asia/Seoul': '8-10,12-14,19-22'
};

const CONTENT_MODE_PLANS = {
  balanced: {
    postsPerDay: 5,
    label: '每天 5 条',
    mix: '40% 共鸣传播 / 40% 专业深度 / 20% 产品软推广'
  },
  growth: {
    postsPerDay: 7,
    label: '每天 7 条',
    mix: '55% 传播钩子 / 30% 干货 / 15% 转化'
  },
  trust: {
    postsPerDay: 3,
    label: '每天 3 条',
    mix: '25% 共鸣 / 55% 深度 / 20% 案例转化'
  }
};

const ANALYSIS_MESSAGES = [
  '正在解析产品卖点...',
  '正在识别目标用户...',
  '正在推演内容支柱...',
  '正在生成爆款风格样本...',
  '正在组装长期记忆...'
];

const MODULE_META = {
  'agent-chat': {
    eyebrow: 'Agent Console',
    title: '和你的 X 发声 Agent 一起调内容',
    description: '把看到的好帖子、突然冒出的想法、复盘结论或新的偏好丢给 Agent。它不是通用聊天，而是专门把输入沉淀成 X 账号长期记忆、内容方向和下一步发声动作。'
  },
  onboarding: {
    eyebrow: 'Launch Wizard',
    title: '用一个链接生成账号定位',
    description: '输入产品、X 主页、竞品网站或想模仿的账号，然后用多选卡片确认方向。Agent 会把选择写入长期记忆和内容策略。'
  },
  blueprint: {
    eyebrow: 'Growth Blueprint',
    title: '制定可执行的涨粉计划',
    description: '确认每日内容数量、发布时间、自动化模式和第一条测试推文。先建立稳定节奏，再逐步扩大互动。'
  },
  runtime: {
    eyebrow: 'Runtime',
    title: '配置模型和发布节奏',
    description: '这里处理 Agent 的底层连接和发帖参数。普通用户只需要填 API Key，其他选项保持默认即可。'
  },
  'advanced-memory': {
    eyebrow: 'Knowledge Base',
    title: '维护 Agent 的长期记忆',
    description: '这里决定 Agent 是谁、服务谁、讲什么、怎么讲，以及哪些话不能说。大多数内容可以由对话台和启动向导自动写入。'
  },
  diagnostics: {
    eyebrow: 'Test & Review',
    title: '测试发布链路并复盘效果',
    description: '先验证中文发帖、登录态、成果记录和失败保护，再把有效内容信号沉淀回知识库。'
  },
  logs: {
    eyebrow: 'Result Ledger',
    title: '查看 Agent 成果记录',
    description: '这里只展示已发布、已回复、已跳过和失败暂停等结果，隐藏内部调度噪音。'
  }
};

const MODULE_ALIASES = {
  'strategy-wizard': 'onboarding'
};

let analysisTimer = null;
let analysisStartedAt = 0;
let sourceAnalysisRunning = false;
let sourceAnalysisLocked = false;
let optionsRestored = false;
let autoSaveTimer = null;
let retainedStrategyArchetype = DEFAULT_ONBOARDING_STRATEGY.strategyArchetype;
let activeModule = 'agent-chat';

function initOptions() {
  bind('saveBtn', 'click', saveOptions);
  bind('saveBtnMirror', 'click', saveOptions);
  bind('apiProvider', 'change', toggleModelInput);
  bind('postScheduleMode', 'change', toggleScheduleMode);
  bind('postDeliveryMode', 'change', updatePlanPreview);
  bind('testPostBtn', 'click', testPostNow);
  bind('analyzeSourceBtn', 'click', analyzeSourceNow);
  bind('buildPlanBtn', 'click', buildGrowthPlan);
  bind('applyPlanBtn', 'click', applyPlanToAgent);
  bind('firstActionPostBtn', 'click', postFirstActionTweet);
  bind('targetTimezone', 'change', updatePlanPreview);
  bind('growthGoal', 'input', updatePlanPreview);
  bind('refreshLogsBtn', 'click', loadInlineLogs);
  bind('agentChatForm', 'submit', sendAgentChat);
  initChoiceCards();
  initChatPromptChips();
  initModuleNavigation();
  initAutoSave();
  loadInlineLogs();
  restoreOptions();
}

function bind(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function initChoiceCards() {
  document.querySelectorAll('[data-choice-group]').forEach((button) => {
    button.addEventListener('click', () => {
      selectChoice(button.dataset.choiceGroup, button.dataset.value);
      if (button.dataset.choiceGroup === 'preferredLanguage') {
        const timezone = LANGUAGE_TIMEZONE_DEFAULTS[button.dataset.value];
        if (timezone) document.getElementById('targetTimezone').value = timezone;
      }
      updatePlanPreview();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-choice-multi]').forEach((button) => {
    button.addEventListener('click', () => {
      setButtonSelected(button, !button.classList.contains('is-selected'));
      updatePlanPreview();
      scheduleAutoSave();
    });
  });
}

function initAutoSave() {
  document.addEventListener('input', (event) => {
    if (event.target.matches('input, textarea')) {
      scheduleAutoSave();
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('select, input, textarea')) {
      scheduleAutoSave();
    }
  });
}

function initChatPromptChips() {
  document.querySelectorAll('.prompt-chip[data-chat-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('agentChatInput');
      if (!input) return;
      const prefix = button.dataset.chatPrompt || '';
      input.value = input.value.trim() ? `${prefix}\n${input.value.trim()}` : prefix;
      input.focus();
    });
  });
}

function normalizeModuleId(moduleId) {
  const cleanId = String(moduleId || '').replace(/^#/, '');
  return MODULE_ALIASES[cleanId] || (MODULE_META[cleanId] ? cleanId : 'agent-chat');
}

function initModuleNavigation() {
  document.querySelectorAll('[data-module-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showModule(link.dataset.moduleLink, { updateHash: true, scrollTop: true });
    });
  });

  document.querySelectorAll('[data-open-module]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      showModule(button.dataset.openModule, { updateHash: true, scrollTop: true });
    });
  });

  window.addEventListener('hashchange', () => {
    showModule(window.location.hash, { updateHash: false, scrollTop: true });
  });

  showModule(window.location.hash || activeModule, { updateHash: false, scrollTop: false });
}

function showModule(moduleId, options = {}) {
  const nextModule = normalizeModuleId(moduleId);
  activeModule = nextModule;

  document.querySelectorAll('.module-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.module === nextModule);
  });

  document.querySelectorAll('[data-module-link]').forEach((link) => {
    const isCurrent = normalizeModuleId(link.dataset.moduleLink) === nextModule;
    link.classList.toggle('is-current', isCurrent);
    if (isCurrent) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  const meta = MODULE_META[nextModule] || MODULE_META['agent-chat'];
  setTextIn('.page-header .eyebrow', meta.eyebrow);
  setTextIn('.page-header h1', meta.title);
  setTextIn('.page-header p:last-child', meta.description);

  if (options.updateHash) {
    history.pushState(null, '', `#${nextModule}`);
  }
  if (options.scrollTop) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
}

function scheduleAutoSave() {
  if (!optionsRestored) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveOptions({ silent: true, skipAutoStart: true, autoSave: true }, () => {
      showAutoSaveStatus();
    });
  }, 900);
}

function showAutoSaveStatus() {
  const status = document.getElementById('statusMessage');
  if (!status) return;
  status.textContent = '已自动保存';
  status.style.color = '#65717e';
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
    status.style.color = '';
  }, 1400);
}

function setButtonSelected(button, selected) {
  button.classList.toggle('is-selected', selected);
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
}

function selectChoice(group, value) {
  document.querySelectorAll(`[data-choice-group="${group}"]`).forEach((button) => {
    setButtonSelected(button, button.dataset.value === value);
  });
}

function setMultiChoices(group, values = []) {
  const valueSet = new Set(values);
  document.querySelectorAll(`[data-choice-multi="${group}"]`).forEach((button) => {
    setButtonSelected(button, valueSet.has(button.dataset.value));
  });
}

function getChoiceValue(group, fallback = '') {
  return document.querySelector(`[data-choice-group="${group}"].is-selected`)?.dataset.value || fallback;
}

function getMultiChoiceValues(group) {
  return Array.from(document.querySelectorAll(`[data-choice-multi="${group}"].is-selected`))
    .map(button => button.dataset.value);
}

function toggleModelInput() {
  const provider = document.getElementById('apiProvider').value;
  const modelGroup = document.getElementById('modelGroup');
  const modelInput = document.getElementById('aiModel');
  const helpText = document.getElementById('modelHelpText');
  const config = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;
  
  modelGroup.style.display = config.showModel ? 'block' : 'none';
  
  const currentVal = modelInput.value.trim();
  const allDefaults = Object.values(PROVIDER_DEFAULTS).map(p => p.model);
  if (!currentVal || allDefaults.includes(currentVal)) {
    modelInput.value = config.model;
  }
  
  if (helpText) {
    helpText.innerHTML = PROVIDER_HELP[provider] || PROVIDER_HELP.gemini;
  }
}

function toggleScheduleMode() {
  const mode = document.getElementById('postScheduleMode').value;
  document.getElementById('smartSlotsGroup').style.display = mode === 'smart' ? 'block' : 'none';
  document.getElementById('intervalGroup').style.display = mode === 'interval' ? 'block' : 'none';
}

function showStatus(message, color = '#17bf63', timeout = 3000) {
  const status = document.getElementById('statusMessage');
  status.textContent = message;
  status.style.color = color;
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
    status.style.color = '';
  }, timeout);
}

function getOnboardingStrategyFromForm() {
  return {
    sourceInput: document.getElementById('sourceInput')?.value.trim() || '',
    strategyArchetype: retainedStrategyArchetype || DEFAULT_ONBOARDING_STRATEGY.strategyArchetype,
    accountUse: getChoiceValue('accountUse', DEFAULT_ONBOARDING_STRATEGY.accountUse),
    audience: getMultiChoiceValues('audience'),
    audienceCustom: document.getElementById('audienceCustom')?.value.trim() || '',
    content: getMultiChoiceValues('content'),
    contentCustom: document.getElementById('contentCustom')?.value.trim() || '',
    contentMode: getChoiceValue('contentMode', DEFAULT_ONBOARDING_STRATEGY.contentMode),
    leadAssetType: getChoiceValue('leadAssetType', DEFAULT_ONBOARDING_STRATEGY.leadAssetType),
    leadAssetValue: document.getElementById('leadAssetValue')?.value.trim() || '',
    postStyle: getChoiceValue('postStyle', DEFAULT_ONBOARDING_STRATEGY.postStyle),
    preferredLanguage: getChoiceValue('preferredLanguage', DEFAULT_ONBOARDING_STRATEGY.preferredLanguage),
    targetTimezone: document.getElementById('targetTimezone')?.value || DEFAULT_ONBOARDING_STRATEGY.targetTimezone,
    growthGoal: document.getElementById('growthGoal')?.value.trim() || DEFAULT_ONBOARDING_STRATEGY.growthGoal,
    automationMode: getChoiceValue('automationMode', DEFAULT_ONBOARDING_STRATEGY.automationMode),
    firstTweetText: document.getElementById('firstTweetPreview')?.value.trim() || ''
  };
}

function applyOnboardingStrategy(strategy = {}) {
  const merged = { ...DEFAULT_ONBOARDING_STRATEGY, ...(strategy || {}) };
  retainedStrategyArchetype = merged.strategyArchetype || DEFAULT_ONBOARDING_STRATEGY.strategyArchetype;
  document.getElementById('sourceInput').value = merged.sourceInput || '';
  document.getElementById('audienceCustom').value = merged.audienceCustom || '';
  document.getElementById('contentCustom').value = merged.contentCustom || '';
  document.getElementById('leadAssetValue').value = merged.leadAssetValue || '';
  document.getElementById('targetTimezone').value = merged.targetTimezone || DEFAULT_ONBOARDING_STRATEGY.targetTimezone;
  document.getElementById('growthGoal').value = merged.growthGoal || DEFAULT_ONBOARDING_STRATEGY.growthGoal;
  document.getElementById('firstTweetPreview').value = merged.firstTweetText || '';
  selectChoice('accountUse', merged.accountUse);
  setMultiChoices('audience', merged.audience);
  setMultiChoices('content', merged.content);
  selectChoice('contentMode', merged.contentMode);
  selectChoice('leadAssetType', merged.leadAssetType);
  selectChoice('postStyle', merged.postStyle);
  selectChoice('preferredLanguage', merged.preferredLanguage);
  selectChoice('automationMode', merged.automationMode);
  updatePlanPreview();
}

function labelList(values, labels) {
  return values.map(value => labels[value]).filter(Boolean);
}

function splitCustomInput(text) {
  return text
    .split(/[,，、\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function getAudienceLabels(strategy) {
  return [...labelList(strategy.audience, AUDIENCE_LABELS), ...splitCustomInput(strategy.audienceCustom)];
}

function getContentLabels(strategy) {
  return [...labelList(strategy.content, CONTENT_LABELS), ...splitCustomInput(strategy.contentCustom)];
}

function describeLeadAsset(strategy) {
  const assetValue = (strategy.leadAssetValue || '').trim();
  if (strategy.leadAssetType === 'product') {
    return assetValue
      ? `评论承接资产：产品/工具（${assetValue}）。评论中只在上下文强相关时轻量提及，优先提供观点和帮助，不硬推。`
      : '评论承接资产：产品/工具。尚未填写具体链接或名称，评论时先以建立信任为主，不强行引流。';
  }
  if (strategy.leadAssetType === 'post') {
    return assetValue
      ? `评论承接资产：高质量帖子/资料（${assetValue}）。适合在对方确实需要延伸阅读时自然引导。`
      : '评论承接资产：高质量帖子/资料。尚未填写具体链接或标题，评论时先沉淀关注，不强行引导。';
  }
  return '评论承接资产：暂不设置产品或资料入口。评论目标是获得高质量互动、主页访问和关注沉淀。';
}

function buildLeadTarget(strategy, content, audience) {
  const base = `我会围绕 ${content.join('、') || 'AI、出海和个人商业化'} 持续分享可执行的观点和案例，帮助 ${audience.join('、') || '目标用户'} 更快建立判断和行动。`;
  return `${base}\n${describeLeadAsset(strategy)}`;
}

function createPlan(strategy) {
  const modePlan = CONTENT_MODE_PLANS[strategy.contentMode] || CONTENT_MODE_PLANS.balanced;
  const schedule = TIMEZONE_SCHEDULES[strategy.targetTimezone] || TIMEZONE_SCHEDULES['Asia/Shanghai'];
  return {
    postsPerDay: modePlan.postsPerDay,
    postCountLabel: modePlan.label,
    schedule,
    mix: modePlan.mix,
    growthGoal: strategy.growthGoal || DEFAULT_ONBOARDING_STRATEGY.growthGoal
  };
}

function updatePlanPreview() {
  const strategy = getOnboardingStrategyFromForm();
  const plan = createPlan(strategy);
  const postDeliveryMode = document.getElementById('postDeliveryMode')?.value || 'localQueue';
  setText('planPostCount', plan.postCountLabel);
  setText('planSchedule', plan.schedule);
  setText('planDeliveryMode', POST_DELIVERY_MODE_LABELS[postDeliveryMode] || POST_DELIVERY_MODE_LABELS.localQueue);
  setText('planGrowthGoal', plan.growthGoal);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setTextIn(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function saveOptions(options = {}, afterSave) {
  const silent = options && options.silent;
  const skipAutoStart = options && options.skipAutoStart;
  syncWizardToFields({ overwrite: false });

  const apiKey = document.getElementById('apiKey').value.trim();
  const apiProvider = document.getElementById('apiProvider').value;
  const aiModel = document.getElementById('aiModel').value.trim();
  const targetUsers = document.getElementById('targetUsers').value;
  const promptTemplate = document.getElementById('promptTemplate').value;
  const leadTarget = document.getElementById('leadTarget').value.trim();
  const postsPerDay = parseInt(document.getElementById('postsPerDay').value, 10) || 5;
  const postScheduleMode = document.getElementById('postScheduleMode').value;
  const postDeliveryMode = document.getElementById('postDeliveryMode').value;
  const smartTimeSlots = document.getElementById('smartTimeSlots').value.trim();
  const postInterval = parseInt(document.getElementById('postInterval').value, 10) || 30;
  const aiTargetUsers = document.getElementById('aiTargetUsers').value;
  const aiCharacteristics = document.getElementById('aiCharacteristics').value;
  const aiGoals = document.getElementById('aiGoals').value;
  const competitorReport = document.getElementById('competitorReport').value;
  const testPostText = document.getElementById('testPostText').value.trim();
  const onboardingStrategy = getOnboardingStrategyFromForm();
  const agentMemory = getAgentMemoryFromForm();

  const missing = [];
  if (!apiKey) missing.push('API Key');
  if (!leadTarget) missing.push('引流目标');
  
  if (!silent && missing.length > 0) {
    showStatus(`保存成功，但缺少关键配置：${missing.join('、')}。`, '#f5a623', 5000);
  } else if (!silent) {
    showStatus('Agent 记忆与计划已保存。');
  }

  if (!hasChromeStorage()) {
    if (!silent) showStatus('当前是静态预览环境，正式保存请在 Chrome 扩展中完成。', '#f5a623', 5000);
    if (typeof afterSave === 'function') afterSave();
    return;
  }

  chrome.storage.local.get(['aiPersona'], (result) => {
    const persona = result.aiPersona || {};
    persona.targetUsers = aiTargetUsers;
    persona.characteristics = aiCharacteristics;
    persona.goals = aiGoals;

    chrome.storage.local.set({
      apiKey,
      apiProvider,
      aiModel,
      targetUsers,
      promptTemplate,
      leadTarget,
      postsPerDay,
      postScheduleMode,
      postDeliveryMode,
      smartTimeSlots,
      postInterval,
      aiPersona: persona,
      agentMemory,
      onboardingStrategy,
      competitorReport,
      testPostText
    }, () => {
      chrome.runtime.sendMessage({ action: 'queueUpdated' }, () => {});
      if (!skipAutoStart) {
        chrome.runtime.sendMessage({ action: 'maybeStartAgentAfterSetup' }, (response) => {
          if (!silent && response?.started) {
            showStatus('Agent 已按当前计划自动启动。', '#17bf63', 5000);
          }
        });
      }
      if (typeof afterSave === 'function') afterSave();
    });
  });
}

function syncWizardToFields(options = {}) {
  const overwrite = options.overwrite !== false;
  const strategy = getOnboardingStrategyFromForm();
  const plan = createPlan(strategy);
  const audience = getAudienceLabels(strategy);
  const content = getContentLabels(strategy);
  const role = ACCOUNT_USE_LABELS[strategy.accountUse] || ACCOUNT_USE_LABELS.brand;
  const style = STYLE_LABELS[strategy.postStyle] || STYLE_LABELS.concise;
  const archetype = STRATEGY_ARCHETYPE_LABELS[strategy.strategyArchetype] || STRATEGY_ARCHETYPE_LABELS.indie_builder;
  const language = LANGUAGE_LABELS[strategy.preferredLanguage] || LANGUAGE_LABELS['zh-CN'];
  const source = strategy.sourceInput || '尚未输入来源';
  const firstTweet = strategy.firstTweetText || composeFirstTweet(strategy);
  const interactionTargetList = formatHandleList(getDefaultInteractionTargets(strategy));
  const discoveryKeywords = getDefaultDiscoveryKeywords(strategy).join('\n');

  setFieldValue('postsPerDay', String(plan.postsPerDay), overwrite);
  setFieldValue('postScheduleMode', 'smart', overwrite);
  setFieldValue('smartTimeSlots', plan.schedule, overwrite);
  toggleScheduleMode();

  setFieldValue('leadTarget', buildLeadTarget(strategy, content, audience), overwrite);
  setFieldValue('aiTargetUsers', audience.join('\n'), overwrite);
  setFieldValue('aiGoals', `${strategy.growthGoal || '首月新增 1000 粉丝'}；用 ${role} 的方式建立信任、获取关注、沉淀潜在客户，并把日常输入转化为稳定内容输出。`, overwrite);
  setFieldValue('aiCharacteristics', `语言：${language}\n账号角色：${role}\n内容策略模板：${archetype}\n默认文案流派：${style}\n内容配比：${plan.mix}\n表达要具体、可信、有判断力，避免空泛鸡血。`, overwrite);
  setFieldValue('targetUsers', interactionTargetList, overwrite);
  setFieldValue('testPostText', firstTweet, overwrite);
  setFieldValue('firstTweetPreview', firstTweet, overwrite);

  const memory = {
    identity: `来源：${source}\n账号角色：${role}\n内容策略模板：${archetype}\n目标：${strategy.growthGoal || DEFAULT_ONBOARDING_STRATEGY.growthGoal}\n${describeLeadAsset(strategy)}`,
    marketPosition: `${role}，用 ${archetype} 的打法和 ${style} 的表达方式，在 ${content.join('、') || '核心赛道'} 中建立清晰、可信、可持续的 X 影响力。`,
    audienceSegments: audience.join('\n'),
    audiencePains: buildAudiencePains(strategy),
    contentPillars: content.join('\n'),
    contentAngles: buildContentAngles(strategy),
    proofAssets: '优先使用可验证的产品进展、用户反馈、真实案例、公开数据和亲历复盘；没有证据时用观察/假设措辞。',
    personalStories: '持续收集：产品构建过程、客户问题、失败复盘、增长实验、行业观察。',
    coreOpinions: buildCoreOpinions(strategy),
    boundaries: '不做擦边内容；不碰政治动员；不承诺投资收益；不编造履历、客户和数据；不刷屏；不诱导私信轰炸。',
    voiceRules: buildVoiceRules(strategy),
    bannedClaims: '禁止“稳赚”“保证涨粉”“保证成交”“内部消息”“无风险收益”等不可验证承诺。',
    interactionTargets: interactionTargetList,
    discoveryKeywords,
    replyStrategy: buildReplyStrategy(strategy),
    sourceInputs: source,
    weeklyReviewSignals: '每周复盘：涨粉来源、回复率、收藏率、转发率、评论带来的关注、误解或争议点、可复用选题。'
  };

  Object.entries(memory).forEach(([key, value]) => {
    setFieldValue(AGENT_MEMORY_FIELD_IDS[key], value, overwrite);
  });

  setFieldValue('promptTemplate', buildPromptTemplate(strategy), overwrite);
  updatePlanPreview();
}

function setFieldValue(id, value, overwrite = true) {
  const el = document.getElementById(id);
  if (!el) return;
  if (overwrite || !el.value.trim()) el.value = value || '';
}

function normalizeHandleList(values = []) {
  return values
    .flatMap(value => String(value || '').split(/[\s,，、\n]+/))
    .map(item => item.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split('/')[0])
    .filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item));
}

function formatHandleList(values = []) {
  return [...new Set(normalizeHandleList(values))].join('\n');
}

function getDefaultInteractionTargets(strategy = {}) {
  const archetype = strategy.strategyArchetype || DEFAULT_ONBOARDING_STRATEGY.strategyArchetype;
  return DEFAULT_INTERACTION_TARGETS[archetype] || DEFAULT_INTERACTION_TARGETS.indie_builder;
}

function getDefaultDiscoveryKeywords(strategy = {}) {
  const archetype = strategy.strategyArchetype || DEFAULT_ONBOARDING_STRATEGY.strategyArchetype;
  return DEFAULT_DISCOVERY_KEYWORDS[archetype] || DEFAULT_DISCOVERY_KEYWORDS.indie_builder;
}

function extractSourceHandles(source) {
  const handles = [];
  const xMatch = source.match(/x\.com\/([A-Za-z0-9_]{1,15})/i) || source.match(/twitter\.com\/([A-Za-z0-9_]{1,15})/i);
  if (xMatch?.[1]) handles.push(xMatch[1]);
  const atMatch = source.match(/@([A-Za-z0-9_]{1,15})/);
  if (atMatch?.[1]) handles.push(atMatch[1]);
  return [...new Set(handles)].join('\n');
}

function buildAudiencePains(strategy) {
  const base = [
    '有想法但输出不稳定',
    '会刷 X 但不会把输入转化成观点和内容',
    '想做 KOL 但缺少定位、素材库和持续发布节奏'
  ];
  if (strategy.audience.includes('founders')) base.push('创始人需要在增长、融资、产品方向上建立可信表达');
  if (strategy.audience.includes('indie')) base.push('独立开发者需要低成本冷启动和持续获客');
  if (strategy.audience.includes('global')) base.push('出海从业者需要跨文化渠道、案例和转化路径');
  if (strategy.audience.includes('aiBuilders')) base.push('AI 工具人需要更具体的工作流、自动化和交付结果');
  if (strategy.audience.includes('researchers')) base.push('研究/投资人需要趋势判断、结构化信息和反共识观点');
  return base.join('\n');
}

function buildContentAngles(strategy) {
  const lines = [];
  if (strategy.postStyle === 'concise') lines.push('清单式：3 个工具、5 个步骤、1 个判断。');
  if (strategy.postStyle === 'story') lines.push('故事式：起因、转折、发现、可复制经验。');
  if (strategy.postStyle === 'contrarian') lines.push('反常识式：先给明确判断，再解释为什么大多数人做错。');
  lines.push('低粉爆款优先：具体场景、强钩子、少废话、可转发的结论。');
  lines.push(`内容配比：${(CONTENT_MODE_PLANS[strategy.contentMode] || CONTENT_MODE_PLANS.balanced).mix}`);
  return lines.join('\n');
}

function buildCoreOpinions(strategy) {
  const content = getContentLabels(strategy).join('、') || 'AI、出海、增长和个人商业化';
  return [
    `做 X 影响力不是随机发帖，而是围绕 ${content} 持续输出可验证的判断。`,
    '工具本身不值钱，能降低成本、提高转化或创造新分发才值钱。',
    '涨粉不是目的，建立信任和可重复的内容系统才是长期资产。'
  ].join('\n');
}

function buildVoiceRules(strategy) {
  const language = LANGUAGE_LABELS[strategy.preferredLanguage] || LANGUAGE_LABELS['zh-CN'];
  const style = STYLE_LABELS[strategy.postStyle] || STYLE_LABELS.concise;
  const lines = [
    `优先使用${language}。`,
    `默认采用${style}。`,
    '先结论后解释；少形容词，多具体例子；每条内容只表达一个核心观点。',
    '中文短推默认手动换行：Hook 单独一行，长句按 28-36 个汉字切分，逻辑块之间留空行。'
  ];
  if (strategy.accountUse === 'brand') lines.push('品牌号保持专业、克制，避免过强个人情绪。');
  if (strategy.accountUse === 'evangelist') lines.push('首席推销官可以更有热情，但必须用事实和案例支撑。');
  if (strategy.accountUse === 'curator') lines.push('观察家要多总结、多转译、多补充判断。');
  if (strategy.accountUse === 'kol') lines.push('KOL 要敢给判断，但避免攻击个人。');
  return lines.join('\n');
}

function buildReplyStrategy(strategy) {
  const audience = getAudienceLabels(strategy).join('、') || '目标用户';
  const targets = formatHandleList(getDefaultInteractionTargets(strategy))
    .split('\n')
    .filter(Boolean)
    .map(handle => `@${handle}`)
    .join('、');
  return `Agent 已自动生成种子互动账号池：${targets || '根据账号定位动态选择'}。

优先回复这些赛道核心创作者和 ${audience} 正在讨论的话题。推荐页不匹配时，Agent 会自动使用关键词 + X 高级搜索过滤器寻找目标语言热帖，不把推荐页当唯一来源。不要为了被看见而回复，只回复能让原帖变得更完整的内容。

高价值回复三种结构：
1. 补缺失角度：说出原帖没讲但读者需要的边界。
2. 压缩观点：把原帖进一步提炼成更锋利的一句话。
3. 补真实经验：提供观察、案例、试错或判断标准。

每条回复都要能单独成立为 mini-content；如果只剩“说得对/学习了/值得关注”，宁愿跳过。
只在上下文自然相关时带行动入口，不硬广，不刷屏，不 hijack 原帖。
${describeLeadAsset(strategy)}`;
}

function buildPromptTemplate(strategy) {
  return `你是一个 X 个人发声 Agent。请根据推文内容，生成一条短评论。
要求：
1. 不超过 60 个中文字符，或目标语言下同等长度。
2. 符合账号角色、目标用户和长期记忆。
3. 先提供观点或补充，不要生硬广告。
4. 只有在上下文自然相关时，才轻量提及引流信息。

【推文】：{tweet}
【引流信息】：{leadTarget}

回复：`;
}

function composeFirstTweet(strategy) {
  const content = getContentLabels(strategy);
  const audience = getAudienceLabels(strategy);
  const contentText = content.join('、') || 'AI、出海和增长';
  const audienceText = audience.join('、') || '创始人和独立开发者';
  const sourceLine = strategy.sourceInput ? `\n\n我会拿 ${strategy.sourceInput} 做第一批样本。` : '';
  if (strategy.postStyle === 'story') {
    return `我见过太多人把 X 当朋友圈发。

结果是：
每天都有想法
但没有一个能变成关注

问题不在表达欲。
问题在没有内容系统。

接下来我会围绕 ${contentText}，公开测试一套从输入到涨粉的 X 发声流程。${sourceLine}`;
  }
  if (strategy.postStyle === 'contrarian') {
    return `大多数账号不是死在内容差。

是死在“每条内容都像临时起意”。

真正能涨粉的账号，至少有 5 个固定资产：
目标用户
强观点
内容矩阵
互动对象
复盘机制

我接下来会围绕 ${audienceText}，公开拆这套系统。`;
  }
  return `想把 X 做起来，别先追热点。

先搭一个内容飞轮：

1. 用观点贴涨粉
2. 用干货贴建信任
3. 用故事贴做人设
4. 用评论去截流
5. 用复盘筛出爆款

接下来我会围绕 ${contentText}，持续测试这套方法。`;
}

function buildGrowthPlan(options = {}) {
  const strategy = getOnboardingStrategyFromForm();
  const plan = createPlan(strategy);
  const overwrite = options.overwrite !== false;
  startPlanProgress();
  setTimeout(() => {
    syncWizardToFields({ overwrite });
    document.getElementById('firstTweetPreview').value = strategy.firstTweetText || composeFirstTweet(strategy);
    document.getElementById('testPostText').value = document.getElementById('firstTweetPreview').value;
    stopPlanProgress('涨粉计划已生成，可应用到 Agent 记忆。', 'success');
    updatePlanPreview();
    scheduleAutoSave();
  }, 800);
}

function startPlanProgress() {
  const el = document.getElementById('growthPlanStatus');
  if (!el) return;
  el.textContent = '正在制定涨粉计划... 0s / 60s';
  el.classList.remove('success', 'error');
  el.classList.add('running');
}

function stopPlanProgress(message, state = '') {
  const el = document.getElementById('growthPlanStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('running', 'success', 'error');
  if (state) el.classList.add(state);
}

function applyPlanToAgent() {
  syncWizardToFields({ overwrite: true });
  saveOptions({ silent: true, skipAutoStart: true }, () => {
    showStatus('已把向导选择写入长期记忆。', '#17bf63', 4000);
    stopPlanProgress('已应用到 Agent 记忆，可以测试发帖或启动。', 'success');
  });
}

function postFirstActionTweet() {
  const firstTweet = document.getElementById('firstTweetPreview').value.trim() || composeFirstTweet(getOnboardingStrategyFromForm());
  document.getElementById('testPostText').value = firstTweet;
  saveOptions({ silent: true, skipAutoStart: true }, () => testPostNow());
}

function analyzeSourceNow() {
  const sourceInput = document.getElementById('sourceInput').value.trim();
  if (!sourceInput) {
    setSourceAnalysisStatus('请先输入链接或账号。');
    updateAnalysisSteps(-1, 'error');
    return;
  }

  startAnalysisProgress('AI 正在进行分析...');
  saveOptions({ silent: true, skipAutoStart: true }, () => {
    chrome.runtime.sendMessage({ action: 'analyzeOnboardingSource', sourceInput }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        const fallback = createFallbackAnalysis(sourceInput);
        applySourceAnalysis(fallback);
        stopAnalysisProgress('未连接 AI，已用本地策略模板生成初稿。', 'success');
        showStatus('已生成本地策略初稿；填写 API Key 后可进行 AI 深度分析。', '#f5a623', 5000);
        return;
      }

      applySourceAnalysis(response.analysis || createFallbackAnalysis(sourceInput));
      stopAnalysisProgress('AI 分析完成，请确认下面的卡片选择。', 'success');
      showStatus('AI 分析完成，已自动填入建议。');
    });
  });
}

function startAnalysisProgress(message) {
  clearInterval(analysisTimer);
  sourceAnalysisRunning = true;
  sourceAnalysisLocked = false;
  analysisStartedAt = Date.now();
  setSourceAnalysisStatus(message);
  document.getElementById('sourceAnalysisProgress').style.width = '8%';
  document.getElementById('analysisTimer').textContent = '0s / 60s';
  updateAnalysisSteps(0);
  analysisTimer = setInterval(() => {
    const seconds = Math.min(60, Math.floor((Date.now() - analysisStartedAt) / 1000));
    const percent = Math.min(92, 8 + seconds * 1.4);
    const activeStep = seconds < 20 ? 0 : (seconds < 40 ? 1 : 2);
    document.getElementById('analysisTimer').textContent = `${seconds}s / 60s`;
    document.getElementById('sourceAnalysisProgress').style.width = `${percent}%`;
    updateAnalysisSteps(activeStep);
    setSourceAnalysisStatus(ANALYSIS_MESSAGES[activeStep] || message);
  }, 1000);
}

function stopAnalysisProgress(message, state = '') {
  clearInterval(analysisTimer);
  analysisTimer = null;
  sourceAnalysisRunning = false;
  sourceAnalysisLocked = true;
  document.getElementById('sourceAnalysisProgress').style.width = state === 'error' ? '20%' : '100%';
  document.getElementById('analysisTimer').textContent = state === 'error' ? '--' : `${Math.min(60, Math.floor((Date.now() - analysisStartedAt) / 1000))}s / 60s`;
  updateAnalysisSteps(-1, state === 'error' ? 'error' : 'done');
  setSourceAnalysisStatus(message);
}

function setSourceAnalysisStatus(message) {
  setText('sourceAnalysisStatus', message);
}

function updateAnalysisSteps(activeIndex = -1, finalState = '') {
  const steps = Array.from(document.querySelectorAll('.analysis-step'));
  steps.forEach((step, index) => {
    step.classList.remove('running', 'done', 'error');
    if (finalState === 'done') {
      step.classList.add('done');
      return;
    }
    if (finalState === 'error') {
      if (index === Math.max(0, activeIndex)) step.classList.add('error');
      return;
    }
    if (index < activeIndex) {
      step.classList.add('done');
    } else if (index === activeIndex) {
      step.classList.add('running');
    }
  });
}

function applySourceAnalysis(analysis) {
  if (!analysis) return;
  const strategy = {
    ...getOnboardingStrategyFromForm(),
    sourceInput: analysis.sourceInput || document.getElementById('sourceInput').value.trim(),
    strategyArchetype: analysis.strategyArchetype || getOnboardingStrategyFromForm().strategyArchetype,
    accountUse: analysis.accountUse || getOnboardingStrategyFromForm().accountUse,
    audience: Array.isArray(analysis.audience) && analysis.audience.length ? analysis.audience : getOnboardingStrategyFromForm().audience,
    audienceCustom: analysis.audienceCustom || getOnboardingStrategyFromForm().audienceCustom,
    content: Array.isArray(analysis.content) && analysis.content.length ? analysis.content : getOnboardingStrategyFromForm().content,
    contentCustom: analysis.contentCustom || getOnboardingStrategyFromForm().contentCustom,
    contentMode: analysis.contentMode || getOnboardingStrategyFromForm().contentMode,
    leadAssetType: analysis.leadAssetType || getOnboardingStrategyFromForm().leadAssetType,
    leadAssetValue: analysis.leadAssetValue || getOnboardingStrategyFromForm().leadAssetValue,
    postStyle: analysis.postStyle || getOnboardingStrategyFromForm().postStyle,
    preferredLanguage: analysis.preferredLanguage || getOnboardingStrategyFromForm().preferredLanguage,
    targetTimezone: analysis.targetTimezone || getOnboardingStrategyFromForm().targetTimezone,
    growthGoal: analysis.growthGoal || getOnboardingStrategyFromForm().growthGoal,
    automationMode: analysis.automationMode || getOnboardingStrategyFromForm().automationMode,
    firstTweetText: analysis.firstTweetText || getOnboardingStrategyFromForm().firstTweetText
  };
  applyOnboardingStrategy(strategy);

  if (analysis.persona) {
    setFieldValue('aiTargetUsers', analysis.persona.targetUsers || '', true);
    setFieldValue('aiCharacteristics', analysis.persona.characteristics || '', true);
    setFieldValue('aiGoals', analysis.persona.goals || '', true);
  }
  if (analysis.recommendedInteractionTargets && !analysis.memory?.interactionTargets) {
    analysis.memory = {
      ...(analysis.memory || {}),
      interactionTargets: formatHandleList(analysis.recommendedInteractionTargets)
    };
  }
  if (analysis.memory) fillAgentMemory(analysis.memory, false);
  if (analysis.leadTarget) setFieldValue('leadTarget', analysis.leadTarget, true);
  if (analysis.competitorReport) setFieldValue('competitorReport', analysis.competitorReport, true);

  syncWizardToFields({ overwrite: false });
  buildGrowthPlan({ overwrite: false });
}

function createFallbackAnalysis(sourceInput) {
  const looksLikeX = /(?:x|twitter)\.com\/|^@?[A-Za-z0-9_]{1,15}$/.test(sourceInput);
  const sourceLower = sourceInput.toLowerCase();
  let strategyArchetype = looksLikeX ? 'ai_product_kol' : 'indie_builder';
  if (/leobai825|levelsio|搞钱|副业|出海|变现/.test(sourceLower)) strategyArchetype = 'monetization_global';
  if (/zarazhangrui|swyx|aakashg0|ai|agent|人工智能/.test(sourceLower)) strategyArchetype = 'ai_product_kol';
  if (/shreyas|packym|投资|研究|增长/.test(sourceLower)) strategyArchetype = 'research_growth';
  return {
    sourceInput,
    strategyArchetype,
    accountUse: looksLikeX ? 'kol' : 'evangelist',
    audience: looksLikeX ? ['founders', 'aiBuilders'] : ['founders', 'indie', 'global'],
    content: looksLikeX ? ['insights', 'curation', 'playbooks'] : ['insights', 'playbooks', 'stories', 'softPromo'],
    contentMode: 'balanced',
    leadAssetType: 'none',
    leadAssetValue: '',
    postStyle: looksLikeX ? 'contrarian' : 'concise',
    preferredLanguage: 'zh-CN',
    targetTimezone: 'Asia/Shanghai',
    growthGoal: '首月新增 1000 粉丝',
    recommendedInteractionTargets: getDefaultInteractionTargets({ strategyArchetype }),
    firstTweetText: ''
  };
}

function startAccountAutoSetup() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setSetupStatus('请先填写并保存 API Key，然后再启动 AI 自动分析。', 'error');
    showStatus('一键分析需要 API Key。', '#f5a623', 4000);
    return;
  }

  setSetupStatus('正在保存当前表单，并准备读取 X 账号...', 'running');
  saveOptions({ silent: true, skipAutoStart: true }, () => {
    chrome.runtime.sendMessage({ action: 'startAccountAutoSetup' }, (response) => {
      if (chrome.runtime.lastError) {
        setSetupStatus(`启动失败：${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (!response || !response.success) {
        setSetupStatus(`启动失败：${response?.error || '未知错误'}`, 'error');
        return;
      }
      setSetupStatus(response.message || '已开始读取并分析账号。', 'running');
      showStatus('已开始读取 X 账号并自动分析。', '#17bf63', 5000);
    });
  });
}

function setSetupStatus(message, state = '') {
  const planStatus = document.getElementById('growthPlanStatus');
  if (planStatus && state) {
    planStatus.classList.remove('running', 'success', 'error');
    planStatus.classList.add(state);
    planStatus.textContent = message;
  }
}

function setValueIfNotFocused(id, value) {
  const el = document.getElementById(id);
  if (!el || document.activeElement === el) return;
  el.value = value || '';
}

function normalizeAgentMemory(memory = {}) {
  return { ...DEFAULT_AGENT_MEMORY, ...(memory || {}) };
}

function memoryValueToText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ? String(value) : '';
}

function getAgentMemoryFromForm() {
  const memory = {};
  Object.entries(AGENT_MEMORY_FIELD_IDS).forEach(([key, id]) => {
    memory[key] = document.getElementById(id)?.value || '';
  });
  return memory;
}

function fillAgentMemory(memory = {}, preserveFocus = false) {
  const normalized = normalizeAgentMemory(memory);
  Object.entries(AGENT_MEMORY_FIELD_IDS).forEach(([key, id]) => {
    const value = memoryValueToText(normalized[key]);
    if (preserveFocus) {
      setValueIfNotFocused(id, value);
      return;
    }

    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

function updateSetupStatusFromStorage(items) {
  if (sourceAnalysisRunning || sourceAnalysisLocked) return;
  const sourceInput = document.getElementById('sourceInput')?.value.trim();
  if (!sourceInput) {
    setSourceAnalysisStatus('等待输入链接');
    updateAnalysisSteps(-1);
  }
}

function testPostNow() {
  const text = document.getElementById('testPostText').value.trim();
  if (!text) {
    showStatus('测试推文内容不能为空。', '#f5a623', 3000);
    return;
  }

  chrome.storage.local.set({ testPostText: text }, () => {
    chrome.runtime.sendMessage({ action: 'testPostNow', text }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(`测试发帖启动失败：${chrome.runtime.lastError.message}`, '#ff4d4f', 6000);
        return;
      }
      if (!response || !response.success) {
        showStatus(`测试发帖启动失败：${response?.error || '未知错误'}`, '#ff4d4f', 6000);
        return;
      }
      showStatus('已启动测试发帖，请查看 X 标签页和成果记录。', '#17bf63', 5000);
    });
  });
}

function renderAgentChat(messages = []) {
  const thread = document.getElementById('agentChatThread');
  if (!thread) return;

  const visibleMessages = messages.length > 0 ? messages : [{
    role: 'assistant',
    content: '把你看到的好帖、账号想法、受众变化或复盘结论发给我。我会帮你判断它适合变成观点、故事、评论策略，还是写进长期记忆。',
    time: Date.now()
  }];

  const nodes = visibleMessages.slice(-60).map((message) => {
    const item = document.createElement('div');
    item.className = `chat-message ${message.role === 'user' ? 'user' : 'assistant'}`;

    const label = document.createElement('span');
    label.textContent = message.role === 'user' ? 'You' : 'Agent';

    const text = document.createElement('p');
    text.textContent = message.content || '';

    item.append(label, text);
    return item;
  });
  thread.replaceChildren(...nodes);
  thread.scrollTop = thread.scrollHeight;
}

function setAgentChatBusy(isBusy, message = '') {
  const input = document.getElementById('agentChatInput');
  const button = document.getElementById('agentChatSendBtn');
  const status = document.getElementById('agentChatStatus');
  if (input) input.disabled = isBusy;
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? '思考中...' : '发送给 Agent';
  }
  if (status) status.textContent = message || (isBusy ? 'Agent 正在提炼记忆...' : '会自动保存到本地记忆');
}

function sendAgentChat(event) {
  event?.preventDefault();
  const input = document.getElementById('agentChatInput');
  const text = input?.value.trim();
  if (!text) {
    showStatus('先写一点想法或粘贴一条好帖。', '#f5a623', 3000);
    return;
  }
  if (!globalThis.chrome?.runtime?.sendMessage) {
    showStatus('请在 Chrome 扩展环境中使用 Agent 对话。', '#f5a623', 3000);
    return;
  }

  setAgentChatBusy(true);
  chrome.runtime.sendMessage({ action: 'agentChat', message: text }, (response) => {
    setAgentChatBusy(false);
    if (chrome.runtime.lastError || !response?.success) {
      showStatus(`Agent 对话失败：${chrome.runtime.lastError?.message || response?.error || '未知错误'}`, '#ff4d4f', 6000);
      return;
    }

    input.value = '';
    renderAgentChat(response.messages || []);
    if (response.agentMemory) fillAgentMemory(response.agentMemory, true);
    showStatus(response.memoryUpdated ? 'Agent 已回复，并写入长期记忆。' : 'Agent 已回复。', '#17bf63', 4000);
  });
}

function formatInlineLogTime(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function loadInlineLogs() {
  if (!globalThis.chrome?.storage?.local) {
    renderInlineLogs([]);
    return;
  }
  chrome.storage.local.get(['logs'], (result) => {
    renderInlineLogs(result.logs || []);
  });
}

function isResultLog(log = {}) {
  const message = String(log.message || '');
  if (/跳过推文抓取|不启动自动滚动|停止自动滚动|跳过发推调度|跳过本次发推|跳过发推|跳过 intent 回复|机器人已停止|用户手动恢复/.test(message)) {
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

function getResultLogKind(log = {}) {
  const message = String(log.message || '');
  if (/已跳过|跳过 @/.test(message)) return 'skip';
  if (/回复|intent 回复|已回|X 提示已回复过/.test(message)) return 'reply';
  if (/推文发送成功|定时推文发送成功|测试推文发送成功|X 原生定时发布|已发 \d+ 条|X 提示这条内容已发布过/.test(message)) return 'post';
  if (/已暂停|失败|未确认成功|发送失败|未读取到|未找到|取消/.test(message) || log.level === 'error') return 'issue';
  return 'other';
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

function renderInlineLogs(logs = []) {
  const list = document.getElementById('inlineLogList');
  if (!list) return;

  const resultLogs = logs.filter(isResultLog);
  const counts = { post: 0, reply: 0, issue: 0 };
  resultLogs.forEach((log) => {
    const kind = getResultLogKind(log);
    if (counts[kind] !== undefined) counts[kind] += 1;
  });
  setText('inlineLogTotal', String(resultLogs.length));
  setText('inlineLogSuccess', String(counts.post));
  setText('inlineLogWarn', String(counts.reply));
  setText('inlineLogError', String(counts.issue));

  const recentLogs = resultLogs.slice(-40).reverse();
  if (recentLogs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inline-log-empty';
    empty.textContent = '暂无成果记录：完成发布或回复后会显示在这里';
    list.replaceChildren(empty);
    return;
  }

  const rows = recentLogs.map((log) => {
    const row = document.createElement('div');
    row.className = 'inline-log-row';

    const time = document.createElement('span');
    time.className = 'inline-log-time';
    time.textContent = formatInlineLogTime(log.time);

    const level = document.createElement('span');
    level.className = `inline-log-level ${log.level || 'info'}`;
    level.textContent = LOG_LEVEL_LABELS[log.level] || log.level || '信息';

    const message = document.createElement('span');
    message.className = 'inline-log-message';
    message.textContent = formatResultLogMessage(log);

    row.append(time, level, message);
    return row;
  });
  list.replaceChildren(...rows);
}

function restoreOptions() {
  if (!hasChromeStorage()) {
    renderAgentChat([]);
    toggleModelInput();
    toggleScheduleMode();
    optionsRestored = true;
    return;
  }

  chrome.storage.local.get({
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: '',
    targetUsers: '',
    promptTemplate: buildPromptTemplate(DEFAULT_ONBOARDING_STRATEGY),
    leadTarget: '',
    postsPerDay: 5,
    postScheduleMode: 'smart',
    postDeliveryMode: 'localQueue',
    smartTimeSlots: '9-11,12-14,20-23',
    postInterval: 30,
    aiPersona: { targetUsers: '', characteristics: '', goals: '' },
    agentMemory: DEFAULT_AGENT_MEMORY,
    onboardingStrategy: DEFAULT_ONBOARDING_STRATEGY,
    agentChatMessages: [],
    competitorReport: '',
    testPostText: DEFAULT_TEST_POST,
    accountBio: '',
    profileReadProgress: null,
    isAnalyzingPersona: false,
    isAnalyzingCompetitors: false,
    isGenerating: false,
    isRunning: false
  }, (items) => {
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('apiProvider').value = items.apiProvider;
    const config = PROVIDER_DEFAULTS[items.apiProvider] || PROVIDER_DEFAULTS.gemini;
    document.getElementById('aiModel').value = items.aiModel || config.model;
    document.getElementById('targetUsers').value = items.targetUsers;
    document.getElementById('promptTemplate').value = items.promptTemplate;
    document.getElementById('leadTarget').value = items.leadTarget;
    document.getElementById('postsPerDay').value = items.postsPerDay;
    document.getElementById('postScheduleMode').value = items.postScheduleMode;
    document.getElementById('postDeliveryMode').value = items.postDeliveryMode;
    document.getElementById('smartTimeSlots').value = items.smartTimeSlots;
    document.getElementById('postInterval').value = items.postInterval;
    document.getElementById('aiTargetUsers').value = items.aiPersona.targetUsers || '';
    document.getElementById('aiCharacteristics').value = items.aiPersona.characteristics || '';
    document.getElementById('aiGoals').value = items.aiPersona.goals || '';
    fillAgentMemory(items.agentMemory);
    document.getElementById('competitorReport').value = items.competitorReport || '';
    document.getElementById('testPostText').value = items.testPostText || DEFAULT_TEST_POST;
    renderAgentChat(items.agentChatMessages || []);
    applyOnboardingStrategy(items.onboardingStrategy || DEFAULT_ONBOARDING_STRATEGY);
    toggleModelInput();
    toggleScheduleMode();
    updateSetupStatusFromStorage(items);
    optionsRestored = true;
  });
}

if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.aiPersona?.newValue) {
      const persona = changes.aiPersona.newValue || {};
      setValueIfNotFocused('aiTargetUsers', persona.targetUsers || '');
      setValueIfNotFocused('aiCharacteristics', persona.characteristics || '');
      setValueIfNotFocused('aiGoals', persona.goals || '');
    }
    if (changes.competitorReport) {
      setValueIfNotFocused('competitorReport', changes.competitorReport.newValue || '');
    }
    if (changes.agentMemory) {
      fillAgentMemory(changes.agentMemory.newValue || {}, true);
    }
    if (changes.agentChatMessages) {
      renderAgentChat(changes.agentChatMessages.newValue || []);
    }
    if (changes.logs) {
      renderInlineLogs(changes.logs.newValue || []);
    }

    chrome.storage.local.get([
      'profileReadProgress',
      'isAnalyzingPersona',
      'isAnalyzingCompetitors',
      'isGenerating',
      'isRunning',
      'competitorReport'
    ], updateSetupStatusFromStorage);
  });
}
