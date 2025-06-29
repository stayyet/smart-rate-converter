// popup/js/main.js
const App = {
    state: {
        sourceCurrency: '',
        targetCurrency: '',
        amount: null,
        rates: null,
        ratesTimestamp: null,
        isRatesOffline: false,
        allCurrencies: [] // {code, name} (name might be same as code from API)
    },

    init: async () => {
        // console.log("[App] init - 调用 I18n.init");
        await I18n.init(); // Load language and messages first. I18n.applyLocale is called inside.
        // console.log("[App] init - I18n.init 完成");

        UI.initEventListeners(App.handlers); // Pass the handlers object
        // console.log("[App] init - UI 事件监听器初始化完成。");

        UI.hideError(); // Clear any previous errors

        await App.loadInitialData(); // Load settings, favorites, history
        
        // ** 这部分逻辑现在会加载上次关闭前保存的货币对 **
        let defaultSource = await Storage.loadSetting('defaultSourceCurrency', '');
        let defaultTarget = await Storage.loadSetting('defaultTargetCurrency', '');

        // 如果存储中没有，则根据浏览器语言设置初始默认值
        if (!defaultSource) {
            const browserLang = chrome.i18n.getUILanguage();
            if (browserLang.startsWith("zh")) defaultSource = "CNY";
            else if (browserLang.startsWith("ja")) defaultSource = "JPY";
            else if (["de", "fr", "es", "it", "pt", "nl"].some(lang => browserLang.startsWith(lang)) || browserLang.startsWith("eur")) defaultSource = "EUR";
            else defaultSource = "USD";
        }
        if (!defaultTarget) {
            defaultTarget = defaultSource === "USD" ? "EUR" : (defaultSource === "EUR" ? "USD" : (defaultSource === "CNY" ? "USD" : "USD"));
        }
        
        App.state.sourceCurrency = defaultSource.toUpperCase();
        App.state.targetCurrency = defaultTarget.toUpperCase();
        // console.log(`[App] init - 默认货币: ${App.state.sourceCurrency} -> ${App.state.targetCurrency}`);

        // console.log("[App] init - 正在获取支持的货币列表...");
        try { // Add try-catch around API call for robustness
            App.state.allCurrencies = await Api.fetchSupportedCurrencies();
        } catch (error) {
            console.error("[App] init - 调用 Api.fetchSupportedCurrencies 时发生错误:", error);
            App.state.allCurrencies = []; // Ensure it's an empty array on error
        }
        
        if (App.state.allCurrencies && App.state.allCurrencies.length > 0) {
            // console.log("[App] init - 成功获取货币列表，数量:", App.state.allCurrencies.length);
            UI.setSupportedCurrencies(App.state.allCurrencies, App.state.sourceCurrency, App.state.targetCurrency);
        } else {
            console.error("[App] init - 未能加载货币列表或列表为空 (可能是 API 错误或网络问题)。");
            UI.showError('apiCurrenciesError');
            UI.setSupportedCurrencies([], App.state.sourceCurrency, App.state.targetCurrency);
        }
        
        if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = App.state.sourceCurrency;
        if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = App.state.targetCurrency;

        App.updateFavoriteStarUI();
        App.performConversion();
        // console.log("[App] init - App 初始化全部完成。");
    },

    loadInitialData: async () => {
        const favorites = await Storage.getFavorites();
        UI.renderFavorites(favorites);

        const history = await Storage.getHistory();
        UI.renderHistory(history);
        
        const storedAmount = await Storage.loadSetting('lastAmount', '');
        if (storedAmount && UI.amountInput) {
            UI.amountInput.value = storedAmount;
            App.state.amount = parseFloat(storedAmount);
        }
    },

    performConversion: async () => {
        UI.hideError();
        const source = App.state.sourceCurrency;
        const target = App.state.targetCurrency;
        const amount = UI.getAmount();

        if (!Utils.isValidCurrencyCode(source) || !Utils.isValidCurrencyCode(target)) {
            UI.updateResult(null);
            return;
        }
        if (source === target) {
            App.state.rates = {[target]: 1};
            App.state.ratesTimestamp = Date.now();
            App.state.isRatesOffline = false;
            if (Utils.isValidAmount(amount)) {
                UI.updateResult(amount, target, amount, source, 1, false, App.state.ratesTimestamp);
            } else { 
                UI.updateResult(null, target, 1, source, 1, false, App.state.ratesTimestamp);
            }
            return;
        }

        const ratesData = await Api.fetchLatestRates(source);
        if (!ratesData || !ratesData.rates) {
            UI.updateResult(null);
            return;
        }
        App.state.rates = ratesData.rates;
        App.state.ratesTimestamp = ratesData.timestamp;
        App.state.isRatesOffline = ratesData.isOffline;

        if (App.state.rates[target] === undefined) {
             UI.showError(I18n.getLocalizedString('rateUnavailableError', { currency: target }));
             UI.updateResult(null, target, Utils.isValidAmount(amount) ? amount : 1, source, undefined, App.state.isRatesOffline, App.state.ratesTimestamp, ratesData.stale);
             return;
        }

        const rate = App.state.rates[target];
        if (Utils.isValidAmount(amount)) {
            const result = amount * rate;
            UI.updateResult(result, target, amount, source, rate, App.state.isRatesOffline, App.state.ratesTimestamp, ratesData.stale);
            
            if (source !== target) {
                 Storage.addHistoryItem({ from: source, to: target, amount, result, timestamp: Date.now() })
                    .then(Storage.getHistory)
                    .then(UI.renderHistory);
            }
            Storage.saveSetting('lastAmount', amount.toString());
        } else {
            UI.updateResult(null, target, 1, source, rate, App.state.isRatesOffline, App.state.ratesTimestamp, ratesData.stale);
        }
    },
    
    updateFavoriteStarUI: async () => {
        const source = App.state.sourceCurrency;
        const target = App.state.targetCurrency;
        if (Utils.isValidCurrencyCode(source) && Utils.isValidCurrencyCode(target) && source !== target) {
            const isFav = await Storage.isFavorite({ from: source, to: target });
            UI.updateFavoriteStar(isFav);
        } else {
            UI.updateFavoriteStar(false);
        }
    },

    handlers: {
        handleAmountChange: () => {
            if (!UI.amountInput) return;
            const amountVal = UI.amountInput.value;
            if (amountVal === "") {
                App.state.amount = null;
                Storage.saveSetting('lastAmount', '');
                App.performConversion();
                return;
            }
            if (Utils.isValidAmount(amountVal)) {
                App.state.amount = parseFloat(amountVal);
                App.performConversion();
            } else if (amountVal !== "") {
                UI.showError('invalidAmountError');
            }
        },

        handleOpenOptionsPage: () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('options.html'));
            }
        },
        
        handleCopyResult: () => { 
            if (!UI.conversionResultText || !UI.copyResultBtn) return;
            const resultText = UI.conversionResultText.textContent;
            if (resultText && resultText !== '---') {
                const numericResult = resultText.replace(/[^\d.,-]/g, '').replace(',', '.');
                navigator.clipboard.writeText(numericResult || resultText)
                    .then(() => {
                        if (typeof UI.showCopyFeedback === 'function') { 
                            UI.showCopyFeedback();
                        } else { 
                            console.warn("UI.showCopyFeedback function not found.");
                        }
                    })
                    .catch(err => {
                        console.error('Copy failed:', err);
                        UI.showError('copyError');
                    });
            }
        },

        handleCurrencyChange: (type) => {
            let changedCode = '';
            let stateKeyToUpdate = '';
            let inputElementToSync = null;
            let selectElement = null;
            let settingKey = '';

            if (type === 'source') {
                selectElement = UI.sourceCurrencySelect;
                inputElementToSync = UI.sourceCurrencyInput;
                stateKeyToUpdate = 'sourceCurrency';
                settingKey = 'defaultSourceCurrency';
            } else { // target
                selectElement = UI.targetCurrencySelect;
                inputElementToSync = UI.targetCurrencyInput;
                stateKeyToUpdate = 'targetCurrency';
                settingKey = 'defaultTargetCurrency';
            }

            if (selectElement && selectElement.value) {
                 changedCode = selectElement.value;
            } else if (inputElementToSync && inputElementToSync.value) {
                 changedCode = inputElementToSync.value.trim().toUpperCase();
            }

            if (Utils.isValidCurrencyCode(changedCode)) {
                if (App.state[stateKeyToUpdate] !== changedCode) {
                    App.state[stateKeyToUpdate] = changedCode;
                    if (inputElementToSync) inputElementToSync.value = changedCode;
                    if (selectElement && selectElement.value !== changedCode) selectElement.value = changedCode;
                    
                    // 这是保存货币对的主要逻辑，当用户手动选择时触发
                    Storage.saveSetting(settingKey, App.state[stateKeyToUpdate]);
                    
                    App.updateFavoriteStarUI();
                    App.performConversion();
                }
            } else if (changedCode !== '') { 
                if (inputElementToSync) {
                    inputElementToSync.value = App.state[stateKeyToUpdate]; 
                }
                 if (selectElement) { 
                    selectElement.value = App.state[stateKeyToUpdate];
                }
                UI.showError(I18n.getLocalizedString('invalidBaseCurrencyError', { currency: changedCode }));
            }
        },
        handleSourceCurrencyChange: () => App.handlers.handleCurrencyChange('source'),
        handleTargetCurrencyChange: () => App.handlers.handleCurrencyChange('target'),

        // **** MODIFIED START: Added async and storage saving ****
        handleSwapCurrencies: async () => {
            const oldSource = App.state.sourceCurrency;
            const oldTarget = App.state.targetCurrency;
            
            App.state.sourceCurrency = oldTarget;
            App.state.targetCurrency = oldSource;

            // Save the swapped currencies to storage
            await Storage.saveSetting('defaultSourceCurrency', App.state.sourceCurrency);
            await Storage.saveSetting('defaultTargetCurrency', App.state.targetCurrency);

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = App.state.sourceCurrency;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = App.state.sourceCurrency;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = App.state.targetCurrency;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = App.state.targetCurrency;

            App.updateFavoriteStarUI();
            App.performConversion();
        },
        // **** MODIFIED END ****

        handleToggleFavorite: async () => {
            const source = App.state.sourceCurrency;
            const target = App.state.targetCurrency;

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

        // **** MODIFIED START: Added async and storage saving ****
        handleFavoriteClick: async (from, to) => {
            App.state.sourceCurrency = from;
            App.state.targetCurrency = to;

            // Save the selected favorite pair to storage
            await Storage.saveSetting('defaultSourceCurrency', from);
            await Storage.saveSetting('defaultTargetCurrency', to);

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = from;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = from;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = to;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = to;

            App.updateFavoriteStarUI();
            App.performConversion();
        },
        // **** MODIFIED END ****
        
        // **** MODIFIED START: Added async and storage saving ****
        handleHistoryClick: async (item) => {
            App.state.sourceCurrency = item.from;
            App.state.targetCurrency = item.to;
            App.state.amount = item.amount;

            // Save the selected history pair to storage
            await Storage.saveSetting('defaultSourceCurrency', item.from);
            await Storage.saveSetting('defaultTargetCurrency', item.to);

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = item.from;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = item.from;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = item.to;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = item.to;
            if (UI.amountInput) UI.amountInput.value = item.amount;

            App.updateFavoriteStarUI();
            App.performConversion();
        },
        // **** MODIFIED END ****

        handleClearHistory: async () => {
            await Storage.clearHistory();
            UI.renderHistory([]);
        },
        
        handleLanguageToggle: () => {
            I18n.toggleLanguage(); 
        },
        
        handleCurrencySearch: (inputElement, type, allCurrencies) => {
            const searchTerm = inputElement.value.toLowerCase();
            if (!allCurrencies || allCurrencies.length === 0) return;
            const filtered = allCurrencies.filter(c => 
                c.code.toLowerCase().includes(searchTerm) || 
                (I18n.getCurrencyFullName(c.code) || '').toLowerCase().includes(searchTerm)
            );
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});