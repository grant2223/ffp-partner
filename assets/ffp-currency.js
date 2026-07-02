/* FFP Currency — shared currency list + formatter (v1, 2026-06-14)
   Per-partner native currency for a global sports / fitness / wellness / adventure travel marketplace.
   Used by the partner + pro portals (selector + price labels) and anywhere money is shown.
   Display style: "CODE 1,234" (e.g. "AUD 150") — matches the platform's existing "AED 150" look.
   Backend (index.js toMinorUnits) handles Stripe minor units, incl. zero-decimal (JPY/VND/KRW…) and
   3-decimal (KWD/BHD/OMR/JOD/TND). Keep the decimals flag here in sync for display rounding.        */
(function () {
  'use strict';
  // code, name, symbol, region, decimals (display)
  var LIST = [
    // Middle East
    { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ',  region: 'Middle East', decimals: 2 },
    { code: 'SAR', name: 'Saudi Riyal',         symbol: '﷼',    region: 'Middle East', decimals: 2 },
    { code: 'QAR', name: 'Qatari Riyal',        symbol: 'ر.ق',  region: 'Middle East', decimals: 2 },
    { code: 'KWD', name: 'Kuwaiti Dinar',       symbol: 'د.ك',  region: 'Middle East', decimals: 3 },
    { code: 'BHD', name: 'Bahraini Dinar',      symbol: '.د.ب', region: 'Middle East', decimals: 3 },
    { code: 'OMR', name: 'Omani Rial',          symbol: 'ر.ع.', region: 'Middle East', decimals: 3 },
    { code: 'JOD', name: 'Jordanian Dinar',     symbol: 'د.ا',  region: 'Middle East', decimals: 3 },
    { code: 'ILS', name: 'Israeli Shekel',      symbol: '₪',    region: 'Middle East', decimals: 2 },
    { code: 'EGP', name: 'Egyptian Pound',      symbol: 'E£',   region: 'Middle East', decimals: 2 },
    // Europe
    { code: 'EUR', name: 'Euro',                symbol: '€',    region: 'Europe', decimals: 2 },
    { code: 'GBP', name: 'British Pound',       symbol: '£',    region: 'Europe', decimals: 2 },
    { code: 'CHF', name: 'Swiss Franc',         symbol: 'CHF',  region: 'Europe', decimals: 2 },
    { code: 'NOK', name: 'Norwegian Krone',     symbol: 'kr',   region: 'Europe', decimals: 2 },
    { code: 'SEK', name: 'Swedish Krona',       symbol: 'kr',   region: 'Europe', decimals: 2 },
    { code: 'DKK', name: 'Danish Krone',        symbol: 'kr',   region: 'Europe', decimals: 2 },
    { code: 'PLN', name: 'Polish Złoty',        symbol: 'zł',   region: 'Europe', decimals: 2 },
    { code: 'CZK', name: 'Czech Koruna',        symbol: 'Kč',   region: 'Europe', decimals: 2 },
    { code: 'HUF', name: 'Hungarian Forint',    symbol: 'Ft',   region: 'Europe', decimals: 2 },
    { code: 'RON', name: 'Romanian Leu',        symbol: 'lei',  region: 'Europe', decimals: 2 },
    { code: 'ISK', name: 'Icelandic Króna',     symbol: 'kr',   region: 'Europe', decimals: 2 },
    { code: 'TRY', name: 'Turkish Lira',        symbol: '₺',    region: 'Europe', decimals: 2 },
    { code: 'BGN', name: 'Bulgarian Lev',       symbol: 'лв',   region: 'Europe', decimals: 2 },
    // Americas
    { code: 'USD', name: 'US Dollar',           symbol: '$',    region: 'Americas', decimals: 2 },
    { code: 'CAD', name: 'Canadian Dollar',     symbol: 'C$',   region: 'Americas', decimals: 2 },
    { code: 'MXN', name: 'Mexican Peso',        symbol: 'Mex$', region: 'Americas', decimals: 2 },
    { code: 'BRL', name: 'Brazilian Real',      symbol: 'R$',   region: 'Americas', decimals: 2 },
    { code: 'ARS', name: 'Argentine Peso',      symbol: '$',    region: 'Americas', decimals: 2 },
    { code: 'CLP', name: 'Chilean Peso',        symbol: '$',    region: 'Americas', decimals: 0 },
    { code: 'COP', name: 'Colombian Peso',      symbol: '$',    region: 'Americas', decimals: 2 },
    { code: 'PEN', name: 'Peruvian Sol',        symbol: 'S/',   region: 'Americas', decimals: 2 },
    { code: 'CRC', name: 'Costa Rican Colón',   symbol: '₡',    region: 'Americas', decimals: 2 },
    // Asia-Pacific
    { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'NZD', name: 'New Zealand Dollar',  symbol: 'NZ$',  region: 'Asia-Pacific', decimals: 2 },
    { code: 'JPY', name: 'Japanese Yen',        symbol: '¥',    region: 'Asia-Pacific', decimals: 0 },
    { code: 'CNY', name: 'Chinese Yuan',        symbol: '¥',    region: 'Asia-Pacific', decimals: 2 },
    { code: 'HKD', name: 'Hong Kong Dollar',    symbol: 'HK$',  region: 'Asia-Pacific', decimals: 2 },
    { code: 'SGD', name: 'Singapore Dollar',    symbol: 'S$',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'TWD', name: 'Taiwan Dollar',       symbol: 'NT$',  region: 'Asia-Pacific', decimals: 2 },
    { code: 'KRW', name: 'South Korean Won',    symbol: '₩',    region: 'Asia-Pacific', decimals: 0 },
    { code: 'THB', name: 'Thai Baht',           symbol: '฿',    region: 'Asia-Pacific', decimals: 2 },
    { code: 'IDR', name: 'Indonesian Rupiah',   symbol: 'Rp',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'MYR', name: 'Malaysian Ringgit',   symbol: 'RM',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'PHP', name: 'Philippine Peso',     symbol: '₱',    region: 'Asia-Pacific', decimals: 2 },
    { code: 'VND', name: 'Vietnamese Dong',     symbol: '₫',    region: 'Asia-Pacific', decimals: 0 },
    { code: 'INR', name: 'Indian Rupee',        symbol: '₹',    region: 'Asia-Pacific', decimals: 2 },
    { code: 'LKR', name: 'Sri Lankan Rupee',    symbol: 'Rs',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'NPR', name: 'Nepalese Rupee',      symbol: 'Rs',   region: 'Asia-Pacific', decimals: 2 },
    { code: 'FJD', name: 'Fijian Dollar',       symbol: 'FJ$',  region: 'Asia-Pacific', decimals: 2 },
    // Africa
    { code: 'ZAR', name: 'South African Rand',  symbol: 'R',    region: 'Africa', decimals: 2 },
    { code: 'KES', name: 'Kenyan Shilling',     symbol: 'KSh',  region: 'Africa', decimals: 2 },
    { code: 'MAD', name: 'Moroccan Dirham',     symbol: 'DH',   region: 'Africa', decimals: 2 },
    { code: 'MUR', name: 'Mauritian Rupee',     symbol: 'Rs',   region: 'Africa', decimals: 2 },
    { code: 'SCR', name: 'Seychellois Rupee',   symbol: 'Rs',   region: 'Africa', decimals: 2 },
    { code: 'TND', name: 'Tunisian Dinar',      symbol: 'د.ت',  region: 'Africa', decimals: 3 }
  ];

  var BY_CODE = {};
  LIST.forEach(function (c) { BY_CODE[c.code] = c; });

  function byCode(code) { return BY_CODE[String(code || '').toUpperCase()] || null; }
  function symbol(code) { var c = byCode(code); return c ? c.symbol : (code || ''); }

  // "AUD 150" / "JPY 1,500" — code prefix + locale-grouped number, decimals per currency.
  function format(amount, code) {
    var cc = String(code || 'AED').toUpperCase();
    var meta = byCode(cc);
    var dp = meta ? meta.decimals : 2;
    var n = Number(amount || 0);
    var s = isNaN(n) ? '0' : n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });
    return cc + ' ' + s;
  }

  // <option> list for selectors, grouped by region.
  function optionsHtml(selected) {
    var sel = String(selected || 'AED').toUpperCase();
    var regions = ['Middle East', 'Europe', 'Americas', 'Asia-Pacific', 'Africa'];
    return regions.map(function (r) {
      var opts = LIST.filter(function (c) { return c.region === r; }).map(function (c) {
        return '<option value="' + c.code + '"' + (c.code === sel ? ' selected' : '') + '>' +
               c.code + ' — ' + c.name + '</option>';
      }).join('');
      return '<optgroup label="' + r + '">' + opts + '</optgroup>';
    }).join('');
  }

  // Convenience: the signed-in partner's currency (provider or pro) — defaults AED.
  function providerCode() { return (window.FFP_PROVIDER && window.FFP_PROVIDER.currency) || 'AED'; }
  function formatProvider(amount) { return format(amount, providerCode()); }

  window.FFPCurrency = { LIST: LIST, byCode: byCode, symbol: symbol, format: format, optionsHtml: optionsHtml, providerCode: providerCode, formatProvider: formatProvider };
})();
