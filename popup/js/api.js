// popup/js/api.js
const Api = {
    DEFAULT_API_KEY: 'e0bc454870d02713c8514950', // 您的默认后备 API 密钥
    _userApiKeyPromise: null,    // 用于缓存加载用户 API Key 的 Promise，确保只加载一次
    _currentEffectiveApiKey: null, // 缓存当前会话实际应该使用的API Key (用户的或默认的)

    BASE_URL: 'https://v6.exchangerate-api.com/v6/',
    RATES_CACHE_DURATION_MS: 12 * 60 * 60 * 1000, // 12 小时汇率缓存
    SUPPORTED_CURRENCIES_CACHE_KEY: 'supportedCurrenciesListCache',
    SUPPORTED_CURRENCIES_CACHE_DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 天货币列表缓存
    _memoryCachedSupportedCurrencies: null,

    /**
     * 决定当前应该使用哪个API Key (用户提供的或默认的)。
     * 结果会被缓存在 _currentEffectiveApiKey 以避免重复加载 Storage。
     * @returns {Promise<string>} 将要使用的 API Key.
     */
    _getApiKeyToUse: async function() {
        // 如果已经解析并缓存了当前会话应该使用的Key，则直接返回
        if (this._currentEffectiveApiKey) {
            return this._currentEffectiveApiKey;
        }

        // 如果 _userApiKeyPromise 不存在，说明是首次尝试加载用户Key，或者需要重新加载
        if (!this._userApiKeyPromise) {
            console.log("[Api] _getApiKeyToUse: 首次尝试加载用户 API Key 设置。");
            this._userApiKeyPromise = Storage.loadSetting('userApiKey', '') // 默认值为空字符串
                .then(storedUserKey => {
                    if (storedUserKey && storedUserKey.trim() !== '') {
                        console.log("[Api] _getApiKeyToUse: 找到并使用用户提供的 API Key。");
                        return storedUserKey.trim();
                    }
                    console.log("[Api] _getApiKeyToUse: 未找到用户 API Key 或为空，将使用默认 API Key。");
                    return this.DEFAULT_API_KEY; // 如果用户Key为空或未设置，则返回默认Key
                })
                .catch(error => {
                    console.error("[Api] _getApiKeyToUse: 从存储加载用户 API Key 时出错，将使用默认 API Key:", error);
                    return this.DEFAULT_API_KEY; // 出错时也使用默认Key
                });
        }

        this._currentEffectiveApiKey = await this._userApiKeyPromise;
        return this._currentEffectiveApiKey;
    },

    _logApiError: function(context, error, requestUrl, apiKeyInUse, responseStatus = null, responseBody = null) {
        console.error(`[Api Error - ${context}] Message: ${error.message || String(error)}`);
        let apiKeyDisplay = 'N/A';
        if (apiKeyInUse) {
            apiKeyDisplay = (apiKeyInUse === this.DEFAULT_API_KEY) ? 'Default Key' : 'User Key';
            // 为了安全，只打印Key的部分信息或类型，而不是完整Key
            // requestUrl = requestUrl.replace(apiKeyInUse, `[KEY_TYPE:${apiKeyDisplay}]`);
        }
        // 在日志中隐藏完整的API密钥，只显示类型
        if (requestUrl) console.error(`  URL (Key type used: ${apiKeyDisplay}): ${requestUrl.substring(0, requestUrl.indexOf(apiKeyInUse) + apiKeyInUse.length)}... (部分隐藏)`);
        if (responseStatus) console.error(`  Status: ${responseStatus}`);
        if (responseBody) console.error(`  Response Body:`, responseBody);
    },

    fetchSupportedCurrencies: async () => {
        if (Api._memoryCachedSupportedCurrencies) {
            return Api._memoryCachedSupportedCurrencies;
        }
        try {
            const cachedResult = await Storage.get(Api.SUPPORTED_CURRENCIES_CACHE_KEY);
            const cachedEntry = cachedResult ? cachedResult[Api.SUPPORTED_CURRENCIES_CACHE_KEY] : null;
            if (cachedEntry && cachedEntry.timestamp &&
                (Date.now() - cachedEntry.timestamp < Api.SUPPORTED_CURRENCIES_CACHE_DURATION_MS) &&
                cachedEntry.list && cachedEntry.list.length > 0) {
                console.log("[Api] fetchSupportedCurrencies: Using persisted cache.");
                Api._memoryCachedSupportedCurrencies = cachedEntry.list;
                return Api._memoryCachedSupportedCurrencies;
            }
        } catch (storageError) {
            console.error("[Api] fetchSupportedCurrencies: Error reading from chrome.storage:", storageError);
        }

        const apiKeyToUse = await Api._getApiKeyToUse(); // <<<< 使用新的密钥获取方法
        console.log(`[Api] fetchSupportedCurrencies: No valid cache, fetching from API using ${apiKeyToUse === Api.DEFAULT_API_KEY ? 'default' : 'user'} key.`);
        const requestUrl = `${Api.BASE_URL}${apiKeyToUse}/latest/USD`;
        try {
            const response = await fetch(requestUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Failed to parse error JSON" }));
                Api._logApiError('fetchSupportedCurrencies - Response Not OK', 
                                 errorData['error-type'] || `HTTP error ${response.status}`, 
                                 requestUrl, apiKeyToUse, response.status, errorData);
                if (errorData['error-type'] === 'invalid-key' && apiKeyToUse !== Api.DEFAULT_API_KEY) {
                    UI.showError(I18n.getLocalizedString('apiKeyInvalidError'), false);
                } else {
                    UI.showError('apiCurrenciesError');
                }
                // 继续尝试返回备用列表，而不是在这里完全中断
            } else {
                const data = await response.json();
                if (data.result === 'success' && data.conversion_rates) {
                    const currencyList = Object.keys(data.conversion_rates).map(code => ({ code, name: code })).sort((a, b) => a.code.localeCompare(b.code));
                    Api._memoryCachedSupportedCurrencies = currencyList;
                    await Storage.set({ [Api.SUPPORTED_CURRENCIES_CACHE_KEY]: { list: currencyList, timestamp: Date.now() } });
                    console.log("[Api] fetchSupportedCurrencies: Fetched from API and cached.");
                    return currencyList;
                } else {
                    Api._logApiError('fetchSupportedCurrencies - Invalid Data Format', data['error-type'] || 'Invalid data format', requestUrl, apiKeyToUse, response.status, data);
                    UI.showError('apiDataError');
                }
            }
        } catch (error) {
            if (!error.message || !error.message.includes('HTTP error')) { // Avoid double logging if error came from response.ok check
                 Api._logApiError('fetchSupportedCurrencies - Network/CatchAll', error, requestUrl, apiKeyToUse);
            }
        }

        console.warn("[Api] fetchSupportedCurrencies: API fetch failed or returned invalid data, using hardcoded fallback list.");
        if (!UI.errorMessageText.textContent.includes(I18n.getLocalizedString('apiKeyInvalidError'))) { // 避免重复显示通用错误
            UI.showError('apiCurrenciesError');
        }
        Api._memoryCachedSupportedCurrencies = [
            { code: 'USD', name: 'US Dollar' }, { code: 'EUR', name: 'Euro' },
            { code: 'JPY', name: 'Japanese Yen' }, { code: 'GBP', name: 'British Pound' },
            { code: 'CNY', name: 'Chinese Yuan' }, { code: 'AUD', name: 'Australian Dollar' },
            { code: 'CAD', name: 'Canadian Dollar' },
        ].sort((a, b) => a.code.localeCompare(b.code));
        return Api._memoryCachedSupportedCurrencies;
    },

    fetchLatestRates: async (baseCurrency) => {
        if (!Utils.isValidCurrencyCode(baseCurrency)) {
            UI.showError(I18n.getLocalizedString('invalidBaseCurrencyError', {currency: baseCurrency}));
            return { rates: null, timestamp: null, isOffline: false, error: 'Invalid base currency' };
        }

        const cacheKey = `ratesCache_${baseCurrency}`;
        const cachedResult = await Storage.get(cacheKey);
        const cachedEntry = cachedResult ? cachedResult[cacheKey] : null;
        
        if (cachedEntry && cachedEntry.timestamp && (Date.now() - cachedEntry.timestamp < Api.RATES_CACHE_DURATION_MS)) {
            console.log(`[Api] fetchLatestRates: Using cached rates for ${baseCurrency}.`);
            return { ...cachedEntry, isOffline: true };
        }

        const apiKeyToUse = await Api._getApiKeyToUse(); // <<<< 使用新的密钥获取方法
        console.log(`[Api] fetchLatestRates: Fetching new rates for ${baseCurrency} using ${apiKeyToUse === Api.DEFAULT_API_KEY ? 'default' : 'user'} key.`);
        UI.toggleLoading(true);
        const requestUrl = `${Api.BASE_URL}${apiKeyToUse}/latest/${baseCurrency}`;
        try {
            const response = await fetch(requestUrl);
            UI.toggleLoading(false);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Failed to parse error JSON" }));
                Api._logApiError('fetchLatestRates - Response Not OK', 
                                 errorData['error-type'] || `HTTP error ${response.status}`, 
                                 requestUrl, apiKeyToUse, response.status, errorData);
                // 根据使用的密钥类型给出不同提示
                if (errorData['error-type'] === 'invalid-key' && apiKeyToUse !== Api.DEFAULT_API_KEY) {
                    UI.showError(I18n.getLocalizedString('apiKeyInvalidError'), false);
                } else if (errorData['error-type'] === 'quota-reached' && apiKeyToUse !== Api.DEFAULT_API_KEY) {
                    UI.showError(I18n.getLocalizedString('apiKeyQuotaError'), false);
                } else { // 其他错误，或者使用默认key时的错误
                    UI.showError(errorData['error-type'] || 'apiFetchError');
                }
                return { rates: null, timestamp: null, isOffline: false, error: errorData['error-type'] || `HTTP error ${response.status}` };
            }
            const data = await response.json();
            if (data.result === 'success' && data.conversion_rates) {
                const ratesData = {
                    rates: data.conversion_rates,
                    timestamp: data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now()
                };
                await Storage.saveRatesCache(baseCurrency, ratesData);
                console.log(`[Api] fetchLatestRates: Fetched new rates for ${baseCurrency} and cached.`);
                return { ...ratesData, isOffline: false };
            } else {
                Api._logApiError('fetchLatestRates - Invalid Data Format', data['error-type'] || 'Invalid data format', requestUrl, apiKeyToUse, response.status, data);
                UI.showError(data['error-type'] || 'apiDataError');
                return { rates: null, timestamp: null, isOffline: false, error: data['error-type'] || 'Invalid data format' };
            }
        } catch (error) {
            UI.toggleLoading(false);
            if (!error.message || !error.message.includes('HTTP error')) {
                 Api._logApiError('fetchLatestRates - Network/CatchAll', error, requestUrl, apiKeyToUse);
            }
             // 如果有错误，且不是特定于用户密钥的错误，则显示通用网络错误
            if (!UI.errorMessageText.textContent.includes(I18n.getLocalizedString('apiKeyInvalidError')) &&
                !UI.errorMessageText.textContent.includes(I18n.getLocalizedString('apiKeyQuotaError'))) {
                UI.showError('apiNetworkError');
            }
            
            if (cachedEntry) {
                 console.warn(`[Api] fetchLatestRates: Network error, using stale cache for ${baseCurrency}.`);
                 return { ...cachedEntry, isOffline: true, stale: true };
            }
            return { rates: null, timestamp: null, isOffline: false, error: error.message || 'Network error' };
        }
    }
};

// 当用户在设置页面更改了 API Key 时，我们需要一种方式来重置 Api 模块中缓存的密钥，
// 以便下次 popup 打开或下次 API 调用时能加载新的用户 Key。
// 简单的方式是：popup 每次打开时，都重置这两个缓存。
// 可以在 App.init 的最开始调用一个 Api.resetApiKeyCache() 方法。
// 或者，如果 popup 可能会长时间保持打开状态（不常见），
// 则需要通过 chrome.storage.onChanged 监听 'userApiKey' 的变化并发送消息或直接重置。

// 为了简化，我们假设用户更改 API Key 后会重新打开 popup。
// 要想在 popup 打开时强制重新加载用户 Key，可以在 App.init 中调用：
// if (Api && typeof Api.resetApiKeyCache === 'function') { Api.resetApiKeyCache(); }
// 然后在 Api 对象中添加：
// resetApiKeyCache: function() {
//     this._userApiKeyPromise = null;
//     this._currentEffectiveApiKey = null;
//     console.log("[Api] API Key cache reset. Will reload from storage on next call.");
// }
// 这样，每次打开 popup 都会从 Storage 重新读取 userApiKey。