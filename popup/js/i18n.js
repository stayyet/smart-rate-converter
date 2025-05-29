// popup/js/i18n.js
const I18n = {
    currentLang: 'zh_CN', // Default
    _messages: {}, // To store loaded messages for all supported languages

    // Helper to fetch and parse a messages.json file
    _loadMessagesForLang: async (lang) => {
        try {
            const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
            if (!response.ok) {
                console.error(`Failed to load messages for ${lang}: ${response.statusText}`);
                return {};
            }
            const messages = await response.json();
            // Store only the 'message' part for easier lookup
            const flatMessages = {};
            for (const key in messages) {
                flatMessages[key] = messages[key].message;
            }
            return flatMessages;
        } catch (error) {
            console.error(`Error loading messages for ${lang}:`, error);
            return {};
        }
    },

    getLocalizedString: (key, substitutions = null) => {
        const messageSet = I18n._messages[I18n.currentLang] || I18n._messages[I18n.currentLang.split('_')[0]];
        let message = messageSet ? messageSet[key] : null;

        if (!message) {
            // Fallback to default language (e.g., 'en') if current lang message not found
            // Or if currentLang messages haven't loaded for some reason
            const fallbackLang = 'en'; // Or your primary default
            const fallbackMessageSet = I18n._messages[fallbackLang];
            if (fallbackMessageSet) {
                message = fallbackMessageSet[key];
            }
        }
        
        if (!message) {
            return `_${key}_`; // Ultimate fallback if key not found anywhere
        }

        if (substitutions) {
            if (Array.isArray(substitutions)) {
                // Handle $1, $2 placeholders
                substitutions.forEach((sub, i) => {
                    message = message.replace(new RegExp(`\\$${i + 1}`, 'g'), sub);
                });
            } else if (typeof substitutions === 'object') {
                // Handle named placeholders like $name$
                for (const subKey in substitutions) {
                    message = message.replace(new RegExp(`\\$${subKey}\\$`, 'g'), substitutions[subKey]);
                }
            }
        }
        return message;
    },

    translatableElements: {
        // ... (your existing translatableElements map remains the same)
        'appTitle': { key: 'extName' },
        'langToggleBtn': { key: 'langToggle', prop: 'textContent' },
        'favoritesTitle': { key: 'favoritesTitle' },
        'sourceCurrencyLabel': { key: 'sourceCurrencyLabel' },
        'sourceCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'targetCurrencyLabel': { key: 'targetCurrencyLabel' },
        'targetCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'swapCurrenciesBtn': { key: 'swapCurrenciesTooltip', prop: 'title' },
        'addToFavoritesBtn': { key: 'addToFavoritesTooltip', prop: 'title' }, // Initial
        'amountLabel': { key: 'amountLabel' },
        'amountInput': { key: 'enterAmountPlaceholder', prop: 'placeholder' },
        'resultLabel': { key: 'resultLabel' },
        'copyResultBtn': { key: 'copyResultTooltip', prop: 'title' },
        'convertBtn': { key: 'convertButton' },
        'historyTitle': { key: 'historyTitle' },
        'clearHistoryBtn': { key: 'clearHistoryButton' }
    },
    
    applyLocale: () => {
        document.documentElement.lang = I18n.currentLang.split('_')[0];
        
        for (const id in I18n.translatableElements) {
            const element = document.getElementById(id);
            const config = I18n.translatableElements[id];
            if (element) {
                // For addToFavoritesBtn, title is dynamic, so handle it in UI.updateFavoriteStar
                if (id === 'addToFavoritesBtn' && config.prop === 'title') {
                    // Initial setup handled by App.updateFavoriteStarUI calling UI.updateFavoriteStar
                    // So we can skip it here to avoid overriding the dynamic logic
                } else {
                    const text = I18n.getLocalizedString(config.key);
                    if (config.prop) {
                        element[config.prop] = text;
                    } else {
                        element.textContent = text;
                    }
                }
            }
        }
        
        const langToggleBtn = document.getElementById('langToggleBtn');
        if(langToggleBtn) {
            // This logic remains as it's direct text setting
            langToggleBtn.textContent = I18n.currentLang === 'zh_CN' ? 'EN' : '中';
        }

        if (typeof UI !== 'undefined' && UI.updateCurrencyDropdownsIfReady) {
             UI.updateCurrencyDropdownsIfReady();
        }
        // Re-render history and favorites to apply new language to dynamic parts (dates, "no items")
        if (typeof UI !== 'undefined' && UI.renderHistory && typeof Storage !== 'undefined') { 
            Storage.getHistory().then(UI.renderHistory);
        }
        if (typeof UI !== 'undefined' && UI.renderFavorites && typeof Storage !== 'undefined') {
            Storage.getFavorites().then(UI.renderFavorites);
        }
         // Also, re-evaluate the favorite star tooltip in case its state matters
        if (typeof App !== 'undefined' && App.updateFavoriteStarUI) {
            App.updateFavoriteStarUI();
        }
    },

    toggleLanguage: async () => {
        I18n.currentLang = (I18n.currentLang === 'zh_CN') ? 'en' : 'zh_CN';
        await Storage.saveSetting('userLanguage', I18n.currentLang);
        I18n.applyLocale();
        // Inform main.js to re-perform conversion as number/date formats might change
        if (typeof App !== 'undefined' && App.performConversion) {
            App.performConversion();
        }
    },

    init: async () => {
        // Load messages for all supported languages
        I18n._messages['en'] = await I18n._loadMessagesForLang('en');
        I18n._messages['zh_CN'] = await I18n._loadMessagesForLang('zh_CN');
        // Add more languages if needed

        const storedLang = await Storage.loadSetting('userLanguage', navigator.language.startsWith('zh') ? 'zh_CN' : 'en');
        I18n.currentLang = storedLang;
        
        // If messages for currentLang failed to load, fallback gracefully
        if (!I18n._messages[I18n.currentLang] || Object.keys(I18n._messages[I18n.currentLang]).length === 0) {
            console.warn(`Messages for ${I18n.currentLang} not loaded, falling back to 'en'`);
            I18n.currentLang = 'en'; // Or your primary default
             if (!I18n._messages[I18n.currentLang] || Object.keys(I18n._messages[I18n.currentLang]).length === 0) {
                 console.error("Fallback language 'en' also failed to load. UI text will be broken.");
                 // At this point, UI text will likely show _key_
             }
        }

        I18n.applyLocale();
    }
};