/**
 * LeetArchive Page-World Bridge
 * Runs in "world": "MAIN" on leetcode.com/problems/* and leetcode.cn/problems/*
 *
 * Provides complete, unvirtualized access to Monaco Editor text models.
 */

interface MonacoModel {
  getValue: () => string;
  getLineCount?: () => number;
  getLanguageId?: () => string;
  uri?: { toString: () => string; path?: string };
}

interface MonacoEditorGlobal {
  getModels?: () => MonacoModel[];
  onDidCreateModel?: (callback: (model: MonacoModel) => void) => { dispose: () => void };
}

interface MonacoGlobal {
  editor?: MonacoEditorGlobal;
}

function getMonacoGlobal(): MonacoGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { monaco?: MonacoGlobal }).monaco;
}

/**
 * Selects the most appropriate solution code model from available Monaco models.
 */
function selectSolutionModel(models: MonacoModel[]): MonacoModel | null {
  if (!models || models.length === 0) return null;
  if (models.length === 1) return models[0];

  // 1. Prefer models with known code languages (filter out plaintext, markdown, json)
  const codeModels = models.filter((m) => {
    const lang = typeof m.getLanguageId === 'function' ? m.getLanguageId() : '';
    return lang && lang !== 'plaintext' && lang !== 'markdown' && lang !== 'json';
  });
  if (codeModels.length === 1) {
    return codeModels[0];
  }

  // 2. Check for URI hints
  for (const m of models) {
    const uri = m.uri ? m.uri.toString().toLowerCase() : '';
    if (uri.includes('solution') || uri.includes('code') || uri.includes('editor')) {
      return m;
    }
  }

  // 3. Select model with highest character count among code models or all models
  const candidateList = codeModels.length > 0 ? codeModels : models;
  let best = candidateList[0];
  let maxLen = best.getValue().length;
  for (let i = 1; i < candidateList.length; i++) {
    const val = candidateList[i].getValue();
    if (val.length > maxLen) {
      best = candidateList[i];
      maxLen = val.length;
    }
  }

  return best;
}

/**
 * Extracts solution code from the page's Monaco Editor instance.
 */
function extractFromMonaco(): {
  code: string | null;
  modelCount: number;
  lineCount: number;
  uri?: string;
  language?: string;
} {
  try {
    const monaco = getMonacoGlobal();
    if (!monaco || !monaco.editor || typeof monaco.editor.getModels !== 'function') {
      return { code: null, modelCount: 0, lineCount: 0 };
    }

    const models = monaco.editor.getModels();
    if (!models || models.length === 0) {
      return { code: null, modelCount: 0, lineCount: 0 };
    }

    const model = selectSolutionModel(models);
    if (!model) {
      return { code: null, modelCount: models.length, lineCount: 0 };
    }

    const code = model.getValue();
    const lineCount =
      typeof model.getLineCount === 'function' ? model.getLineCount() : code.split('\n').length;
    const uri = model.uri ? model.uri.toString() : undefined;
    const language = typeof model.getLanguageId === 'function' ? model.getLanguageId() : undefined;

    return {
      code: code || null,
      modelCount: models.length,
      lineCount,
      uri,
      language,
    };
  } catch {
    return { code: null, modelCount: 0, lineCount: 0 };
  }
}

/**
 * Caches extracted code into a hidden DOM element for instant synchronous retrieval by content script.
 */
function syncToDomCache(code: string | null) {
  try {
    if (!code) return;
    let el = document.getElementById('__leetarchive_monaco_cache__');
    if (!el) {
      el = document.createElement('script');
      el.id = '__leetarchive_monaco_cache__';
      el.setAttribute('type', 'text/plain');
      el.style.display = 'none';
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = code;
  } catch {
    // Ignore DOM exceptions
  }
}

function handleExtractRequest(requestId: string) {
  const result = extractFromMonaco();
  syncToDomCache(result.code);

  const detail = {
    type: 'LEETARCHIVE_MONACO_RESPONSE',
    requestId,
    success: Boolean(result.code),
    code: result.code,
    modelCount: result.modelCount,
    lineCount: result.lineCount,
    uri: result.uri,
  };

  // Dispatch CustomEvent on document for isolated world
  try {
    document.dispatchEvent(
      new CustomEvent('LEETARCHIVE_MONACO_RESPONSE', {
        detail,
      }),
    );
  } catch {
    // Ignore event dispatch errors
  }

  // Also postMessage on window as fallback
  try {
    window.postMessage(detail, '*');
  } catch {
    // Ignore postMessage errors
  }
}

// 1. Listen for CustomEvent on document
if (typeof document !== 'undefined') {
  document.addEventListener('LEETARCHIVE_MONACO_REQUEST', (e: Event) => {
    const customEvent = e as CustomEvent<{ requestId?: string }>;
    const requestId = customEvent.detail?.requestId || 'default';
    handleExtractRequest(requestId);
  });
}

// 2. Listen for window.postMessage
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LEETARCHIVE_MONACO_REQUEST') {
      handleExtractRequest(event.data.requestId || 'default');
    }
  });

  // 3. Proactively sync code to DOM cache
  const syncInterval = setInterval(() => {
    const monaco = getMonacoGlobal();
    if (monaco?.editor?.getModels) {
      const res = extractFromMonaco();
      if (res.code) {
        syncToDomCache(res.code);
      }
    }
  }, 1000);

  setTimeout(() => clearInterval(syncInterval), 60000);
}
