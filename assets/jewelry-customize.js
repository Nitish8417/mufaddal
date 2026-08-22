import { ThemeEvents } from '@theme/events';

/**
 * Turns metafield text into separate "pills" like variant options.
 * @param {unknown} raw
 * @param {'numericRange'|'slashList'|'flexList'} kind
 * @returns {string[]}
 */
function splitMetafieldTextIntoPills(raw, kind) {
  const s0 = toText(raw);
  if (!s0) return [];
  let s = s0.trim();
  if (!s || s === '—') return [];

  // If it comes from Shopify as a JSON array string: ["2.59"] or ["VS1-G", "VVS..."]
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length) {
        // Flatten arrays by recursively splitting each entry once.
        return parsed.flatMap((entry) => splitMetafieldTextIntoPills(entry, kind));
      }
    } catch {
      // fall through
    }
  }

  if (kind === 'flexList') {
    // Natural-language lists: "Emerald, Ruby, and Sapphire" / "E, F, G, and H" / "A / B / C"
    let t = s;
    t = t.replace(/\s*,\s*and\s+/gi, ',');
    if (!t.includes(',') && !t.includes('/') && !t.includes(';') && /\s+and\s+/i.test(t)) {
      t = t.replace(/\s+and\s+/gi, ',');
    }
    if (t.includes('/')) {
      return t
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    if (t.includes(';')) {
      return t
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (kind === 'slashList') {
    if (s.includes('/')) {
      return s
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [s];
  }

  // numericRange
  // First: split by "•"
  if (s.includes('•')) {
    return s
      .split('•')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.match(/[\d]+(?:[.,]\d+)?/)?.[0] ?? x);
  }

  // Then: split by hyphen only when it's clearly a numeric range.
  if (/\d\s*[-–—]\s*\d/.test(s)) {
    return s
      .split(/\s*[-–—]\s*/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.match(/[\d]+(?:[.,]\d+)?/)?.[0] ?? x);
  }

  // Fallback: extract numbers
  const matches = s.match(/[\d]+(?:[.,]\d+)?/g);
  if (matches?.length) {
    return matches.map((m) => m.replace(',', '.'));
  }

  return [s];
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {string} fieldKey
 */
function clearMfFieldDataset(dialog, fieldKey) {
  if (fieldKey === 'gold') dialog.dataset.mfGoldText = '';
  if (fieldKey === 'diamond') dialog.dataset.mfDiamondText = '';
  if (fieldKey === 'stone-type') dialog.dataset.mfStoneTypeText = '';
  if (fieldKey === 'diamond-color') dialog.dataset.mfDiamondColorText = '';
}

const MF_FIELD_ORDER = ['diamond', 'stone-type', 'gold', 'diamond-color'];
/** @type {WeakMap<HTMLDialogElement, Record<string, string>>} */
const mfFieldTemplates = new WeakMap();

/**
 * Ensures catalog fieldset exists for a field key.
 * Recreates it from initial template if it was removed earlier.
 * @param {HTMLDialogElement} dialog
 * @param {'gold'|'diamond'|'stone-type'|'diamond-color'} fieldKey
 * @returns {HTMLElement|null}
 */
function ensureMfFieldWrap(dialog, fieldKey) {
  /** @type {Record<string, string>} */
  const templates = mfFieldTemplates.get(dialog) || {};
  if (!mfFieldTemplates.has(dialog)) {
    dialog.querySelectorAll('[data-jewelry-mf-field-wrap]').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const key = toText(el.dataset.jewelryMfFieldWrap);
      if (key) templates[key] = el.outerHTML;
    });
    mfFieldTemplates.set(dialog, templates);
  }

  const existing = dialog.querySelector(`[data-jewelry-mf-field-wrap="${fieldKey}"]`);
  if (existing instanceof HTMLElement) return existing;

  const html = templates[fieldKey];
  if (!html) return null;

  const picker =
    fieldKey === 'diamond-color'
      ? dialog.querySelector('[data-jewelry-spec-mf-anchor]')
      : dialog.querySelector('.jewelry-customize__catalog-variant-picker');
  if (!(picker instanceof HTMLElement)) return null;

  const temp = document.createElement('template');
  temp.innerHTML = html.trim();
  const nextWrap = temp.content.firstElementChild;
  if (!(nextWrap instanceof HTMLElement)) return null;

  const currentIdx = MF_FIELD_ORDER.indexOf(fieldKey);
  let inserted = false;
  for (let i = currentIdx + 1; i < MF_FIELD_ORDER.length; i += 1) {
    const sibling = dialog.querySelector(`[data-jewelry-mf-field-wrap="${MF_FIELD_ORDER[i]}"]`);
    if (sibling instanceof HTMLElement && sibling.parentElement === picker) {
      picker.insertBefore(nextWrap, sibling);
      inserted = true;
      break;
    }
  }
  if (!inserted) picker.appendChild(nextWrap);

  return nextWrap;
}

/**
 * Shows the catalog metafields block only when at least one row has data.
 * @param {HTMLDialogElement} dialog
 */
function updateJewelryCatalogVisibility(dialog) {
  const block = dialog.querySelector('[data-jewelry-catalog-block]');
  if (!(block instanceof HTMLElement)) return;
  const wraps = dialog.querySelectorAll('[data-jewelry-mf-field-wrap]');
  let anyVisible = false;
  wraps.forEach((w) => {
    if (w instanceof HTMLElement && !w.hidden) anyVisible = true;
  });
  block.hidden = !anyVisible;
}

/**
 * @param {string} label
 * @returns {'color'|'ring'|'diamond'|'gold'|'stone'|'default'}
 */
function getJewelryFieldIconKey(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('color')) return 'color';
  if (l.includes('ring') || l.includes('size')) return 'ring';
  if (l.includes('clarity') || l.includes('diamond')) return 'diamond';
  if (l.includes('gold')) return 'gold';
  if (l.includes('stone')) return 'stone';
  return 'default';
}

/**
 * @param {HTMLElement | null} labelEl
 * @param {string} labelText
 */
function ensureFieldIcon(labelEl, labelText) {
  if (!(labelEl instanceof HTMLElement)) return;
  if (labelEl.querySelector('.jewelry-customize__field-icon')) return;
  const icon = document.createElement('span');
  icon.className = 'jewelry-customize__field-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset.icon = getJewelryFieldIconKey(labelText);
  labelEl.prepend(icon);
}

/**
 * @returns {string}
 */
function getThemeMoneyFormat() {
  const moneyMeta = document.querySelector('meta[name="money-format"]');
  return moneyMeta instanceof HTMLMetaElement && moneyMeta.content ? moneyMeta.content : '{{amount}}';
}

/**
 * @param {number} amountMinor
 * @returns {string}
 */
function formatThemeMoney(amountMinor) {
  const ShopifyAny = /** @type {any} */ (window).Shopify;
  if (ShopifyAny?.formatMoney) return ShopifyAny.formatMoney(amountMinor, getThemeMoneyFormat());
  const value = (Number(amountMinor || 0) / 100).toFixed(2);
  return `${value}`;
}

/** @type {Record<string, number>} */
const _diamondSurchargePriceCache = {};

/** @type {Record<string, Promise<number>>} */
const _diamondSurchargePriceRequests = {};

/** @type {Record<string, number>} */
const _diamondColorSurchargePriceCache = {};

/** @type {Record<string, Promise<number>>} */
const _diamondColorSurchargePriceRequests = {};

/**
 * @param {string} value
 * @returns {string[]}
 */
function getDiamondWeightLookupKeys(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const keys = [raw];
  const num = Number(raw);
  if (Number.isFinite(num)) {
    const fixed2 = num.toFixed(2);
    if (!keys.includes(fixed2)) keys.push(fixed2);
    const intStr = String(num);
    if (!keys.includes(intStr)) keys.push(intStr);
  }
  return keys;
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function getDiamondColorLookupKeys(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const keys = [raw];
  const upper = raw.toUpperCase();
  if (!keys.includes(upper)) keys.push(upper);
  const lower = raw.toLowerCase();
  if (!keys.includes(lower)) keys.push(lower);
  return keys;
}

/**
 * Fetches surcharge price from Shopify variant API for a given diamond weight value.
 * @param {string} value
 * @returns {Promise<number>}
 */
async function getDiamondSurchargePrice(value) {
  const pricesMap = /** @type {Record<string, number>} */ ((/** @type {any} */ (window).__diamondWeightPrices) || {});
  const variantIdsMap = /** @type {Record<string, number>} */ ((/** @type {any} */ (window).__diamondWeightVariantIds) || {});
  const keys = getDiamondWeightLookupKeys(value);

  for (const key of keys) {
    if (typeof _diamondSurchargePriceCache[key] === 'number') return _diamondSurchargePriceCache[key];
    if (typeof pricesMap[key] === 'number') {
      _diamondSurchargePriceCache[key] = pricesMap[key];
      return pricesMap[key];
    }
  }

  let resolvedKey = '';
  let variantId = 0;
  for (const key of keys) {
    const id = Number(variantIdsMap[key]);
    if (Number.isFinite(id) && id > 0) {
      resolvedKey = key;
      variantId = id;
      break;
    }
  }
  if (!variantId || !resolvedKey) return 0;

  if (!_diamondSurchargePriceRequests[resolvedKey]) {
    _diamondSurchargePriceRequests[resolvedKey] = fetch(`/variants/${variantId}.js`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return 0;
        const data = await res.json().catch(() => null);
        return typeof data?.price === 'number' && !isNaN(data.price) ? data.price : 0;
      })
      .catch(() => 0)
      .then((price) => {
        _diamondSurchargePriceCache[resolvedKey] = price;
        pricesMap[resolvedKey] = price;
        return price;
      });
  }

  return _diamondSurchargePriceRequests[resolvedKey] || Promise.resolve(0);
}

/**
 * @param {string} value
 * @returns {Promise<number>}
 */
async function getDiamondColorSurchargePrice(value) {
  const pricesMap = /** @type {Record<string, number>} */ ((/** @type {any} */ (window).__diamondColorPrices) || {});
  const variantIdsMap = /** @type {Record<string, number>} */ ((/** @type {any} */ (window).__diamondColorVariantIds) || {});
  const keys = getDiamondColorLookupKeys(value);

  for (const key of keys) {
    if (typeof _diamondColorSurchargePriceCache[key] === 'number') return _diamondColorSurchargePriceCache[key];
    if (typeof pricesMap[key] === 'number') {
      _diamondColorSurchargePriceCache[key] = pricesMap[key];
      return pricesMap[key];
    }
  }

  let resolvedKey = '';
  let variantId = 0;
  for (const key of keys) {
    const id = Number(variantIdsMap[key]);
    if (Number.isFinite(id) && id > 0) {
      resolvedKey = key;
      variantId = id;
      break;
    }
  }
  if (!variantId || !resolvedKey) return 0;

  if (!_diamondColorSurchargePriceRequests[resolvedKey]) {
    _diamondColorSurchargePriceRequests[resolvedKey] = fetch(`/variants/${variantId}.js`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return 0;
        const data = await res.json().catch(() => null);
        return typeof data?.price === 'number' && !isNaN(data.price) ? data.price : 0;
      })
      .catch(() => 0)
      .then((price) => {
        _diamondColorSurchargePriceCache[resolvedKey] = price;
        for (const k of keys) {
          pricesMap[k] = price;
        }
        return price;
      });
  }

  return _diamondColorSurchargePriceRequests[resolvedKey] || Promise.resolve(0);
}

/**
 * Convert variant button fieldsets into dropdowns inside the customize modal.
 * Keeps original radios in DOM (hidden) so theme variant logic still works.
 * @param {HTMLDialogElement} dialog
 */
function renderVariantOptionDropdowns(dialog) {
  const variantWrapper = dialog.querySelector('.jewelry-customize__panel .jewelry-customize__variant-picker-wrapper');
  if (!(variantWrapper instanceof HTMLElement)) return;
  variantWrapper.classList.add('jewelry-customize__variant-picker-wrapper--dropdown');

  variantWrapper.querySelectorAll('[data-jewelry-generated-dropdown]').forEach((el) => el.remove());

  const fieldsets = variantWrapper.querySelectorAll('fieldset.variant-option--buttons');
  fieldsets.forEach((fieldset, fieldsetIndex) => {
    if (!(fieldset instanceof HTMLFieldSetElement)) return;
    if (fieldset.closest('[data-jewelry-mf-field-wrap]')) return;

    const legendEl = fieldset.querySelector('legend');
    let legendText = '';
    if (legendEl) {
      const textNode = Array.from(legendEl.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
      legendText = (textNode?.textContent || legendEl.textContent || '').trim();
    }
    if (!legendText) legendText = `Option ${fieldsetIndex + 1}`;
    ensureFieldIcon(legendEl, legendText);
    if (fieldset.classList.contains('variant-option--swatches')) return;

    const radioInputs = Array.from(fieldset.querySelectorAll('input[type="radio"]')).filter(
      (el) => el instanceof HTMLInputElement
    );
    if (!radioInputs.length) return;

    const optionWrap = document.createElement('div');
    optionWrap.className = 'variant-option variant-option--dropdowns jewelry-customize__generated-dropdown';
    optionWrap.setAttribute('data-jewelry-generated-dropdown', String(fieldsetIndex));

    const label = document.createElement('label');
    const selectId = `JewelryCustomizeOption-${dialog.dataset.sectionId || 'section'}-${fieldsetIndex}`;
    label.setAttribute('for', selectId);
    label.textContent = legendText;
    ensureFieldIcon(label, legendText);

    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'variant-option__select-wrapper';

    const select = document.createElement('select');
    select.id = selectId;
    select.className = 'variant-option__select';
    select.name = `options[${legendText}]`;

    radioInputs.forEach((radio) => {
      const option = document.createElement('option');
      option.value = radio.value;
      option.textContent = radio.value;
      option.selected = radio.checked;
      if (radio.disabled || radio.getAttribute('aria-disabled') === 'true') option.disabled = true;

      const inputId = radio.getAttribute('data-input-id');
      const optionValueId = radio.getAttribute('data-option-value-id');
      const variantId = radio.getAttribute('data-variant-id');
      const connectedProductUrl = radio.getAttribute('data-connected-product-url');
      if (inputId) option.setAttribute('data-input-id', inputId);
      if (optionValueId) option.setAttribute('data-option-value-id', optionValueId);
      if (variantId) option.setAttribute('data-variant-id', variantId);
      if (connectedProductUrl) option.setAttribute('data-connected-product-url', connectedProductUrl);

      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      const selectedRadio = radioInputs.find((radio) => radio.value === select.value);
      if (!selectedRadio) return;
      selectedRadio.checked = true;
      selectedRadio.dispatchEvent(new Event('change', { bubbles: true }));
    });

    selectWrapper.appendChild(select);
    optionWrap.appendChild(label);
    optionWrap.appendChild(selectWrapper);
    fieldset.insertAdjacentElement('afterend', optionWrap);
  });
}

/**
 * Diamond color fieldset lives in the Jewelry specifications column (not Precious details).
 * @param {HTMLDialogElement} dialog
 * @param {boolean} visible
 */
function setJewelrySpecDiamondColorWrapVisible(dialog, visible) {
  const el = dialog.querySelector('.jewelry-customize__spec-diamond-color-wrap');
  if (!(el instanceof HTMLElement)) return;
  el.hidden = !visible;
}

/**
 * Renders catalog values as dropdown options.
 * @param {HTMLDialogElement} dialog
 * @param {'gold'|'diamond'|'stone-type'|'diamond-color'} fieldKey
 * @param {unknown} rawText
 */
function renderCatalogWeightPills(dialog, fieldKey, rawText) {
  const wrap = ensureMfFieldWrap(dialog, fieldKey);
  const optionsContainer =
    wrap instanceof HTMLElement
      ? wrap.querySelector(`[data-jewelry-mf-pill-options="${fieldKey}"]`)
      : dialog.querySelector(`[data-jewelry-mf-pill-options="${fieldKey}"]`);
  if (!(optionsContainer instanceof HTMLElement)) return;

  const s0 = toText(rawText);
  if (!s0 || s0 === '—') {
    optionsContainer.innerHTML = '';
    if (wrap instanceof HTMLElement) wrap.remove();
    clearMfFieldDataset(dialog, fieldKey);
    if (fieldKey === 'diamond-color') {
      setJewelrySpecDiamondColorWrapVisible(dialog, false);
      const setFn = /** @type {any} */ (window).__setJewelryDiamondColorForPricing;
      if (typeof setFn === 'function') setFn('');
    }
    if (fieldKey === 'diamond') {
      const restore = /** @type {any} */ (window).__restoreDiamondWeightFromPdpPicker;
      if (typeof restore === 'function') restore();
    }
    return;
  }

  if (wrap instanceof HTMLElement) wrap.hidden = false;
  if (fieldKey === 'diamond-color') setJewelrySpecDiamondColorWrapVisible(dialog, true);

  const pillKind =
    fieldKey === 'stone-type' || fieldKey === 'diamond-color' ? 'flexList' : 'numericRange';

  const pills = splitMetafieldTextIntoPills(rawText, pillKind);
  const displayValues = (pills.length ? pills : [s0]).filter((v) => {
    const t = toText(v);
    if (!t) return false;
    if (t === '—') return false;
    if (t === '[]') return false;
    return true;
  });
  if (!displayValues.length) {
    optionsContainer.innerHTML = '';
    if (wrap instanceof HTMLElement) wrap.remove();
    clearMfFieldDataset(dialog, fieldKey);
    if (fieldKey === 'diamond-color') {
      setJewelrySpecDiamondColorWrapVisible(dialog, false);
      const setFn = /** @type {any} */ (window).__setJewelryDiamondColorForPricing;
      if (typeof setFn === 'function') setFn('');
    }
    if (fieldKey === 'diamond') {
      const restore = /** @type {any} */ (window).__restoreDiamondWeightFromPdpPicker;
      if (typeof restore === 'function') restore();
    }
    return;
  }
  const selectedValue = String(displayValues[0] ?? '');

  optionsContainer.innerHTML = '';
  const select =
    fieldKey === 'gold'
      ? null
      : /** @type {HTMLSelectElement} */ (document.createElement('select'));
  if (select) {
    select.className = 'variant-option__select';
    select.setAttribute('data-jewelry-mf-select', fieldKey);
  }
  // Keep dataset in sync with the selected value (first one by default).
  if (fieldKey === 'gold') dialog.dataset.mfGoldText = selectedValue;
  if (fieldKey === 'diamond') dialog.dataset.mfDiamondText = selectedValue;
  if (fieldKey === 'stone-type') dialog.dataset.mfStoneTypeText = selectedValue;
  if (fieldKey === 'diamond-color') dialog.dataset.mfDiamondColorText = selectedValue;

  displayValues.forEach((value, idx) => {
    const valueStr = String(value);
    if (fieldKey === 'gold') {
      const label = document.createElement('label');
      label.className = 'variant-option__button-label';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `jewelry-mf-${fieldKey}-${dialog.dataset.sectionId || 'section'}`;
      input.value = valueStr;
      input.setAttribute('data-option-available', 'true');
      input.setAttribute('data-previous-checked', 'false');
      input.setAttribute('data-current-checked', idx === 0 ? 'true' : 'false');
      input.checked = idx === 0;

      const pill = document.createElement('span');
      pill.className = 'variant-option__button-label__pill';
      pill.setAttribute('data-key', 'variant-option-pill');

      const text = document.createElement('span');
      text.className = 'variant-option__button-label__text';
      text.setAttribute('data-key', 'variant-option-text');
      text.textContent = valueStr;

      label.appendChild(input);
      label.appendChild(pill);
      label.appendChild(text);
      optionsContainer.appendChild(label);

      input.addEventListener('change', () => {
        if (!input.checked) return;
        dialog.dataset.mfGoldText = input.value;
        optionsContainer.querySelectorAll('input[type="radio"]').forEach((el) => {
          if (!(el instanceof HTMLInputElement)) return;
          el.setAttribute('data-current-checked', el === input ? 'true' : 'false');
        });
      });
      return;
    }

    const option = document.createElement('option');
    option.value = valueStr;
    if (fieldKey === 'diamond') {
      option.textContent = valueStr;
    } else if (fieldKey === 'diamond-color') {
      option.textContent = valueStr;
    } else {
      option.textContent = valueStr;
    }
    option.selected = idx === 0;
    if (select) select.appendChild(option);
  });

  if (select) {
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'variant-option__select-wrapper';
    selectWrapper.appendChild(select);
    optionsContainer.appendChild(selectWrapper);

    select.addEventListener('change', () => {
      const val = select.value;
      if (fieldKey === 'diamond') {
        dialog.dataset.mfDiamondText = val;
        const wf = /** @type {any} */ (window).__setJewelryModalDiamondWeightForPricing;
        if (typeof wf === 'function') wf(val);
      }
      if (fieldKey === 'stone-type') dialog.dataset.mfStoneTypeText = val;
      if (fieldKey === 'diamond-color') {
        dialog.dataset.mfDiamondColorText = val;
        const setFn = /** @type {any} */ (window).__setJewelryDiamondColorForPricing;
        if (typeof setFn === 'function') setFn(val);
      }
    });

    if (fieldKey === 'diamond') {
      const wf = /** @type {any} */ (window).__setJewelryModalDiamondWeightForPricing;
      if (typeof wf === 'function') wf(dialog.dataset.mfDiamondText || '');
    }

    if (fieldKey === 'diamond-color') {
      const setFn = /** @type {any} */ (window).__setJewelryDiamondColorForPricing;
      if (typeof setFn === 'function') setFn(dialog.dataset.mfDiamondColorText || '');
    }
  }
}

/**
 * @param {HTMLDialogElement} dialog
 * @returns {any|null}
 */
function getVariantFromPicker(dialog) {
  const picker = dialog.querySelector('variant-picker');
  const json = picker?.querySelector('script[type="application/json"]')?.textContent;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {HTMLDialogElement} dialog
 * @returns {Record<string, any> | null}
 */
function getJewelryVariantMetafieldsMap(dialog) {
  const el = dialog.querySelector('script[type="application/json"][data-jewelry-variant-metafields]');
  if (!el) return null;
  const raw = el.textContent || '';
  if (!raw.trim()) return null;
  try {
    // @ts-ignore - runtime JSON
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    // Shopify metafield JSON sometimes includes { value: ... }
    // or can serialize as the value directly.
    if ('value' in value) return toText(value.value);
    return '';
  }
  return '';
}

/**
 * Syncs modal picker controls to the currently selected variant options.
 * @param {HTMLDialogElement} dialog
 * @param {any[]} variantOptions
 */
function syncVariantPickerControls(dialog, variantOptions) {
  if (!(dialog instanceof HTMLDialogElement)) return;
  const options = Array.isArray(variantOptions) ? variantOptions.map((v) => toText(v)) : [];

  // Button/swatch radios
  dialog.querySelectorAll('variant-picker fieldset[data-fieldset-index]').forEach((fieldset) => {
    if (!(fieldset instanceof HTMLFieldSetElement)) return;
    const idx = Number(fieldset.dataset.fieldsetIndex);
    if (!Number.isFinite(idx)) return;
    const nextValue = options[idx];
    if (!nextValue) return;

    const radios = fieldset.querySelectorAll('input[type="radio"]');
    let matched = false;
    radios.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const isMatch = toText(input.value) === nextValue;
      input.checked = isMatch;
      input.setAttribute('data-current-checked', isMatch ? 'true' : 'false');
      if (isMatch) matched = true;
    });

    // Keep swatch legend value in sync (Color Yellow, etc).
    if (matched) {
      const swatchValue = fieldset.querySelector('.variant-option__swatch-value');
      if (swatchValue instanceof HTMLElement) swatchValue.textContent = nextValue;
    }
  });

  // Native selects (if dropdown picker style is used)
  dialog.querySelectorAll('variant-picker select.variant-option__select').forEach((select, idx) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const nextValue = options[idx];
    if (!nextValue) return;
    const optionToSelect = Array.from(select.options).find((opt) => toText(opt.value) === nextValue);
    if (optionToSelect) select.value = optionToSelect.value;
  });
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {any} variant
 */
function syncDialogToVariant(dialog, variant) {
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (!variant) return;

  const variantId = toText(variant.id);

  const metafieldsMap = getJewelryVariantMetafieldsMap(dialog);
  const mapped = metafieldsMap && variantId ? metafieldsMap[variantId] : null;

  const productGoldFallback = toText(dialog.dataset.productMfGoldText);
  const productDiamondFallback = toText(dialog.dataset.productMfDiamondText);
  const productStoneFallback = toText(dialog.dataset.productMfStoneTypeText);
  const productDiamondColorFallback = toText(dialog.dataset.productMfDiamondColorText);

  // Prefer our Liquid-rendered mapping so we don't depend on JS variant JSON including metafields.
  const goldText =
    toText(mapped?.gold_weight) ||
    toText(variant.metafields?.custom?.gold_weight) ||
    productGoldFallback ||
    '';

  const diamondText =
    toText(mapped?.diamond_weight) ||
    toText(variant.metafields?.custom?.diamond_weight) ||
    productDiamondFallback ||
    '';

  const stoneTypeText =
    toText(mapped?.stone_type) ||
    toText(variant.metafields?.custom?.stone_type) ||
    productStoneFallback ||
    '';

  const diamondColorText =
    toText(mapped?.diamond_color) ||
    toText(variant.metafields?.custom?.diamond_color) ||
    productDiamondColorFallback ||
    '';

  dialog.dataset.mfGoldText = goldText;
  dialog.dataset.mfDiamondText = diamondText;
  dialog.dataset.mfStoneTypeText = stoneTypeText;
  dialog.dataset.mfDiamondColorText = diamondColorText;
  syncVariantPickerControls(dialog, variant.options);

  // Render weight pills as multi-value blocks.
  renderCatalogWeightPills(dialog, 'diamond', diamondText);
  renderCatalogWeightPills(dialog, 'stone-type', stoneTypeText);
  renderCatalogWeightPills(dialog, 'gold', goldText);
  renderCatalogWeightPills(dialog, 'diamond-color', diamondColorText);
  renderVariantOptionDropdowns(dialog);

  updateJewelryCatalogVisibility(dialog);

  dialog.dataset.requestedVariantId = toText(variant.id) || dialog.dataset.requestedVariantId;
  dialog.dataset.requestedVariantTitle = toText(variant.title) || dialog.dataset.requestedVariantTitle;
  dialog.dataset.requestedVariantAvailable = String(Boolean(variant.available));

  // Sync option values used for quote properties (data-jewelry-variant-option)
  const variantOptions = Array.isArray(variant.options) ? variant.options : [];
  const rows = dialog.querySelectorAll('[data-jewelry-variant-option]');
  rows.forEach((row, idx) => {
    if (!(row instanceof HTMLElement)) return;
    const nextValue = variantOptions[idx];
    if (nextValue != null) row.dataset.optionValue = toText(nextValue);
  });
}

/**
 * @param {HTMLFormElement} form
 * @returns {number}
 */
function getFormQuantity(form) {
  const qtyInput = form.querySelector('input[name="quantity"]');
  const qty = qtyInput instanceof HTMLInputElement ? Number(qtyInput.value) : 1;
  return Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
}

/**
 * @param {HTMLDialogElement} dialog
 * @returns {Record<string, string>}
 */
function collectJewelryProperties(dialog) {
  /** @type {Record<string, string>} */
  const properties = {};

  const requestedId = (dialog.dataset.requestedVariantId || '').trim();
  if (requestedId) properties._requested_variant_id = requestedId;
  properties['Selected variant id'] = requestedId || '—';

  dialog.querySelectorAll('[data-jewelry-variant-option]').forEach((row) => {
    const label = row instanceof HTMLElement ? row.dataset.optionLabel?.trim() : '';
    const value = row instanceof HTMLElement ? row.dataset.optionValue?.trim() : '';
    if (label) properties[label] = value || '—';
  });

  dialog.querySelectorAll('[data-jewelry-static-property]').forEach((row) => {
    const label = row instanceof HTMLElement ? row.dataset.propertyLabel?.trim() : '';
    const value = row instanceof HTMLElement ? row.dataset.propertyValue?.trim() : '';
    if (label && value) properties[label] = value;
  });

  const goldDisplay = (dialog.dataset.mfGoldText || '').trim();
  const diamondDisplay = (dialog.dataset.mfDiamondText || '').trim();
  const stoneTypeDisplay = (dialog.dataset.mfStoneTypeText || '').trim();
  const diamondColorDisplay = (dialog.dataset.mfDiamondColorText || '').trim();

  if (goldDisplay && goldDisplay !== '—') properties['Gold weight'] = goldDisplay;
  if (diamondDisplay && diamondDisplay !== '—') properties['Diamond weight'] = diamondDisplay;
  if (stoneTypeDisplay && stoneTypeDisplay !== '—') properties['Stone type'] = stoneTypeDisplay;
  if (diamondColorDisplay && diamondColorDisplay !== '—') properties['Diamond color'] = diamondColorDisplay;

  return properties;
}

/**
 * @param {Record<string, string>} properties
 * @returns {string[]}
 */
function buildPropertyLines(properties) {
  return Object.entries(properties)
    .filter(([key, value]) => {
      if (key.startsWith('_')) return false;
      if (key === 'Selected variant id') return false;
      const text = toText(value);
      return Boolean(text) && text !== '—';
    })
    .map(([key, value]) => `- ${key}: ${value}`);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {number} quantity
 * @param {Record<string, string>} properties
 * @returns {string}
 */
function buildWhatsappMessage(dialog, quantity, properties) {
  const productTitle = (dialog.dataset.productTitle || '').trim();
  const requestedVariantTitle = (dialog.dataset.requestedVariantTitle || '').trim();
  const storeName = (dialog.dataset.storeName || '').trim();
  const storeUrl = (dialog.dataset.storeUrl || '').trim();
  const headerText = (dialog.dataset.whatsappHeader || '').trim() || 'Customization Request';
  const footerText = (dialog.dataset.whatsappFooter || '').trim();
  const propertyLines = buildPropertyLines(properties);
  /** @type {string[]} */
  const messageLines = [];

  messageLines.push(`*${headerText}*`);
  if (storeName) messageLines.push(storeName);
  if (storeUrl) messageLines.push(`Website: ${storeUrl}`);

  messageLines.push('', '*Order Summary*');
  messageLines.push(`- Product: ${productTitle || 'N/A'}`);
  messageLines.push(`- Variant: ${requestedVariantTitle || 'N/A'}`);
  messageLines.push(`- Quantity: ${quantity}`);

  if (propertyLines.length) {
    messageLines.push('', '*Customization Details*', ...propertyLines);
  }

  if (footerText) {
    messageLines.push('', '---', footerText);
  }

  return messageLines.join('\n').trim();
}

/**
 * @param {string} sectionId
 */
function initJewelryCustomize(sectionId) {
  const sectionEl = document.getElementById(`shopify-section-${sectionId}`);
  const dialog = sectionEl?.querySelector('dialog.jewelry-customize');
  if (!(dialog instanceof HTMLDialogElement) || !sectionEl) return;

  const form = sectionEl.querySelector(`product-form-component form[data-type="add-to-cart-form"]`);
  if (!(form instanceof HTMLFormElement)) return;
  /** @type {any | null} */
  let latestVariant = getVariantFromPicker(dialog);

  const openModal = () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    requestAnimationFrame(() => {
      const v = latestVariant || getVariantFromPicker(dialog);
      if (v) syncDialogToVariant(dialog, v);
      const refresh = /** @type {any} */ (window).__refreshJewelryPricingDisplays;
      if (typeof refresh === 'function') refresh();
    });
  };

  const onVariantUpdate = (/** @type {Event} */ event) => {
    const ev = /** @type {any} */ (event);
    const variant = ev.detail?.resource || ev.detail?.variant;
    if (!variant) return;
    latestVariant = variant;
    syncDialogToVariant(dialog, variant);
  };

  sectionEl.addEventListener(ThemeEvents.variantUpdate, onVariantUpdate);
  dialog.addEventListener(ThemeEvents.variantUpdate, onVariantUpdate);

  sectionEl.addEventListener(
    'click',
    (e) => {
      const t = e.target instanceof Element ? e.target.closest('[data-jewelry-customize-open]') : null;
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      openModal();
    },
    true
  );

  dialog.querySelectorAll('[data-jewelry-customize-close]').forEach((btn) => {
    btn.addEventListener('click', () => dialog.close());
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.querySelector('[data-jewelry-confirm]')?.addEventListener('click', () => {
    const requestedId = (dialog.dataset.requestedVariantId || '').trim();
    const whatsappNumber = (dialog.dataset.whatsappNumber || '').replace(/\D+/g, '');
    const checkoutError = dialog.querySelector('[data-jewelry-checkout-error]');
    const confirmBtn = dialog.querySelector('[data-jewelry-confirm]');
    if (!requestedId) {
      checkoutError?.classList.remove('jewelry-customize__checkout-error--hidden');
      if (checkoutError instanceof HTMLElement) {
        checkoutError.textContent = 'Please select a variant before adding to cart.';
        checkoutError.focus();
      }
      return;
    }
    if (!whatsappNumber) {
      checkoutError?.classList.remove('jewelry-customize__checkout-error--hidden');
      if (checkoutError instanceof HTMLElement) {
        checkoutError.textContent = 'WhatsApp number is not configured. Please contact support.';
        checkoutError.focus();
      }
      return;
    }
    checkoutError?.classList.add('jewelry-customize__checkout-error--hidden');

    const quantity = getFormQuantity(form);
    const properties = collectJewelryProperties(dialog);

    if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
    try {
      const message = buildWhatsappMessage(dialog, quantity, properties);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      dialog.close();
    } catch {
      checkoutError?.classList.remove('jewelry-customize__checkout-error--hidden');
      if (checkoutError instanceof HTMLElement) {
        checkoutError.textContent = 'Unable to open WhatsApp. Please try again.';
        checkoutError.focus();
      }
    } finally {
      if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
    }
  });
}

const firstDialog = document.querySelector('dialog.jewelry-customize');
if (firstDialog instanceof HTMLDialogElement && firstDialog.dataset.sectionId) {
  initJewelryCustomize(firstDialog.dataset.sectionId);
}
