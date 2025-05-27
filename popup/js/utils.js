// popup/js/utils.js
const Utils = {
    debounce: (func, delay) => {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    },

    formatCurrencyWithSymbol: (amount, currencyCode, locale = 'en-US') => { // Default locale, can be dynamic
        try {
            // Attempt to use a locale that matches the currency for better symbol placement
            // This is a heuristic and might need refinement
            let targetLocale = locale;
            if (currencyCode === 'EUR') targetLocale = 'de-DE'; // Euro often shown before number in EU
            else if (currencyCode === 'JPY') targetLocale = 'ja-JP';
            else if (currencyCode === 'CNY') targetLocale = 'zh-CN';


            return new Intl.NumberFormat(targetLocale, {
                style: 'currency',
                currency: currencyCode,
                minimumFractionDigits: 2,
                maximumFractionDigits: 4 // Allow more for some currencies
            }).format(amount);
        } catch (e) {
            console.warn(`Could not format currency for ${currencyCode} with locale ${locale}:`, e);
            return `${currencyCode} ${amount.toFixed(2)}`; // Fallback
        }
    },

    isValidAmount: (amountStr) => {
        if (typeof amountStr !== 'string' && typeof amountStr !== 'number') return false;
        const num = parseFloat(amountStr);
        return !isNaN(num) && num > 0;
    },

    getTimestampDifferenceString: (timestamp) => {
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffSec = Math.round(diffMs / 1000);
        const diffMin = Math.round(diffSec / 60);
        const diffHr = Math.round(diffMin / 60);

        if (diffHr > 0) return I18n.getLocalizedString('hoursAgo', { hours: diffHr });
        if (diffMin > 0) return I18n.getLocalizedString('minutesAgo', { minutes: diffMin });
        return I18n.getLocalizedString('secondsAgo', { seconds: diffSec });
    },

    // Basic currency code validation (can be expanded)
    isValidCurrencyCode: (code) => /^[A-Z]{3}$/.test(code)
};