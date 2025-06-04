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
        
        const browserLang = chrome.i18n.getUILanguage();
        let defaultSource = await Storage.loadSetting('defaultSourceCurrency', '');
        let defaultTarget = await Storage.loadSetting('defaultTargetCurrency', '');

        if (!defaultSource) {
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
            // **即使 API 失败，也调用 UI.setSupportedCurrencies 传入空数组**
            // **这样 UI.updateCurrencyDropdownsIfReady 会被调用，然后 populateCurrencyDropdown 会显示 "暂无可用货币"**
            UI.setSupportedCurrencies([], App.state.sourceCurrency, App.state.targetCurrency);
        }
        
        // 确保输入框的值与 App.state 同步
        // UI.setSupportedCurrencies 内部的 populateCurrencyDropdown 应该已经处理了 selectedCode,
        // 并且如果 inputElementToSync 存在，也会同步输入框。
        // 所以下面的显式设置可能在多数情况下是多余的，但保留也无害。
        if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = App.state.sourceCurrency;
        if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = App.state.targetCurrency;

        App.updateFavoriteStarUI();
        App.performConversion();
        // console.log("[App] init - App 初始化全部完成。");
    },

    // loadInitialData, performConversion, updateFavoriteStarUI 保持不变
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

    // handlers 对象保持不变 (除了之前已修正的 handleOpenOptionsPage 位置)
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
            // console.log("[App.handlers] handleOpenOptionsPage 被调用！");
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                console.warn("[App.handlers] chrome.runtime.openOptionsPage 不可用，使用 window.open。");
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

            // Determine if change came from <select> or <input>
            // This logic assumes 'change' on input is blur/enter, select is on selection
            // If 'this' is bound to the event target, we could check event.target.tagName
            // For simplicity, we'll check select value first
            if (selectElement && selectElement.value) {
                 changedCode = selectElement.value;
            } else if (inputElementToSync && inputElementToSync.value) {
                 changedCode = inputElementToSync.value.trim().toUpperCase();
            }


            if (Utils.isValidCurrencyCode(changedCode)) {
                if (App.state[stateKeyToUpdate] !== changedCode) {
                    App.state[stateKeyToUpdate] = changedCode;
                    if (inputElementToSync) inputElementToSync.value = changedCode;
                    if (selectElement && selectElement.value !== changedCode) selectElement.value = changedCode; // Sync select if input changed
                    Storage.saveSetting(settingKey, App.state[stateKeyToUpdate]);
                    
                    App.updateFavoriteStarUI();
                    App.performConversion();
                }
            } else if (changedCode !== '') { // Invalid code typed and not empty
                if (inputElementToSync) {
                    inputElementToSync.value = App.state[stateKeyToUpdate]; // Revert input
                }
                 if (selectElement) { // Revert select as well
                    selectElement.value = App.state[stateKeyToUpdate];
                }
                UI.showError(I18n.getLocalizedString('invalidBaseCurrencyError', { currency: changedCode }));
            }
            // If changedCode is empty, do nothing, wait for valid selection/input
        },
        handleSourceCurrencyChange: () => App.handlers.handleCurrencyChange('source'),
        handleTargetCurrencyChange: () => App.handlers.handleCurrencyChange('target'),

        handleSwapCurrencies: () => {
            const oldSource = App.state.sourceCurrency;
            const oldTarget = App.state.targetCurrency;
            
            App.state.sourceCurrency = oldTarget;
            App.state.targetCurrency = oldSource;

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = App.state.sourceCurrency;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = App.state.sourceCurrency;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = App.state.targetCurrency;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = App.state.targetCurrency;

            App.updateFavoriteStarUI();
            App.performConversion();
        },

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

        handleFavoriteClick: (from, to) => {
            App.state.sourceCurrency = from;
            App.state.targetCurrency = to;

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = from;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = from;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = to;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = to;

            App.updateFavoriteStarUI();
            App.performConversion();
        },
        
        handleHistoryClick: (item) => {
            App.state.sourceCurrency = item.from;
            App.state.targetCurrency = item.to;
            App.state.amount = item.amount;

            if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = item.from;
            if (UI.sourceCurrencySelect) UI.sourceCurrencySelect.value = item.from;
            if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = item.to;
            if (UI.targetCurrencySelect) UI.targetCurrencySelect.value = item.to;
            if (UI.amountInput) UI.amountInput.value = item.amount;

            App.updateFavoriteStarUI();
            App.performConversion();
        },

        handleClearHistory: async () => {
            await Storage.clearHistory();
            UI.renderHistory([]);
        },
        
        handleLanguageToggle: () => {
            // console.log("[App.handlers] handleLanguageToggle 被调用。");
            I18n.toggleLanguage(); 
            // I18n.toggleLanguage -> I18n.applyLocale -> UI.updateCurrencyDropdownsIfReady
            // And I18n.toggleLanguage now calls App.performConversion itself.
            // So, this explicit call here is not strictly needed IF I18n.toggleLanguage ensures it.
            // App.performConversion(); 
        },
        
        handleCurrencySearch: (inputElement, type, allCurrencies) => {
            const searchTerm = inputElement.value.toLowerCase();
            if (!allCurrencies || allCurrencies.length === 0) return;
            const filtered = allCurrencies.filter(c => 
                c.code.toLowerCase().includes(searchTerm) || 
                (I18n.getCurrencyFullName(c.code) || '').toLowerCase().includes(searchTerm)
            );
            // console.log(`[App.handlers] Search for ${type}: ${searchTerm}`, filtered.map(f=>f.code));
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // console.log("[DOMContentLoaded] DOM 已加载，准备调用 App.init。");
    App.init();
});