// popup/js/main.js
const App = {
    state: {
        sourceCurrency: '',
        targetCurrency: '',
        amount: null,
        rates: null, // Store fetched rates for the current base
        ratesTimestamp: null,
        isRatesOffline: false,
        allCurrencies: [] // {code, name}
    },

    init: async () => {
        await I18n.init(); // Load language first

        UI.initEventListeners(App.handlers);
        UI.hideError(); // Clear any previous errors

        // Load settings, favorites, history
        await App.loadInitialData();
        
        // Smart default currency
        const browserLang = chrome.i18n.getUILanguage(); // e.g., "en-US", "zh-CN"
        let defaultSource = await Storage.loadSetting('defaultSourceCurrency', '');
        let defaultTarget = await Storage.loadSetting('defaultTargetCurrency', '');

        if (!defaultSource) {
            if (browserLang.startsWith("zh")) defaultSource = "CNY";
            else if (browserLang.startsWith("ja")) defaultSource = "JPY";
            else if (browserLang.startsWith("eur") || browserLang.startsWith("de") || browserLang.startsWith("fr")) defaultSource = "EUR";
            else defaultSource = "USD"; // Fallback
        }
        if (!defaultTarget) {
            defaultTarget = defaultSource === "USD" ? "EUR" : "USD";
        }
        
        App.state.sourceCurrency = defaultSource;
        App.state.targetCurrency = defaultTarget;

        // Fetch supported currencies from API
        App.state.allCurrencies = await Api.fetchSupportedCurrencies();
        if (App.state.allCurrencies && App.state.allCurrencies.length > 0) {
            UI.setSupportedCurrencies(App.state.allCurrencies, App.state.sourceCurrency, App.state.targetCurrency);
        } else {
            UI.showError('apiCurrenciesError'); // Failed to load currencies
        }
        
        // Set initial values in UI
        UI.sourceCurrencyInput.value = App.state.sourceCurrency;
        UI.targetCurrencyInput.value = App.state.targetCurrency;
        // UI.sourceCurrencySelect.value = App.state.sourceCurrency; // if using select primarily
        // UI.targetCurrencySelect.value = App.state.targetCurrency;


        App.updateFavoriteStarUI();
        App.performConversion(); // Initial conversion if amount is preset or for rate display
    },

    loadInitialData: async () => {
        const favorites = await Storage.getFavorites();
        UI.renderFavorites(favorites);

        const history = await Storage.getHistory();
        UI.renderHistory(history);
        
        const storedAmount = await Storage.loadSetting('lastAmount', '');
        if (storedAmount) {
            UI.amountInput.value = storedAmount;
            App.state.amount = parseFloat(storedAmount);
        }
    },

    performConversion: async () => {
        UI.hideError();
        const amount = UI.getAmount();
        const source = App.state.sourceCurrency || UI.getSelectedSourceCurrency();
        const target = App.state.targetCurrency || UI.getSelectedTargetCurrency();

        if (!Utils.isValidCurrencyCode(source) || !Utils.isValidCurrencyCode(target)) {
             // UI.showError('selectCurrenciesError'); // Commented as it can be annoying on first load
            UI.updateResult(null);
            return;
        }
        if (source === target) {
            App.state.rates = {[target]: 1}; // Self-conversion
            App.state.ratesTimestamp = Date.now();
            App.state.isRatesOffline = false;
             if (Utils.isValidAmount(amount)) {
                UI.updateResult(amount, target, amount, source, 1, false, Date.now());
            } else {
                UI.updateResult(null, null, null, null, 1, false, Date.now());
            }
            return;
        }


        // Fetch rates if base currency changed or rates are null/stale
        // For simplicity, always fetch if base changed, API module handles caching
        const ratesData = await Api.fetchLatestRates(source);
        if (!ratesData || !ratesData.rates) {
            // Error already shown by Api module
            UI.updateResult(null);
            return;
        }
        App.state.rates = ratesData.rates;
        App.state.ratesTimestamp = ratesData.timestamp;
        App.state.isRatesOffline = ratesData.isOffline;


        if (Utils.isValidAmount(amount)) {
            if (App.state.rates && App.state.rates[target]) {
                const rate = App.state.rates[target];
                const result = amount * rate;
                UI.updateResult(result, target, amount, source, rate, App.state.isRatesOffline, App.state.ratesTimestamp, ratesData.stale);
                
                // Save to history (only if actual conversion happens)
                if (source !== target) { // Avoid logging self-conversion or initial empty state
                     Storage.addHistoryItem({ from: source, to: target, amount, result, timestamp: Date.now() })
                        .then(Storage.getHistory)
                        .then(UI.renderHistory);
                }
                Storage.saveSetting('lastAmount', amount.toString());

            } else {
                UI.showError(I18n.getLocalizedString('rateUnavailableError', { currency: target }));
                UI.updateResult(null);
            }
        } else {
             // Show current rate info even if amount is invalid/empty
             if (App.state.rates && App.state.rates[target]) {
                const rate = App.state.rates[target];
                 UI.updateResult(null, target, 1, source, rate, App.state.isRatesOffline, App.state.ratesTimestamp, ratesData.stale); // Show rate for 1 unit
             } else {
                 UI.updateResult(null);
             }
        }
    },
    
    updateFavoriteStarUI: async () => {
        const source = App.state.sourceCurrency || UI.getSelectedSourceCurrency();
        const target = App.state.targetCurrency || UI.getSelectedTargetCurrency();
        if (Utils.isValidCurrencyCode(source) && Utils.isValidCurrencyCode(target) && source !== target) {
            const isFav = await Storage.isFavorite({ from: source, to: target });
            UI.updateFavoriteStar(isFav);
        } else {
            UI.updateFavoriteStar(false); // Not a valid pair for favoriting
        }
    },

    // Event Handlers (to be called by UI event listeners)
    handlers: {
        handleAmountChange: () => {
            const amountVal = UI.amountInput.value;
            if (amountVal === "") { // If user clears input
                App.state.amount = null;
                Storage.saveSetting('lastAmount', ''); // Clear stored amount too
                // UI.updateResult(null); // Keep rate info visible
                App.performConversion(); // Re-run to show rate info without result
                return;
            }
            if (Utils.isValidAmount(amountVal)) {
                App.state.amount = parseFloat(amountVal);
                App.performConversion();
            } else if (amountVal !== "") { // Non-empty but invalid
                UI.showError('invalidAmountError');
                // UI.updateResult(null);
            }
        },

        
        handleCopyResult: () => {
            const resultText = UI.conversionResultText.textContent;
            if (resultText && resultText !== '---') {
                const numericResult = resultText.replace(/[^\d.,-]/g, '').replace(',', '.');
                navigator.clipboard.writeText(numericResult || resultText)
                    .then(() => {
                        UI.showCopyFeedback(); // Call the new UI function
                    })
                    .catch(err => {
                        console.error('Copy failed:', err);
                        UI.showError('copyError');
                    });
            }
        },

        handleCurrencyChange: (type) => {
    const selectedSourceFromInput = UI.sourceCurrencyInput.value.toUpperCase();
    const selectedTargetFromInput = UI.targetCurrencyInput.value.toUpperCase();
    const selectedSourceFromSelect = UI.sourceCurrencySelect.value; // Get value from select
    const selectedTargetFromSelect = UI.targetCurrencySelect.value; // Get value from select

    let finalSource = App.state.sourceCurrency;
    let finalTarget = App.state.targetCurrency;

    if (type === 'source') {
        // Prioritize select if it was the source of change, otherwise input
        // This logic might need refinement based on how you want search vs select to interact
        finalSource = Utils.isValidCurrencyCode(selectedSourceFromSelect) ? selectedSourceFromSelect : selectedSourceFromInput;
        if (Utils.isValidCurrencyCode(finalSource)) {
             App.state.sourceCurrency = finalSource;
             UI.sourceCurrencyInput.value = finalSource; // <-- 新增：确保input也更新
        }
    } else if (type === 'target') {
        finalTarget = Utils.isValidCurrencyCode(selectedTargetFromSelect) ? selectedTargetFromSelect : selectedTargetFromInput;
        if (Utils.isValidCurrencyCode(finalTarget)) {
            App.state.targetCurrency = finalTarget;
            UI.targetCurrencyInput.value = finalTarget; // <-- 新增：确保input也更新
        }
    }
    
    // Store user's choice for next session
    Storage.saveSetting('defaultSourceCurrency', App.state.sourceCurrency);
    Storage.saveSetting('defaultTargetCurrency', App.state.targetCurrency);

    App.updateFavoriteStarUI();
    App.performConversion();
},
        handleSourceCurrencyChange: () => App.handlers.handleCurrencyChange('source'),
        handleTargetCurrencyChange: () => App.handlers.handleCurrencyChange('target'),

        handleSwapCurrencies: () => {
            const oldSource = App.state.sourceCurrency || UI.getSelectedSourceCurrency();
            const oldTarget = App.state.targetCurrency || UI.getSelectedTargetCurrency();
            
            App.state.sourceCurrency = oldTarget;
            App.state.targetCurrency = oldSource;

            UI.sourceCurrencyInput.value = App.state.sourceCurrency;
            UI.targetCurrencyInput.value = App.state.targetCurrency;
            // UI.sourceCurrencySelect.value = App.state.sourceCurrency; // if using select
            // UI.targetCurrencySelect.value = App.state.targetCurrency;

            App.updateFavoriteStarUI();
            App.performConversion();
        },

        handleToggleFavorite: async () => {
            const source = App.state.sourceCurrency || UI.getSelectedSourceCurrency();
            const target = App.state.targetCurrency || UI.getSelectedTargetCurrency();

            if (!Utils.isValidCurrencyCode(source) || !Utils.isValidCurrencyCode(target) || source === target) {
                UI.showError('cannotFavoritePairError');
                return;
            }
            const pair = { from: source, to: target };
            const isFav = await Storage.isFavorite(pair);
            if (isFav) {
                await Storage.removeFavorite(pair);
            } else {
                await Storage.addFavorite(pair);
            }
            UI.updateFavoriteStar(!isFav);
            Storage.getFavorites().then(UI.renderFavorites);
        },

        handleFavoriteClick: (from, to) => {
            App.state.sourceCurrency = from;
            App.state.targetCurrency = to;
            UI.sourceCurrencyInput.value = from;
            UI.targetCurrencyInput.value = to;
            // UI.sourceCurrencySelect.value = from;
            // UI.targetCurrencySelect.value = to;

            App.updateFavoriteStarUI();
            App.performConversion();
        },
        
        handleHistoryClick: (item) => { // item = {from, to, amount, result, timestamp}
            App.state.sourceCurrency = item.from;
            App.state.targetCurrency = item.to;
            App.state.amount = item.amount;

            UI.sourceCurrencyInput.value = item.from;
            UI.targetCurrencyInput.value = item.to;
            UI.amountInput.value = item.amount;
            // UI.sourceCurrencySelect.value = item.from;
            // UI.targetCurrencySelect.value = item.to;

            App.updateFavoriteStarUI();
            App.performConversion(); // This will also re-calculate and show result
        },

        handleClearHistory: async () => {
            await Storage.clearHistory();
            UI.renderHistory([]);
        },

        
        handleLanguageToggle: () => {
            I18n.toggleLanguage();
            // Re-perform conversion to update any language-specific formatting in result/rate info
            App.performConversion();
        },
        
        handleCurrencySearch: (inputElement, type, allCurrencies) => {
            // Basic search example, you'd want something more robust
            // This is just to show the idea for an input-based dropdown
            const searchTerm = inputElement.value.toLowerCase();
            const selectElement = type === 'source' ? UI.sourceCurrencySelect : UI.targetCurrencySelect;
            
            if (!allCurrencies || allCurrencies.length === 0) return;

            const filtered = allCurrencies.filter(c => 
                c.code.toLowerCase().includes(searchTerm) || 
                (c.name && c.name.toLowerCase().includes(searchTerm))
            );
            
            // If using a custom dropdown, populate it here
            // For now, let's filter the existing <select> if you decide to show it
            // selectElement.innerHTML = ''; // Clear
            // UI.populateCurrencyDropdown(selectElement, null, filtered, null);
            // selectElement.style.display = filtered.length > 0 ? 'block' : 'none'; // Show/hide select
            
            // More advanced: create a <ul> dropdown below the input
            console.log(`Search for ${type}: ${searchTerm}`, filtered);
        }

    }
};

// Initialize the app when the popup is opened
document.addEventListener('DOMContentLoaded', App.init);