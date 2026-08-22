// @ts-check
/**
 * diamond-weight-price.js
 *
 * Two responsibilities:
 *  1. Update the displayed price on the PDP in real-time
 *       Displayed price = Variant price + Diamond weight surcharge + Diamond color surcharge
 *  2. Diamond weight / color surcharges are added in the same /cart/add.js call as the main
 *     line item (see jewelry-customize.js). Optional separate listener kept for compatibility.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SETUP — one-time in Shopify Admin
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Create a product: "Diamond Weight Surcharge" (hidden from sales channels)
 *  2. Add a variant for EACH weight value. Set Price = surcharge amount.
 *  3. Copy each Variant ID (Admin → Products → edit each variant → check URL)
 *  4. Paste IDs into DIAMOND_WEIGHT_VARIANT_IDS below.
 *     Keys must EXACTLY match the value in custom.diamond_weight metafield.
 *
 *  DIAMOND COLOR (same pattern)
 *  5. Create a product: "Diamond Color Surcharge" (hidden from sales channels)
 *  6. Add a variant per color grade (D, E, F, …). Price = surcharge.
 *  7. Paste variant IDs into DIAMOND_COLOR_VARIANT_IDS — keys must match custom.diamond_color.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Surcharge variant IDs from your "Diamond Weight Surcharge" Shopify product.
 * Key = exact string value from custom.diamond_weight metafield (e.g. "2.50")
 * Value = Shopify Variant ID (number)
 *
 * ⚠️  Replace 0 with real variant IDs before uploading the theme.
 * @type {Record<string, number>}
 */
const DIAMOND_WEIGHT_VARIANT_IDS = {};

/**
 * Surcharge variant IDs from your "Diamond Color Surcharge" Shopify product.
 * Key = exact string from custom.diamond_color metafield (e.g. "E", "D", "F")
 * @type {Record<string, number>}
 */
const DIAMOND_COLOR_VARIANT_IDS = {};

/**
 * Surcharge amounts in minor currency units (diamond color).
 * @type {Record<string, number>}
 */
const DIAMOND_COLOR_PRICES = {};

/**
 * Surcharge amounts in minor currency units.
 * Loaded dynamically from Shopify variant price for each DIAMOND_WEIGHT_VARIANT_IDS key.
 * @type {Record<string, number>}
 */
const DIAMOND_WEIGHT_PRICES = {};

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {number | null} */
let _baseVariantPrice = /** @type {number | null} */ (null);

/** @type {number | null} */
let _baseCompareAtPrice = /** @type {number | null} */ (null);

/** @type {number} */
let _diamondSurcharge = 0;

/** @type {number} */
let _diamondColorSurcharge = 0;

/** @type {Record<string, Promise<number>>} */
const _surchargePriceRequests = {};

/** @type {Record<string, Promise<number>>} */
const _colorSurchargePriceRequests = {};

/**
 * Weight selected by the user in the picker UI.
 * This is the source-of-truth for the cart surcharge.
 * @type {string}
 */
let _selectedWeight = '';

/** @type {string} */
let _selectedDiamondColor = '';

// ─── Money formatting ─────────────────────────────────────────────────────────

/** @returns {string} */
function getMoneyFormat() {
  const el = /** @type {HTMLMetaElement | null} */ (
    document.querySelector('meta[name="money-format"]')
  );
  return el?.content || '{{amount}}';
}

/** @param {number} cents @returns {string} */
function formatMoney(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return '';
  const format = getMoneyFormat();
  const value = (cents / 100).toFixed(2);
  const [w = '0', f = '00'] = value.split('.');
  const fw = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return format
    .replace('{{amount_no_decimals}}', fw)
    .replace('{{amount_with_comma_separator}}', `${w.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${f}`)
    .replace('{{amount}}', `${fw}.${f}`);
}

// ─── PDP display update ───────────────────────────────────────────────────────

function updatePriceDisplay() {
  if (_baseVariantPrice === null) return;
  const extra = _diamondSurcharge + _diamondColorSurcharge;
  const total = _baseVariantPrice + extra;
  const totalStr = formatMoney(total);

  document
    .querySelectorAll('product-price .price, product-price .price-item--sale, product-price .price-item--regular')
    .forEach((el) => { el.textContent = totalStr; });

  if (_baseCompareAtPrice !== null && _baseCompareAtPrice > (_baseVariantPrice ?? 0)) {
    const base = _baseCompareAtPrice;
    document
      .querySelectorAll('product-price .compare-at-price')
      .forEach((el) => { el.textContent = formatMoney(base + extra); });
  }

  const badge = /** @type {HTMLElement | null} */ (document.querySelector('[data-diamond-surcharge-display]'));
  if (badge) {
    badge.hidden = extra <= 0;
    if (extra > 0) badge.textContent = `+ ${formatMoney(extra)}`;
  }

}

/**
 * Match metafield strings like "1", "1.0", "1.00" to DIAMOND_WEIGHT_VARIANT_IDS keys (same as jewelry-customize.js).
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
 * Resolve surcharge amount from Shopify variant price by weight.
 * @param {string} weight
 * @returns {Promise<number>}
 */
async function getSurchargePrice(weight) {
  if (!weight) return 0;

  const keys = getDiamondWeightLookupKeys(weight);
  for (const k of keys) {
    const cached = DIAMOND_WEIGHT_PRICES[k];
    if (typeof cached === 'number') return cached;
  }

  let resolvedKey = '';
  let variantId = 0;
  for (const k of keys) {
    const id = DIAMOND_WEIGHT_VARIANT_IDS[k];
    if (typeof id === 'number' && id > 0) {
      resolvedKey = k;
      variantId = id;
      break;
    }
  }
  if (!variantId || !resolvedKey) return 0;

  if (!_surchargePriceRequests[resolvedKey]) {
    _surchargePriceRequests[resolvedKey] = fetch(`/variants/${variantId}.js`, {
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) return 0;
        const data = await res.json().catch(() => null);
        return (typeof data?.price === 'number' && !isNaN(data.price)) ? data.price : 0;
      })
      .catch(() => 0)
      .then((price) => {
        for (const k of keys) {
          DIAMOND_WEIGHT_PRICES[k] = price;
        }
        return price;
      });
  }

  return _surchargePriceRequests[resolvedKey] ?? Promise.resolve(0);
}

/**
 * @param {string} color
 * @returns {string[]}
 */
function getDiamondColorLookupKeys(color) {
  const raw = String(color || '').trim();
  if (!raw) return [];
  const keys = [raw];
  const upper = raw.toUpperCase();
  if (!keys.includes(upper)) keys.push(upper);
  const lower = raw.toLowerCase();
  if (!keys.includes(lower)) keys.push(lower);
  return keys;
}

/**
 * @param {string} color
 * @returns {Promise<number>}
 */
async function getColorSurchargePrice(color) {
  if (!color) return 0;

  const keys = getDiamondColorLookupKeys(color);
  for (const k of keys) {
    const cached = DIAMOND_COLOR_PRICES[k];
    if (typeof cached === 'number') return cached;
  }

  let resolvedKey = '';
  let variantId = 0;
  for (const k of keys) {
    const id = DIAMOND_COLOR_VARIANT_IDS[k];
    if (typeof id === 'number' && id > 0) {
      resolvedKey = k;
      variantId = id;
      break;
    }
  }
  if (!variantId || !resolvedKey) return 0;

  if (!_colorSurchargePriceRequests[resolvedKey]) {
    _colorSurchargePriceRequests[resolvedKey] = fetch(`/variants/${variantId}.js`, {
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        if (!res.ok) return 0;
        const data = await res.json().catch(() => null);
        return (typeof data?.price === 'number' && !isNaN(data.price)) ? data.price : 0;
      })
      .catch(() => 0)
      .then((price) => {
        for (const k of keys) {
          DIAMOND_COLOR_PRICES[k] = price;
        }
        return price;
      });
  }

  return _colorSurchargePriceRequests[resolvedKey] ?? Promise.resolve(0);
}

/**
 * Called from jewelry-customize.js when the modal renders or changes diamond color.
 * @param {string} color
 */
function setJewelryDiamondColorForPricing(color) {
  const value = (color || '').trim();
  _selectedDiamondColor = value;

  if (!value) {
    _diamondColorSurcharge = 0;
    /** @type {any} */ (window).__diamondColorSurchargeVariantId = null;
    updatePriceDisplay();
    return;
  }

  let fromCache = 0;
  const keys = getDiamondColorLookupKeys(value);
  for (const k of keys) {
    if (typeof DIAMOND_COLOR_PRICES[k] === 'number') {
      fromCache = DIAMOND_COLOR_PRICES[k];
      break;
    }
  }
  _diamondColorSurcharge = fromCache;

  let variantId = null;
  for (const k of keys) {
    const id = DIAMOND_COLOR_VARIANT_IDS[k];
    if (typeof id === 'number' && id > 0) {
      variantId = id;
      break;
    }
  }
  /** @type {any} */ (window).__diamondColorSurchargeVariantId = variantId;

  updatePriceDisplay();

  void getColorSurchargePrice(value).then((livePrice) => {
    if (_selectedDiamondColor !== value) return;
    _diamondColorSurcharge = livePrice;
    updatePriceDisplay();
  });
}

// ─── Variant change ───────────────────────────────────────────────────────────

/** @param {Event} e */
function onVariantUpdate(e) {
  const detail = /** @type {{resource?: {price?: unknown, compare_at_price?: unknown}}} */ (
    /** @type {CustomEvent} */ (e).detail
  );
  const v = detail?.resource;
  if (!v) return;
  _baseVariantPrice   = typeof v.price === 'number'            ? v.price            : null;
  _baseCompareAtPrice = typeof v.compare_at_price === 'number' ? v.compare_at_price : null;
  updatePriceDisplay();
}

// ─── Picker selection ─────────────────────────────────────────────────────────

/**
 * Shared by PDP diamond-weight picker and jewelry modal diamond-weight dropdown.
 * @param {string} weight
 */
async function applyDiamondWeightSurchargeState(weight) {
  const value = (weight || '').trim();
  _selectedWeight = value;
  const keys = getDiamondWeightLookupKeys(value);

  let fromCache = 0;
  for (const k of keys) {
    if (typeof DIAMOND_WEIGHT_PRICES[k] === 'number') {
      fromCache = DIAMOND_WEIGHT_PRICES[k];
      break;
    }
  }
  _diamondSurcharge = fromCache;

  let surchargeVariantId = null;
  for (const k of keys) {
    const id = DIAMOND_WEIGHT_VARIANT_IDS[k];
    if (typeof id === 'number' && id > 0) {
      surchargeVariantId = id;
      break;
    }
  }
  /** @type {any} */ (window).__diamondSurchargeVariantId = surchargeVariantId;

  const lbl = document.getElementById('dw-selected-value');
  if (lbl) lbl.textContent = value ? `— ${value}` : '';

  console.log(`[diamond-weight] Weight "${value}" keys=${JSON.stringify(keys)} → surchargeVariantId: ${surchargeVariantId}`);
  updatePriceDisplay();

  const livePrice = await getSurchargePrice(value);
  if (_selectedWeight === value && livePrice !== _diamondSurcharge) {
    _diamondSurcharge = livePrice;
    updatePriceDisplay();
  }
}

/** @param {Event} e */
async function onPickerChange(e) {
  const t = /** @type {HTMLInputElement|HTMLSelectElement} */ (e.target);
  const value = (t.value || '').trim();
  await applyDiamondWeightSurchargeState(value);
}

/**
 * Called from jewelry-customize.js when modal diamond weight dropdown changes
 * (PDP weight picker may not be in sync).
 * @param {string} weight
 */
function setJewelryModalDiamondWeightForPricing(weight) {
  void applyDiamondWeightSurchargeState(weight);
}

/** When modal removes diamond-weight UI, fall back to the PDP weight picker if present. */
function restoreDiamondWeightSurchargeFromPdpIfPresent() {
  const pre = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (
    document.querySelector('[data-diamond-weight-picker] input:checked, [data-diamond-weight-picker] select')
  );
  if (pre) {
    void applyDiamondWeightSurchargeState((pre.value || '').trim());
  } else {
    void applyDiamondWeightSurchargeState('');
  }
}

// ─── Cart surcharge ───────────────────────────────────────────────────────────

/**
 * Fired by jewelry-customize.js after a successful /cart/add.js call.
 * We add a second line item for the diamond weight surcharge.
 * @param {Event} e
 */
async function onJewelryCartAdded(e) {
  const detail = /** @type {{diamondWeight?: string, quantity?: number}} */ (
    /** @type {CustomEvent} */ (e).detail || {}
  );

  // ── Determine which weight to use ──────────────────────────────────────────
  // Priority: user's picker selection → event's mfDiamondText (variant catalog value)
  const weight = (_selectedWeight || detail.diamondWeight || '').trim();

  console.log(`[diamond-weight] 'jewelry:cart-added' fired. _selectedWeight="${_selectedWeight}" event.diamondWeight="${detail.diamondWeight}" → using "${weight}"`);

  if (!weight) {
    console.warn('[diamond-weight] No diamond weight selected — skipping surcharge.');
    return;
  }

  const variantId = DIAMOND_WEIGHT_VARIANT_IDS[weight];

  if (!variantId) {
    console.warn(
      `[diamond-weight] Weight "${weight}" has no variant ID in DIAMOND_WEIGHT_VARIANT_IDS.\n` +
      'Fix: create a "Diamond Weight Surcharge" product in Shopify, add a variant for this\n' +
      'weight, and paste its numeric Variant ID into DIAMOND_WEIGHT_VARIANT_IDS in diamond-weight-price.js.'
    );
    return;
  }

  const qty = detail.quantity || 1;
  console.log(`[diamond-weight] Adding surcharge line item — variantId: ${variantId}, qty: ${qty}`);

  try {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: [{
          id: variantId,
          quantity: qty,
          properties: {
            // Hidden in most themes (underscore prefix)
            _surcharge_for: weight,
            // Visible in Shopify order admin
            'Diamond Weight Surcharge': weight,
          },
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[diamond-weight] Surcharge cart add failed:', err);
    } else {
      console.log('[diamond-weight] Surcharge line item added successfully.');
    }
  } catch (err) {
    console.error('[diamond-weight] Surcharge cart add error:', err);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function seedInitialPrice() {
  const el = document.querySelector('variant-picker script[type="application/json"]');
  if (!el?.textContent) return;
  try {
    /** @type {{price?: unknown, compare_at_price?: unknown}} */
    const v = JSON.parse(el.textContent);
    _baseVariantPrice   = typeof v.price === 'number'            ? v.price            : null;
    _baseCompareAtPrice = typeof v.compare_at_price === 'number' ? v.compare_at_price : null;
  } catch (_) { /* ignore */ }
}

function attachListeners() {
  // Variant updates from theme's event system
  document.addEventListener('variant:update', onVariantUpdate);

  // Diamond weight picker changes (event delegation)
  document.addEventListener('change', (e) => {
    const t = /** @type {HTMLElement|null} */ (e.target);
    if (!t) return;
    if (t.matches('[data-diamond-weight-option]') || t.closest('[data-diamond-weight-picker]')) {
      void onPickerChange(e);
    }
  });

  // Expose full variant ID map so jewelry-customize.js can look up by mfDiamondText
  // even when the picker UI is not used (variant catalog weight as fallback).
  /** @type {any} */ (window).__diamondWeightVariantIds = DIAMOND_WEIGHT_VARIANT_IDS;
  /** @type {any} */ (window).__diamondWeightPrices = DIAMOND_WEIGHT_PRICES;
  /** @type {any} */ (window).__diamondColorVariantIds = DIAMOND_COLOR_VARIANT_IDS;
  /** @type {any} */ (window).__diamondColorPrices = DIAMOND_COLOR_PRICES;
  /** @type {any} */ (window).__setJewelryDiamondColorForPricing = setJewelryDiamondColorForPricing;
  /** @type {any} */ (window).__setJewelryModalDiamondWeightForPricing = setJewelryModalDiamondWeightForPricing;
  /** @type {any} */ (window).__refreshJewelryPricingDisplays = updatePriceDisplay;
  /** @type {any} */ (window).__restoreDiamondWeightFromPdpPicker = restoreDiamondWeightSurchargeFromPdpIfPresent;

  // After jewelry-customize.js confirms — no longer needed (surcharge is now
  // included in the same items[] call). Kept as a no-op for forward compat.
  // document.addEventListener('jewelry:cart-added', onJewelryCartAdded);

  console.log('[diamond-weight] ✅ Listeners attached. DIAMOND_WEIGHT_VARIANT_IDS:', DIAMOND_WEIGHT_VARIANT_IDS);
}

function init() {
  seedInitialPrice();
  attachListeners();

  // Apply any pre-selected weight
  const pre = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (
    document.querySelector('[data-diamond-weight-picker] input:checked, [data-diamond-weight-picker] select')
  );
  if (pre) {
    const value = (pre.value || '').trim();
    void applyDiamondWeightSurchargeState(value);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
