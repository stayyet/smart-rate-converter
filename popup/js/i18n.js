// popup/js/i18n.js
const I18n = {
    currentLang: 'zh_CN', // Default language, will be updated from storage
    _messages: {},        // To store loaded messages for all supported languages
    _currencyNameCache: {}, // Cache for Intl.DisplayNames results

    /**
     * Gets the localized full name for a currency code.
     * Uses Intl.DisplayNames and caches results.
     * @param {string} currencyCode - The 3-letter currency code (e.g., "USD").
     * @returns {string} The localized full name or the code itself if no better name is found.
     */
    getCurrencyFullName: function(currencyCode) {
        if (!currencyCode) return ''; // Handle undefined or null currencyCode
        const langForIntl = this.currentLang.replace('_', '-'); // e.g., "zh-CN", "en-US"
        const cacheKey = `${langForIntl}-${currencyCode.toUpperCase()}`;

        if (this._currencyNameCache[cacheKey]) {
            return this._currencyNameCache[cacheKey];
        }

        let fullName = currencyCode.toUpperCase(); // Default to the code itself
        try {
            if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
                const displayNameService = new Intl.DisplayNames([langForIntl], { type: 'currency' });
                const localizedName = displayNameService.of(currencyCode.toUpperCase());
                
                if (localizedName && localizedName.toUpperCase() !== currencyCode.toUpperCase()) {
                    fullName = localizedName;
                }
            }
        } catch (e) {
            console.warn(`[I18n] Failed to get full name for currency ${currencyCode} (lang: ${langForIntl}):`, e.message);
            // fullName remains currencyCode
        }
        
        this._currencyNameCache[cacheKey] = fullName;
        return fullName;
    },

    /**
     * Fetches and parses a messages.json file for a given language.
     * @param {string} lang - The language code (e.g., "en", "zh_CN").
     * @returns {Promise<Object>} A promise that resolves to a flat object of messages.
     */
    _loadMessagesForLang: async (lang) => {
        try {
            // Construct URL carefully, ensuring lang matches your _locales folder structure
            const messagesUrl = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const response = await fetch(messagesUrl);
            if (!response.ok) {
                console.error(`[I18n] Failed to load messages for ${lang}: ${response.status} ${response.statusText} from ${messagesUrl}`);
                return {};
            }
            const messages = await response.json();
            const flatMessages = {};
            for (const key in messages) {
                if (messages[key] && messages[key].message) { // Check if message property exists
                    flatMessages[key] = messages[key].message;
                }
            }
            return flatMessages;
        } catch (error) {
            console.error(`[I18n] Error loading messages for ${lang}:`, error);
            return {};
        }
    },

    /**
     * Gets a localized string from the loaded messages.
     * @param {string} key - The message key.
     * @param {null|Array|Object} substitutions - Placeholders for the message.
     * @returns {string} The localized string or a fallback.
     */
    getLocalizedString: (key, substitutions = null) => {
        // Determine the correct message set (e.g., 'zh_CN' or 'zh' if 'zh_CN' fails)
        let messageSet = I18n._messages[I18n.currentLang];
        if (!messageSet && I18n.currentLang.includes('_')) {
            messageSet = I18n._messages[I18n.currentLang.split('_')[0]];
        }
        
        let message = messageSet ? messageSet[key] : null;

        // Fallback to English if message not found in current language
        if (!message && I18n.currentLang !== 'en') {
            const fallbackMessageSet = I18n._messages['en'];
            if (fallbackMessageSet) {
                message = fallbackMessageSet[key];
            }
        }
        
        if (message === null || message === undefined) { // If still not found
            console.warn(`[I18n] Missing string for key: ${key} in lang: ${I18n.currentLang}`);
            return `_${key}_`; // Ultimate fallback
        }

        // Handle substitutions
        if (substitutions) {
            if (Array.isArray(substitutions)) {
                substitutions.forEach((sub, i) => {
                    // Chrome i18n uses $1, $2... for numbered placeholders from an array
                    // The `content` field in messages.json maps "name" to "$N"
                    // For simplicity here, if message string contains $N, we replace it.
                    message = message.replace(new RegExp(`\\$${i + 1}`, 'g'), sub);
                });
            } else if (typeof substitutions === 'object') {
                // Chrome i18n uses $name$ in message string, defined in `placeholders`
                for (const subKey in substitutions) {
                    message = message.replace(new RegExp(`\\$${subKey}\\$`, 'g'), substitutions[subKey]);
                }
            }
        }
        return message;
    },

    // Defines which HTML elements get their text/attributes updated
    translatableElements: {
        'appTitle': { key: 'extName' },
        'langToggleBtn': { key: 'langToggle', prop: 'textContent' }, // Note: This will be overridden later
        'favoritesTitle': { key: 'favoritesTitle' },
        'sourceCurrencyLabel': { key: 'sourceCurrencyLabel' },
        'sourceCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'targetCurrencyLabel': { key: 'targetCurrencyLabel' },
        'targetCurrencyInput': { key: 'searchCurrencyPlaceholder', prop: 'placeholder' },
        'swapCurrenciesBtn': { key: 'swapCurrenciesTooltip', prop: 'title' },
        'addToFavoritesBtn': { key: 'addToFavoritesTooltip', prop: 'title' }, // Initial tooltip
        'amountLabel': { key: 'amountLabel' },
        'amountInput': { key: 'enterAmountPlaceholder', prop: 'placeholder' },
        'resultLabel': { key: 'resultLabel' },
        'copyResultBtn': { key: 'copyResultTooltip', prop: 'title' },
        'convertBtn': { key: 'convertButton' },
        'historyTitle': { key: 'historyTitle' },
        'clearHistoryBtn': { key: 'clearHistoryButton' }
        // Add 'settingsBtn': { key: 'settingsTooltip', prop: 'title' } if you re-add it
    },
    
    /**
     * Applies the current locale to the UI elements and triggers necessary updates.
     */
    applyLocale: function() {
        // console.log(`[I18n] applyLocale called for language: ${this.currentLang}`);
        this._currencyNameCache = {}; // Clear currency name cache
        document.documentElement.lang = this.currentLang.split('_')[0]; // Set HTML lang attribute
        
        // Translate static elements
        for (const id in this.translatableElements) {
            const element = document.getElementById(id);
            const config = this.translatableElements[id];
            if (element) {
                // Special handling for addToFavoritesBtn title, which is dynamic
                if (id === 'addToFavoritesBtn' && config.prop === 'title') {
                    // This will be set dynamically by UI.updateFavoriteStar based on actual favorite state
                    // So, we might not need to set it here or ensure App.updateFavoriteStarUI() is called soon after.
                } else {
                    const text = this.getLocalizedString(config.key);
                    if (config.prop) {
                        element[config.prop] = text;
                    } else {
                        element.textContent = text;
                    }
                }
            } else {
                console.warn(`[I18n] Element with ID '${id}' not found for translation.`);
            }
        }
        
        // Update language toggle button text directly
        const langToggleBtn = document.getElementById('langToggleBtn');
        if (langToggleBtn) {
            langToggleBtn.textContent = this.currentLang === 'zh_CN' ? 'EN' : 'CN'; // Or '中' if you prefer
        }

        // Trigger UI updates for elements that depend on locale (like currency dropdowns)
        if (typeof UI !== 'undefined' && UI.updateCurrencyDropdownsIfReady && UI._allCurrencies && UI._allCurrencies.length > 0) {
             // console.log("[I18n] Language changed, calling UI.updateCurrencyDropdownsIfReady() to re-localize dropdowns.");
             UI.updateCurrencyDropdownsIfReady();
        }
        
        // Re-render history for localized date formats and "no history" message
        if (typeof UI !== 'undefined' && UI.renderHistory && typeof Storage !== 'undefined') {
            Storage.getHistory().then(UI.renderHistory);
        }
        // Re-render favorites for "no favorites" message
        if (typeof UI !== 'undefined' && UI.renderFavorites && typeof Storage !== 'undefined') {
            Storage.getFavorites().then(UI.renderFavorites);
        }
        // Re-evaluate the favorite star tooltip as its text depends on favorite status + language
        if (typeof App !== 'undefined' && App.updateFavoriteStarUI) {
            App.updateFavoriteStarUI();
        }
    },

    /**
     * Toggles the language, saves preference, and applies the new locale.
     */
    toggleLanguage: async function() { // Marked as async due to Storage.saveSetting
        this.currentLang = (this.currentLang === 'zh_CN') ? 'en' : 'zh_CN';
        // console.log(`[I18n] Language toggled to: ${this.currentLang}`);
        await Storage.saveSetting('userLanguage', this.currentLang);
        this.applyLocale(); // Apply changes immediately

        // Inform main.js to re-perform conversion as number/date formats might change,
        // and rate info text also needs re-localization.
        if (typeof App !== 'undefined' && App.performConversion) {
            App.performConversion();
        }
    },

    /**
     * Initializes the I18n module: loads messages and sets the initial language.
     */
    init: async function() {
        // console.log("[I18n] init - Initializing I18n module...");
        
        // Load messages for all supported languages
        // Ensure your _locales folder has 'en' and 'zh_CN' subfolders with messages.json
        this._messages['en'] = await this._loadMessagesForLang('en');
        this._messages['zh_CN'] = await this._loadMessagesForLang('zh_CN');
        // Add more languages here if needed:
        // this._messages['ja'] = await this._loadMessagesForLang('ja');

        // Determine initial language: from storage, or fallback to browser language, then to default
        let initialLang = await Storage.loadSetting('userLanguage', null);
        if (!initialLang) {
            const browserLang = navigator.language; // e.g., "en-US", "zh-CN"
            if (browserLang.startsWith('zh')) {
                initialLang = 'zh_CN';
            } else if (browserLang.startsWith('en')) {
                initialLang = 'en';
            } else {
                initialLang = 'en'; // Ultimate fallback language
            }
        }
        this.currentLang = initialLang;
        // console.log(`[I18n] init - Initial language set to: ${this.currentLang}`);
        
        // Gracefully handle if messages for the determined language failed to load
        let currentMessages = this._messages[this.currentLang];
        if (!currentMessages && this.currentLang.includes('_')) { // Try base lang e.g. 'zh' from 'zh_CN'
            currentMessages = this._messages[this.currentLang.split('_')[0]];
        }

        if (!currentMessages || Object.keys(currentMessages).length === 0) {
            console.warn(`[I18n] Messages for ${this.currentLang} not loaded or empty, falling back to 'en'.`);
            this.currentLang = 'en'; 
             if (!this._messages[this.currentLang] || Object.keys(this._messages[this.currentLang]).length === 0) {
                 console.error("[I18n] CRITICAL: Fallback language 'en' messages also failed to load. UI text will be broken.");
             }
        }

        this.applyLocale(); // Apply the initial locale
        // console.log("[I18n] init - I18n module initialization complete.");
    }
};