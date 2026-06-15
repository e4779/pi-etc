/**
 * layoutProbe — собирает таблицу позиций элементов и их отношений.
 * 
 * Используется через evaluate_script в chrome-devtools:
 *   evaluate_script(layoutProbe({ selectors: { ... } }))
 * 
 * @typedef {{ name: string, text: string, top: number, left: number, bottom: number, right: number, w: number, h: number }} Element
 * @typedef {{ elements: Element[], relations: string[] }} ProbeResult
 *
 * @param {Object} options
 * @param {Object<string,string>} [options.selectors={}]   CSS-селекторы { name: '.class' }
 * @param {HTMLElement[]}      [options.elements=[]]       Готовые DOM-элементы (из evaluate_script args)
 * @param {number}             [options.threshold=2]       Допуск в px для alignment
 * @param {boolean}            [options.relations=true]    Включить вычисление отношений
 * @returns {string} markdown-таблица
 *
 * layoutProbe(options)           → markdown-строка (для чтения агентом)
 * layoutProbe.structured(options) → ProbeResult (для compare)
 * layoutProbe.compare(before, after) → diff-строка
 */

/**
 * Ядро: сбор элементов + вычисление отношений → structured data.
 * @param {Object} options — те же, что у layoutProbe
 * @returns {ProbeResult & { issues?: string[] }}
 */
function probe(options = {}) {
  const {
    selectors = {},
    elements: rawElements = [],
    threshold = 2,
    relations = true,
    issues = true,
    styleAware = false,
    container = '',
    format = 'markdown'
  } = options;

/**
 * Извлечь bounding box + метаданные из DOM-элемента.
 * @param {HTMLElement} el
 * @param {string} name
 * @returns {Element}
 */
function extract(el, name) {
    const r = el.getBoundingClientRect();
    return {
      name,
      text: el.textContent?.trim()?.slice(0, 15),
      top: +r.top.toFixed(1),
      left: +r.left.toFixed(1),
      bottom: +r.bottom.toFixed(1),
      right: +r.right.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
    };
  }

  // 1. Находим элементы: selectors + raw elements (из evaluate_script args / uid)
  const elements = [];

  // 1a. Селекторы (CSS)
  for (const [name, selector] of Object.entries(selectors)) {
    const els = document.querySelectorAll(selector);
    if (els.length === 0) continue;
    const needsIndex = els.length > 1;
    els.forEach((el, idx) => {
      elements.push(extract(el, needsIndex ? `${name}-${idx}` : name));
    });
  }

  // 1b. Готовые DOM-элементы (evaluate_script args — chrome-devtools резолвит uid)
  rawElements.forEach((el, idx) => {
    if (el && el.getBoundingClientRect) {
      elements.push(extract(el, `el-${idx}`));
    }
  });

  // 2. Вычисляем отношения
  const rels = [];
  if (relations && elements.length >= 2) {
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i], b = elements[j];

        // Горизонтальные выравнивания
        align(a, b, 'bottom', threshold, rels);
        align(a, b, 'top', threshold, rels);
        align(a, b, 'left', threshold, rels);
        align(a, b, 'right', threshold, rels);
        centerAlign(a, b, 'x', threshold, rels);
        centerAlign(a, b, 'y', threshold, rels);

        // Горизонтальный gap / overlap
        if (b.left > a.right) {
          rels.push(`${a.name} → ${b.name}: gap=${+(b.left - a.right).toFixed(0)}px`);
        } else if (a.left > b.right) {
          rels.push(`${b.name} → ${a.name}: gap=${+(a.left - b.right).toFixed(0)}px`);
        } else {
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          if (ox > 0) rels.push(`${a.name} ↔ ${b.name}: overlap=${+ox.toFixed(0)}px`);
        }

        // Вертикальный gap / overlap
        if (b.top > a.bottom) {
          rels.push(`${a.name} ↓ ${b.name}: vgap=${+(b.top - a.bottom).toFixed(0)}px`);
        } else if (a.top > b.bottom) {
          rels.push(`${b.name} ↓ ${a.name}: vgap=${+(a.top - b.bottom).toFixed(0)}px`);
        } else {
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (oy > 0) rels.push(`${a.name} ↔ ${b.name}: voverlap=${+oy.toFixed(0)}px`);
        }
      }
    }
  }

  const allIssues = [];
  if (issues) {
    allIssues.push(...analyzeIssues(elements, rels, threshold));
    if (styleAware && container) {
      allIssues.push(...analyzeStyleIssues(elements, container, threshold));
    }
  }

  return { elements, relations: rels, issues: allIssues, format };
}

/**
 * Проверка выравнивания по краю (bottom/top/left/right).
 * @param {Element} a
 * @param {Element} b
 * @param {'bottom'|'top'|'left'|'right'} edge
 * @param {number} threshold
 * @param {string[]} rels — мутабельный массив для добавления relation-строк
 */
function align(a, b, edge, threshold, rels) {
  const diff = Math.abs(a[edge] - b[edge]);
  if (diff < threshold) {
    rels.push(`${a.name} ↔ ${b.name}: ${edge}=${a[edge]}`);
  } else if (diff < threshold + 5) {
    rels.push(`${a.name} ↔ ${b.name}: misalign-${edge}=${diff.toFixed(0)}px`);
  }
}

/**
 * Проверка выравнивания по центру (x или y).
 * @param {Element} a
 * @param {Element} b
 * @param {'x'|'y'} axis
 * @param {number} threshold
 * @param {string[]} rels
 */
function centerAlign(a, b, axis, threshold, rels) {
  const aC = axis === 'x' ? (a.left + a.right) / 2 : (a.top + a.bottom) / 2;
  const bC = axis === 'x' ? (b.left + b.right) / 2 : (b.top + b.bottom) / 2;
  const diff = Math.abs(aC - bC);
  if (diff < threshold) {
    rels.push(`${a.name} ↔ ${b.name}: center-${axis}=${+aC.toFixed(1)}`);
  } else if (diff < threshold + 5) {
    rels.push(`${a.name} ↔ ${b.name}: misalign-center-${axis}=${diff.toFixed(0)}px`);
  }
}

/**
 * Анализирует отношения и генерирует список проблем с подсказками.
 * @param {Element[]} elements
 * @param {string[]} rels
 * @param {number} threshold
 * @returns {string[]}
 */
function analyzeIssues(elements, rels, threshold) {
  const issues = [];

  for (const r of rels) {
    // Misalign — предложить align-items / align-self
    if (r.includes('misalign-bottom') || r.includes('misalign-top')) {
      issues.push(`⚠ ${r}
  → попробуй align-items: center или baseline на родителе`);
    }
    if (r.includes('misalign-left') || r.includes('misalign-right')) {
      issues.push(`⚠ ${r}
  → попробуй justify-content: center или justify-items на родителе`);
    }
    if (r.includes('misalign-center-x') || r.includes('misalign-center-y')) {
      issues.push(`⚠ ${r}
  → проверь margin/padding — элементы не отцентрированы`);
    }

    // Overlap — потенциальный баг
    if (r.includes('overlap=') && !r.includes('voverlap')) {
      issues.push(`⚠ ${r}
  → элементы перекрываются по горизонтали. Проверь width или flex-shrink.`);
    }
    if (r.includes('voverlap=')) {
      issues.push(`⚠ ${r}
  → элементы перекрываются по вертикали. Проверь height или margin.`);
    }
  }

  // Неравномерные gaps между соседними элементами
  for (let i = 0; i < elements.length - 1; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i], b = elements[j];
      // Значительный разрыв (gap > 3x среднего размера элемента)
      const avgW = (a.w + b.w) / 2;
      if (b.left > a.right) {
        const gap = b.left - a.right;
        if (gap > avgW * 3 && gap > 20) {
          issues.push(`⚠ ${a.name} → ${b.name}: большой gap=${+(gap.toFixed(0))}px (>3x средняя ширина ${+avgW.toFixed(0)}px)`);
        }
      }
    }
  }

  return issues;
}

/**
 * Сравнивает заявленные CSS-свойства родителя с фактическими измерениями.
 * @param {Element[]} elements — позиции детей
 * @param {string} containerSelector — CSS-селектор родителя
 * @param {number} threshold
 * @returns {string[]}
 */
function analyzeStyleIssues(elements, containerSelector, threshold) {
  const parent = document.querySelector(containerSelector);
  if (!parent || elements.length < 1) return [];

  const style = getComputedStyle(parent);
  const display = style.display;
  const issues = [];

  // Читаем заявленный gap
  const declaredGap = parseFloat(style.gap) || parseFloat(style.columnGap) || 0;

  // Читаем align-items / justify-content
  const alignItems = style.alignItems;
  const justifyContent = style.justifyContent;

  // Измеряем фактические gaps между соседними детьми
  const gaps = [];
  if (elements.length >= 2) {
    for (let i = 1; i < elements.length; i++) {
      const prev = elements[i - 1];
      const curr = elements[i];
      if (curr.left > prev.right) gaps.push(curr.left - prev.right);
      if (curr.top > prev.bottom) gaps.push(curr.top - prev.bottom);
    }
  }

  // 1. Проверка: заявленный gap != фактический
  if (declaredGap > 0 && gaps.length > 0) {
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (Math.abs(avgGap - declaredGap) > threshold) {
      issues.push(`⚠ CSS gap: ${declaredGap}px → фактический ≈ ${+avgGap.toFixed(0)}px (разница ${+(Math.abs(avgGap - declaredGap)).toFixed(0)}px)`);
    }
  }

  // 2. Проверка align-items
  if (display === 'flex' || display === 'inline-flex') {
    const flexDir = style.flexDirection === 'column' || style.flexDirection === 'column-reverse';

    if (alignItems === 'center') {
      // Все дети должны быть отцентрированы по cross-axis
      const parentRect = parent.getBoundingClientRect();
      const parentCenter = flexDir
        ? (parentRect.left + parentRect.right) / 2
        : (parentRect.top + parentRect.bottom) / 2;

      let misCentered = false;
      for (const el of elements) {
        const elCenter = flexDir
          ? (el.left + el.right) / 2
          : (el.top + el.bottom) / 2;
        if (Math.abs(elCenter - parentCenter) > threshold) {
          misCentered = true;
          break;
        }
      }
      if (misCentered) {
        issues.push(`⚠ align-items: center задан, но дети не отцентрированы`);
      }
    }

    if (alignItems === 'flex-start' || alignItems === 'start') {
      const parentRect = parent.getBoundingClientRect();
      const parentEdge = flexDir ? parentRect.left : parentRect.top;
      let misAligned = false;
      for (const el of elements) {
        const elEdge = flexDir ? el.left : el.top;
        if (Math.abs(elEdge - parentEdge) > threshold + 5) {
          misAligned = true;
          break;
        }
      }
      if (misAligned) {
        issues.push(`⚠ align-items: flex-start задан, но дети не прижаты к краю`);
      }
    }
  }

  // 3. Проверка: grid
  if (display === 'grid' || display === 'inline-grid') {
    const cols = style.gridTemplateColumns;
    if (cols && cols !== 'none') {
      // Проверяем, что дети выровнены по grid-колонкам
      issues.push(`ℹ grid-template-columns: ${cols}`);
    }
  }

  // 4. Проверка justify-content
  if (justifyContent === 'space-between') {
    // Первый и последний должны быть у краёв
    if (elements.length >= 2) {
      const parentRect = parent.getBoundingClientRect();
      const first = elements[0], last = elements[elements.length - 1];
      if (Math.abs(first.left - parentRect.left) > threshold + 5) {
        issues.push(`⚠ justify-content: space-between, но первый элемент не у левого края`);
      }
      if (Math.abs(parentRect.right - last.right) > threshold + 5) {
        issues.push(`⚠ justify-content: space-between, но последний элемент не у правого края`);
      }
    }
  }

  // 5. Проверка gap consistency
  if (gaps.length >= 2) {
    const minGap = Math.min(...gaps);
    const maxGap = Math.max(...gaps);
    if (maxGap - minGap > threshold + 3) {
      issues.push(`⚠ Неравномерные gaps: от ${+minGap.toFixed(0)}px до ${+maxGap.toFixed(0)}px (разброс ${+(maxGap - minGap).toFixed(0)}px)`);
    }
  }

  return issues;
}

/**
 * Сериализация в TOON (Token-Oriented Object Notation).
 * Компактнее markdown на ~30%, парсится toonq/serde_toon.
 * @param {ProbeResult} result
 * @returns {string}
 */
function formatToon({ elements, relations, issues = [] }) {
  const keys = 'name,text,top,left,bottom,right,w,h';
  const lines = [`[${elements.length}]{${keys}}:`];
  for (const e of elements) {
    lines.push(`  ${e.name},${e.text || ''},${e.top},${e.left},${e.bottom},${e.right},${e.w},${e.h}`);
  }
  if (relations.length > 0) {
    lines.push('', `# Relations [${relations.length}]`);
    for (const r of relations) {
      lines.push(`  ${r}`);
    }
  }
  if (issues.length > 0) {
    lines.push('', `# Issues [${issues.length}]`);
    for (const issue of issues) {
      lines.push(`  ${issue.replace(/\n  /g, ' | ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Рендерит structured data в markdown.
 * @param {ProbeResult} result
 * @returns {string}
 */
function formatMarkdown({ elements, relations, issues = [] }) {
  const lines = [];
  lines.push('### Elements', '');
  lines.push('| name | text | top | left | bottom | right | w | h |');
  lines.push('|------|------|-----|------|--------|-------|-----|-----|');
  for (const e of elements) {
    lines.push(`| ${e.name} | ${e.text} | ${e.top} | ${e.left} | ${e.bottom} | ${e.right} | ${e.w} | ${e.h} |`);
  }
  if (relations.length > 0) {
    lines.push('', '### Relations', '');
    for (const r of relations) {
      lines.push(`- ${r}`);
    }
  }
  if (issues.length > 0) {
    lines.push('', '### Issues', '');
    for (const issue of issues) {
      lines.push(issue);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Публичное API
// ---------------------------------------------------------------------------

/**
 * layoutProbe(options) → markdown или TOON-строка.
 * Основной интерфейс для чтения агентом.
 * @param {Object} options
 * @param {'markdown'|'toon'} [options.format='markdown'] — формат вывода
 * @returns {string}
 */
export function layoutProbe(options = {}) {
  const result = probe(options);
  return result.format === 'toon'
    ? formatToon(result)
    : formatMarkdown(result);
}

/**
 * layoutProbe.structured(options) → { elements, relations }.
 * Для программного использования (compare, автоматизация).
 * @param {Object} options
 * @returns {ProbeResult}
 */
layoutProbe.structured = function (options = {}) {
  return probe(options);
};

/**
 * layoutProbe.compare(before, after) → diff-строка.
 * Принимает structured-объекты (результат layoutProbe.structured()).
 * @param {ProbeResult} before
 * @param {ProbeResult} after
 * @returns {string} diff в формате "~ name.key: old → new" / "+/- relation: ..."
 */
layoutProbe.compare = function (before, after) {
  const changes = [];

  // Индексируем элементы по имени
  const beforeMap = Object.fromEntries((before.elements || []).map(e => [e.name, e]));
  const afterMap = Object.fromEntries((after.elements || []).map(e => [e.name, e]));

  const allNames = new Set([
    ...Object.keys(beforeMap),
    ...Object.keys(afterMap),
  ]);

  for (const name of allNames) {
    const b = beforeMap[name];
    const a = afterMap[name];

    if (!b) {
      changes.push(`+ ${name}: NEW (${a.text || '-'}, ${a.top},${a.left}→${a.bottom},${a.right})`);
      continue;
    }
    if (!a) {
      changes.push(`- ${name}: REMOVED`);
      continue;
    }

    for (const key of ['text', 'top', 'left', 'bottom', 'right', 'w', 'h']) {
      if (b[key] !== a[key]) {
        changes.push(`~ ${name}.${key}: ${b[key]} → ${a[key]}`);
      }
    }
  }

  // Relations
  const beforeRels = before.relations || [];
  const afterRels = after.relations || [];

  for (const r of afterRels) {
    if (!beforeRels.includes(r)) changes.push(`+ relation: ${r}`);
  }
  for (const r of beforeRels) {
    if (!afterRels.includes(r)) changes.push(`- relation: ${r}`);
  }

  return changes.length > 0 ? changes.join('\n') : 'No changes detected.';
};

// ---------------------------------------------------------------------------
// Шаблоны для частых проверок
// ---------------------------------------------------------------------------

/**
 * Собрать детей родительского элемента как именованный объект.
 * @param {string} parentSelector — CSS-селектор родителя
 * @returns {Object<string,HTMLElement>} { 'child-0': el, 'child-1': el, ... }
 */
function collectChildren(parentSelector) {
  const parent = document.querySelector(parentSelector);
  if (!parent) return {};
  const result = {};
  [...parent.children].forEach((el, i) => {
    result[`child-${i}`] = el;
  });
  return result;
}

/**
 * Шаблон: flex-строка.
 * Все прямые дети выбранного элемента — проверка горизонтального выравнивания.
 *
 * @param {string} parentSelector — CSS-селектор родителя (например, '.row')
 * @param {Object} [options={}] — дополнительные опции layoutProbe
 * @returns {string} markdown
 *
 * @example
 *   layoutProbe.row('.react-js-cron-field')
 */
layoutProbe.row = function (parentSelector, options = {}) {
  const children = collectChildren(parentSelector);
  return layoutProbe({ ...options, container: parentSelector, styleAware: options.styleAware !== false, elements: Object.values(children) });
};

/**
 * Шаблон: flex-колонка.
 * Все прямые дети — проверка вертикального выравнивания.
 *
 * @param {string} parentSelector
 * @param {Object} [options={}]
 * @returns {string} markdown
 *
 * @example
 *   layoutProbe.column('.form-stack')
 */
layoutProbe.column = function (parentSelector, options = {}) {
  const children = collectChildren(parentSelector);
  return layoutProbe({ ...options, container: parentSelector, styleAware: options.styleAware !== false, elements: Object.values(children) });
};

/**
 * Шаблон: grid-сетка.
 * Все прямые дети — проверка и горизонтального, и вертикального выравнивания.
 *
 * @param {string} parentSelector
 * @param {Object} [options={}]
 * @returns {string} markdown
 *
 * @example
 *   layoutProbe.grid('.card-grid')
 */
layoutProbe.grid = function (parentSelector, options = {}) {
  const children = collectChildren(parentSelector);
  return layoutProbe({ ...options, container: parentSelector, styleAware: options.styleAware !== false, elements: Object.values(children) });
};
