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

    formatCurrencyWithSymbol: (amount, currencyCode, currentPluginLocale) => {
    // 1. 标准化传入的插件 locale，并提供一个安全的备用值
    // Intl.NumberFormat 需要 BCP 47 语言标签 (通常用连字符，例如 'zh-CN')
    const standardizedPluginLocale = typeof currentPluginLocale === 'string' 
                                        ? currentPluginLocale.replace('_', '-') 
                                        : 'en-US'; // 如果 currentPluginLocale 无效，则默认使用 'en-US'

    // 在 Console 中打印将要用于格式化的 locale，帮助调试
    console.log(`[utils] formatCurrencyWithSymbol: Formatting ${currencyCode} with amount ${amount}. Effective pluginLocale for formatting: ${standardizedPluginLocale}`);

    // 2. 根据插件的当前语言动态设置数字格式化选项 (特别是小数位数)
    let formattingOptions = {
        style: 'currency',
        currency: currencyCode
        // 小数位数将根据下面的逻辑动态设置
    };

    if (standardizedPluginLocale.startsWith('en')) {
        // 英文模式下，通常期望保留两位小数
        formattingOptions.minimumFractionDigits = 2;
        formattingOptions.maximumFractionDigits = 2;
        // console.log(`[utils] English mode selected: using 2 decimal places for ${currencyCode}.`);
    } else if (standardizedPluginLocale.startsWith('zh')) {
        // 中文模式下，根据你的需求，之前是期望保留四位小数
        formattingOptions.minimumFractionDigits = 4;
        formattingOptions.maximumFractionDigits = 4;
        // console.log(`[utils] Chinese mode selected: using 4 decimal places for ${currencyCode}.`);
    } else {
        // 其他未知语言或默认情况，也设置为两位小数
        formattingOptions.minimumFractionDigits = 2;
        formattingOptions.maximumFractionDigits = 2;
        // console.log(`[utils] Default/Other language mode: using 2 decimal places for ${currencyCode}.`);
    }
    
    // 3. 对某些已知没有小数位或小数位规则特殊的货币进行覆盖处理
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND']; // 例如：日元、韩元、越南盾
    // 你可以根据需要扩展这个列表，比如某些非洲法郎 (XAF, XOF) 也是0位小数
    if (zeroDecimalCurrencies.includes(currencyCode.toUpperCase())) {
        formattingOptions.minimumFractionDigits = 0;
        formattingOptions.maximumFractionDigits = 0;
        // console.log(`[utils] Currency ${currencyCode} is a zero-decimal currency. Overriding to 0 decimal places.`);
    }

    // 4. 尝试使用计算出的 locale 和 options 进行格式化
    try {
        return new Intl.NumberFormat(standardizedPluginLocale, formattingOptions).format(amount);
    } catch (e1) {
        // 如果第一次尝试失败 (例如，standardizedPluginLocale + currencyCode + options 的组合不被浏览器支持)
        // 打印警告信息
        console.warn(`[utils] Attempt 1 (locale: ${standardizedPluginLocale}) failed for ${currencyCode}: ${e1.message}. Formatting options used:`, JSON.stringify(formattingOptions));
        
        // 5. 尝试使用一个更通用的 locale 'en-US' 作为备用，但仍然使用之前根据插件语言计算出的小数位数规则
        try {
            // console.log(`[utils] Attempt 2: Trying fallback locale 'en-US' for ${currencyCode} with same formatting options.`);
            return new Intl.NumberFormat('en-US', formattingOptions).format(amount);
        } catch (e2) {
            // 6. 如果 'en-US' 也失败，则使用最基本的备用方案：货币代码 + 数字 (小数位数也尝试根据插件语言决定)
            console.error(`[utils] Attempt 2 (locale: 'en-US') also failed for ${currencyCode}: ${e2.message}. Formatting options used:`, JSON.stringify(formattingOptions));
            
            let fallbackDecimalPlaces = 2; // 默认备用2位小数
            if (standardizedPluginLocale.startsWith('zh')) {
                fallbackDecimalPlaces = 4; // 中文备用4位
            }
            // 如果是已知0位小数货币，备用方案也应该是0位
            if (zeroDecimalCurrencies.includes(currencyCode.toUpperCase())) {
                fallbackDecimalPlaces = 0;
            }
            return `${currencyCode} ${amount.toFixed(fallbackDecimalPlaces)}`;
        }
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