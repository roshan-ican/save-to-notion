// ---- Theme Manager ----
import { ThemeManager } from './utils/theme-manager.js';

// ---- DOM Elements ----
const settingsBtn = document.getElementById('settings-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const openSettingsBtn = document.getElementById('open-settings-btn');
const notConfigured = document.getElementById('not-configured');
const configuredSection = document.getElementById('configured-section');
const dbName = document.getElementById('db-name');

const notLeetcode = document.getElementById('not-leetcode');
const problemSection = document.getElementById('problem-section');
const problemTitle = document.getElementById('problem-title');
const problemDifficulty = document.getElementById('problem-difficulty');
const problemTags = document.getElementById('problem-tags');
const platformBadge = document.getElementById('platform-badge');
const codeInfo = document.getElementById('code-info');
const codeLang = document.getElementById('code-lang');
const submissionInfo = document.getElementById('submission-info');
const submissionStats = document.getElementById('submission-stats');

const runtimeInput = document.getElementById('runtime-input');
const spaceInput = document.getElementById('space-input');
const tipsInput = document.getElementById('tips-input');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');
const aiStatus = document.getElementById('ai-status');
const aiBadge = aiStatus?.querySelector('.ai-badge');

// Stats elements
const statsSection = document.getElementById('stats-section');
const statTotal = document.getElementById('stat-total');
const statEasy = document.getElementById('stat-easy');
const statMedium = document.getElementById('stat-medium');
const statHard = document.getElementById('stat-hard');
const streakRow = document.getElementById('streak-row');
const streakValue = document.getElementById('streak-value');

// Duplicate elements
const duplicateWarning = document.getElementById('duplicate-warning');
const saveNewBtn = document.getElementById('save-new-btn');
const appendSolutionBtn = document.getElementById('append-solution-btn');
const viewExistingBtn = document.getElementById('view-existing-btn');

// Approach element
const approachInfo = document.getElementById('approach-info');
const approachChip = document.getElementById('approach-chip');

// Related problems element
const relatedInfo = document.getElementById('related-info');
const relatedCount = document.getElementById('related-count');

// ---- State ----
let extractedData = null;
let existingPageId = null;
let detectedApproach = '';

// ---- Status helpers ----
function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = type;
}

function hideStatus() {
  statusEl.className = 'hidden';
}

// ---- Open settings ----
function openSettings() {
  chrome.runtime.openOptionsPage();
}

settingsBtn.addEventListener('click', openSettings);
openSettingsBtn.addEventListener('click', openSettings);

// ---- Theme Toggle ----
function updateThemeIcon(theme) {
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

themeToggleBtn.addEventListener('click', async () => {
  const { themePreference = 'system' } = await chrome.storage.local.get('themePreference');
  const currentTheme = themePreference === 'system' ? ThemeManager.getSystemTheme() : themePreference;
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  const appliedTheme = await ThemeManager.setTheme(nextTheme);
  updateThemeIcon(appliedTheme);
});

// ---- Load Stats Dashboard ----
function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (response?.success && response.data) {
      const s = response.data;
      statsSection.classList.remove('hidden');
      statTotal.textContent = s.total;
      statEasy.textContent = s.easy;
      statMedium.textContent = s.medium;
      statHard.textContent = s.hard;

      if (s.streak > 0) {
        streakRow.classList.remove('hidden');
        streakValue.textContent = `${s.streak} day${s.streak > 1 ? 's' : ''} streak`;
      }
    }
  });
}

// ---- Check for Duplicate ----
function checkForDuplicate(url) {
  chrome.runtime.sendMessage({ type: 'CHECK_DUPLICATE', url }, (response) => {
    if (response?.success && response.data) {
      existingPageId = response.data.id;
      const notionUrl = response.data.url;

      duplicateWarning.classList.remove('hidden');
      saveBtn.classList.add('hidden');

      if (notionUrl) {
        viewExistingBtn.href = notionUrl;
      }
    }
  });
}

// ---- Extract data from LeetCode page ----
async function extractData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.match(/leetcode\.com\/problems\//)) {
    notLeetcode.classList.remove('hidden');
    problemSection.classList.add('hidden');
    return;
  }

  notLeetcode.classList.add('hidden');
  showStatus('Extracting problem data...', 'loading');

  chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DATA' }, (response) => {
    if (chrome.runtime.lastError || !response || response.error) {
      showStatus(response?.error || 'Could not extract data. Try refreshing the page.', 'error');
      return;
    }

    hideStatus();
    extractedData = response;
    displayProblemData(response);
    analyzeWithGemini(response);
    checkForDuplicate(response.url);
  });
}

// ---- Display extracted data ----
function displayProblemData(data) {
  problemSection.classList.remove('hidden');

  const p = data.problem;
  problemTitle.textContent = `${p.questionFrontendId}. ${p.title}`;

  problemDifficulty.textContent = p.difficulty;
  problemDifficulty.className = `badge ${p.difficulty.toLowerCase()}`;

  // Show platform badge
  if (data.platform) {
    platformBadge.textContent = data.platform;
    platformBadge.classList.remove('hidden');
  }

  problemTags.innerHTML = '';
  if (p.topicTags?.length > 0) {
    p.topicTags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag.name;
      problemTags.appendChild(span);
    });
  }

  if (data.code) {
    codeInfo.classList.remove('hidden');
    const lines = data.code.split('\n').length;
    codeLang.textContent = `${data.language || 'unknown'} (${lines} lines)`;
  }

  if (data.submission) {
    submissionInfo.classList.remove('hidden');
    const parts = [];
    if (data.submission.runtimeDisplay) {
      let text = data.submission.runtimeDisplay;
      if (data.submission.runtimePercentile != null) {
        text += ` (beats ${data.submission.runtimePercentile.toFixed(1)}%)`;
      }
      parts.push(text);
    }
    if (data.submission.memoryDisplay) {
      let text = data.submission.memoryDisplay;
      if (data.submission.memoryPercentile != null) {
        text += ` (beats ${data.submission.memoryPercentile.toFixed(1)}%)`;
      }
      parts.push(text);
    }
    submissionStats.textContent = parts.join(' | ') || 'Available';
  }

  // Related problems count
  if (p.similarQuestions) {
    try {
      const similar = typeof p.similarQuestions === 'string'
        ? JSON.parse(p.similarQuestions)
        : p.similarQuestions;

      if (Array.isArray(similar) && similar.length > 0) {
        relatedInfo.classList.remove('hidden');
        relatedCount.textContent = `${similar.length} similar problem${similar.length > 1 ? 's' : ''}`;
      }
    } catch (e) {
      // skip
    }
  }
}

// ---- Analyze code with Gemini ----
function analyzeWithGemini(data) {
  if (!data.code) return;

  aiStatus.classList.remove('hidden');
  aiBadge.textContent = 'Analyzing with AI...';
  aiBadge.className = 'ai-badge';

  runtimeInput.placeholder = 'Analyzing...';
  spaceInput.placeholder = 'Analyzing...';
  tipsInput.placeholder = 'Analyzing...';

  const payload = {
    problemTitle: `${data.problem.questionFrontendId}. ${data.problem.title}`,
    difficulty: data.problem.difficulty,
    code: data.code,
    language: data.language || 'unknown'
  };

  chrome.runtime.sendMessage({ type: 'ANALYZE_CODE', payload }, (response) => {
    if (response?.success) {
      if (!runtimeInput.value.trim()) {
        runtimeInput.value = response.data.timeComplexity;
      }
      if (!spaceInput.value.trim()) {
        spaceInput.value = response.data.spaceComplexity;
      }
      if (!tipsInput.value.trim()) {
        tipsInput.value = response.data.tips;
      }

      // Show approach chip
      if (response.data.approach) {
        detectedApproach = response.data.approach;
        approachChip.textContent = response.data.approach;
        approachInfo.classList.remove('hidden');
      }

      aiBadge.textContent = 'AI analysis complete';
      aiBadge.className = 'ai-badge done';
    } else {
      aiBadge.textContent = response?.error || 'AI analysis unavailable';
      aiBadge.className = 'ai-badge error';
    }

    runtimeInput.placeholder = 'e.g. O(n)';
    spaceInput.placeholder = 'e.g. O(n)';
    tipsInput.placeholder = 'Any notes, tips, or common pitfalls...';
  });
}

// ---- Build save payload ----
function buildPayload() {
  const payload = {
    platform: extractedData.platform || 'LeetCode',
    problem: extractedData.problem,
    code: extractedData.code,
    language: extractedData.language,
    submission: extractedData.submission,
    url: extractedData.url,
    runtime: runtimeInput.value.trim(),
    space: spaceInput.value.trim(),
    tips: tipsInput.value.trim()
  };

  // Only include approach if it has a value (optional property)
  if (detectedApproach && detectedApproach.trim()) {
    payload.approach = detectedApproach.trim();
  }

  return payload;
}

// ---- Save to Notion (new page) ----
saveBtn.addEventListener('click', () => {
  if (!extractedData) {
    showStatus('No data extracted yet.', 'error');
    return;
  }

  saveBtn.disabled = true;
  showStatus('Saving to Notion...', 'loading');

  chrome.runtime.sendMessage({ type: 'SAVE_TO_NOTION', payload: buildPayload() }, (response) => {
    saveBtn.disabled = false;
    if (response?.success) {
      showStatus('Saved successfully!', 'success');
      loadStats(); // refresh stats
    } else {
      showStatus(response?.error || 'Failed to save.', 'error');
    }
  });
});

// ---- Duplicate: Save as New ----
saveNewBtn.addEventListener('click', () => {
  duplicateWarning.classList.add('hidden');
  saveBtn.classList.remove('hidden');
  existingPageId = null;
});

// ---- Duplicate: Append Solution ----
appendSolutionBtn.addEventListener('click', () => {
  if (!extractedData || !existingPageId) return;

  appendSolutionBtn.disabled = true;
  showStatus('Adding new solution...', 'loading');

  chrome.runtime.sendMessage({
    type: 'APPEND_SOLUTION',
    pageId: existingPageId,
    payload: buildPayload()
  }, (response) => {
    appendSolutionBtn.disabled = false;
    if (response?.success) {
      showStatus('New solution appended!', 'success');
      duplicateWarning.classList.add('hidden');
      loadStats(); // refresh stats
    } else {
      showStatus(response?.error || 'Failed to append solution.', 'error');
    }
  });
});

// ---- Initialize ----
// Initialize theme first
ThemeManager.initialize().then(theme => {
  updateThemeIcon(theme);
});

chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (response) => {
  if (response?.isConfigured) {
    notConfigured.classList.add('hidden');
    configuredSection.classList.remove('hidden');
    dbName.textContent = response.databaseName || 'Database configured';
    loadStats();
    extractData();
  } else if (response?.hasApiKey) {
    notConfigured.classList.remove('hidden');
    notConfigured.querySelector('.hint').textContent = 'API key set but no database selected. Open settings to choose one.';
  } else {
    notConfigured.classList.remove('hidden');
  }
});
