document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('apiProvider').addEventListener('change', toggleModelInput);
document.getElementById('postScheduleMode').addEventListener('change', toggleScheduleMode);

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

function toggleModelInput() {
  const provider = document.getElementById('apiProvider').value;
  const modelGroup = document.getElementById('modelGroup');
  const modelInput = document.getElementById('aiModel');
  const helpText = document.getElementById('modelHelpText');
  
  const config = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;
  
  modelGroup.style.display = config.showModel ? 'block' : 'none';
  
  // 如果当前输入框是空值或者是其他 provider 的默认值，则替换为当前 provider 的默认值
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

function saveOptions() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiProvider = document.getElementById('apiProvider').value;
  const aiModel = document.getElementById('aiModel').value.trim();
  const targetUsers = document.getElementById('targetUsers').value;
  const promptTemplate = document.getElementById('promptTemplate').value;
  const leadTarget = document.getElementById('leadTarget').value.trim();
  const postsPerDay = parseInt(document.getElementById('postsPerDay').value, 10) || 10;
  const postScheduleMode = document.getElementById('postScheduleMode').value;
  const smartTimeSlots = document.getElementById('smartTimeSlots').value.trim();
  const postInterval = parseInt(document.getElementById('postInterval').value, 10) || 60;
  
  const aiTargetUsers = document.getElementById('aiTargetUsers').value;
  const aiCharacteristics = document.getElementById('aiCharacteristics').value;
  const aiGoals = document.getElementById('aiGoals').value;
  const competitorReport = document.getElementById('competitorReport').value;

  // 基础配置校验
  const missing = [];
  if (!apiKey) missing.push('API Key');
  if (!leadTarget) missing.push('引流目标');
  
  if (missing.length > 0) {
    const status = document.getElementById('statusMessage');
    status.textContent = `⚠️ 保存成功，但缺少关键配置：${missing.join('、')}，机器人可能无法正常运行。`;
    status.classList.add('show');
    status.style.color = '#f5a623';
    setTimeout(() => {
      status.classList.remove('show');
      status.style.color = '';
    }, 5000);
  } else {
    const status = document.getElementById('statusMessage');
    status.textContent = '✅ 配置已成功保存！';
    status.classList.add('show');
    setTimeout(() => {
      status.classList.remove('show');
    }, 3000);
  }

  chrome.storage.local.get(['aiPersona'], (result) => {
    let persona = result.aiPersona || {};
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
      aiPersona: persona,
      competitorReport
    });
  });
}

function restoreOptions() {
  chrome.storage.local.get({
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: '',
    targetUsers: '',
    promptTemplate: '你是一个社交媒体引流专家。请根据推文内容，给出一段简短、神回复级别的评论（不超过 40 个字）。\n如果合适的话，请巧妙、自然地顺带提及我的【引流信息】，千万不要显得像生硬的广告，要像朋友间的随口分享：\n\n【推文】：{tweet}\n【引流信息】：{leadTarget}\n\n回复：',
    leadTarget: '',
    postsPerDay: 10,
    postScheduleMode: 'smart',
    smartTimeSlots: '8-10,12-14,19-23',
    postInterval: 60,
    aiPersona: { targetUsers: '', characteristics: '', goals: '' },
    competitorReport: ''
  }, (items) => {
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('apiProvider').value = items.apiProvider;
    
    // 如果 storage 中没有 aiModel，则使用对应 provider 的默认值
    const config = PROVIDER_DEFAULTS[items.apiProvider] || PROVIDER_DEFAULTS.gemini;
    document.getElementById('aiModel').value = items.aiModel || config.model;
    
    document.getElementById('targetUsers').value = items.targetUsers;
    document.getElementById('promptTemplate').value = items.promptTemplate;
    
    toggleModelInput();
    document.getElementById('leadTarget').value = items.leadTarget;
    document.getElementById('postsPerDay').value = items.postsPerDay;
    document.getElementById('postScheduleMode').value = items.postScheduleMode;
    document.getElementById('smartTimeSlots').value = items.smartTimeSlots;
    document.getElementById('postInterval').value = items.postInterval;
    toggleScheduleMode();
    document.getElementById('aiTargetUsers').value = items.aiPersona.targetUsers || '';
    document.getElementById('aiCharacteristics').value = items.aiPersona.characteristics || '';
    document.getElementById('aiGoals').value = items.aiPersona.goals || '';
    document.getElementById('competitorReport').value = items.competitorReport || '';
  });
}
