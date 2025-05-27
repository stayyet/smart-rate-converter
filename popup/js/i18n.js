// popup/js/i18n.js
const I18n = {
    currentLang: 'zh_CN', // Default, will be loaded from storage

    getLocalizedString: (key, substitutions = null) => {
        return chrome.i18n.getMessage(key, substitutions) || `_${key}_`; // Fallback if key not found
    },

    // List of all elements that need translation
    // Format: { id: 'messageKey', attribute: 'textContent' (or 'placeholder', 'title') }
    translatableElements: {
        'appTitle': { key: 'extName' },
        'langToggleBtn': { key: 'langToggle', prop: 'textContent' }, // Will show 'EN' or '中'
        'favoritesTitle': { key: 'favoritesTitle' },
        'sourceCurrencyLabel': { key: 'sourceCurrencyLabel' },
        'sourceCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'targetCurrencyLabel': { key: 'targetCurrencyLabel' },
        'targetCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'swapCurrenciesBtn': { key: 'swapCurrenciesTooltip', prop: 'title' },
        'addToFavoritesBtn': { key: 'addToFavoritesTooltip', prop: 'title' },
        'amountLabel': { key: 'amountLabel' },
        'amountInput': { key: 'enterAmountPlaceholder', prop: 'placeholder' },
        'resultLabel': { key: 'resultLabel' },
        'copyResultBtn': { key: 'copyResultTooltip', prop: 'title' },
        'convertBtn': { key: 'convertButton' },
        'historyTitle': { key: 'historyTitle' },
        'clearHistoryBtn': { key: 'clearHistoryButton' }
    },
    
    applyLocale: () => {
        document.documentElement.lang = I18n.currentLang.split('_')[0]; // Set HTML lang attribute e.g. "zh" or "en"
        
        for (const id in I18n.translatableElements) {
            const element = document.getElementById(id);
            const config = I18n.translatableElements[id];
            if (element) {
                const text = I18n.getLocalizedString(config.key);
                if (config.prop) {
                    element[config.prop] = text;
                } else {
                    element.textContent = text;
                }
            }
        }
        // Special handling for lang toggle button text based on current lang
        const langToggleBtn = document.getElementById('langToggleBtn');
        if(langToggleBtn) {
            langToggleBtn.textContent = I18n.currentLang === 'zh_CN' ? 'EN' : '中';
        }

        // Re-populate dropdowns if they depend on localized names (if API provides them)
        // Or update any other language-dependent UI parts
        if (typeof UI !== 'undefined' && UI.updateCurrencyDropdownsIfReady) {
             UI.updateCurrencyDropdownsIfReady();
        }
        if (typeof UI !== 'undefined' && UI.renderHistory) { // Re-render history for date formats etc.
            Storage.getHistory().then(UI.renderHistory);
        }

    },

    toggleLanguage: async () => {
        I18n.currentLang = (I18n.currentLang === 'zh_CN') ? 'en' : 'zh_CN';
        await Storage.saveSetting('userLanguage', I18n.currentLang);
        I18n.applyLocale();
    },

    init: async () => {
        const storedLang = await Storage.loadSetting('userLanguage', navigator.language.startsWith('zh') ? 'zh_CN' : 'en');
        I18n.currentLang = storedLang;
        I18n.applyLocale();
    }
};