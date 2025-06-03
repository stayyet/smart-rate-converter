// popup/js/api.js
const Api = {
    API_KEY: 'e0bc454870d02713c8514950', // 您的默认 API 密钥
    BASE_URL: 'https://v6.exchangerate-api.com/v6/',
    
    // --- 修改点 1：延长汇率缓存时间 ---
    // 将原来的 4 小时调整为一个更长的时间，例如 12 小时或 24 小时
    // 12 * 60 * 60 * 1000 = 12 小时
    // 24 * 60 * 60 * 1000 = 24 小时
    RATES_CACHE_DURATION_MS: 12 * 60 * 60 * 1000, // 修改为 12 小时

    // --- 修改点 2：为支持的货币列表定义缓存键和持续时间 ---
    SUPPORTED_CURRENCIES_CACHE_KEY: 'supportedCurrenciesListCache',
    SUPPORTED_CURRENCIES_CACHE_DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 例如，缓存 7 天

    _memoryCachedSupportedCurrencies: null, // 内存缓存，用于同一次会话

    // 辅助函数：记录 API 错误 (来自您之前的良好实践)
    _logApiError: function(context, error, requestUrl, responseStatus = null, responseBody = null) {
        console.error(`[Api Error - ${context}] Message: ${error.message || error}`);
        if (requestUrl) console.error(`  URL: ${requestUrl.replace(this.API_KEY, 'YOUR_API_KEY_HIDDEN')}`);
        if (responseStatus) console.error(`  Status: ${responseStatus}`);
        if (responseBody) console.error(`  Response Body:`, responseBody);
    },

    fetchSupportedCurrencies: async () => {
        // 1. 尝试从内存缓存读取 (最快)
        if (Api._memoryCachedSupportedCurrencies) {
            // console.log("[Api] fetchSupportedCurrencies: Returning from memory cache.");
            return Api._memoryCachedSupportedCurrencies;
        }

        // 2. 尝试从 chrome.storage 读取持久化缓存
        try {
            const cachedResult = await Storage.get(Api.SUPPORTED_CURRENCIES_CACHE_KEY);
            const cachedEntry = cachedResult ? cachedResult[Api.SUPPORTED_CURRENCIES_CACHE_KEY] : null;

            if (cachedEntry && cachedEntry.timestamp &&
                (Date.now() - cachedEntry.timestamp < Api.SUPPORTED_CURRENCIES_CACHE_DURATION_MS) &&
                cachedEntry.list && cachedEntry.list.length > 0) {
                console.log("[Api] fetchSupportedCurrencies: Using persisted cache from chrome.storage.");
                Api._memoryCachedSupportedCurrencies = cachedEntry.list; // 更新内存缓存
                return Api._memoryCachedSupportedCurrencies;
            }
        } catch (storageError) {
            console.error("[Api] fetchSupportedCurrencies: Error reading from chrome.storage:", storageError);
        }

        // 3. 如果内存和持久化缓存都没有或已过期，则从 API 获取
        console.log("[Api] fetchSupportedCurrencies: No valid cache found, fetching from API.");
        const requestUrl = `${Api.BASE_URL}${Api.API_KEY}/latest/USD`; // 仍然通过 /latest/USD 获取
        try {
            const response = await fetch(requestUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Failed to parse error JSON" }));
                Api._logApiError('fetchSupportedCurrencies - Response Not OK', 
                                 errorData['error-type'] || `HTTP error ${response.status}`, 
                                 requestUrl, response.status, errorData);
                UI.showError('apiCurrenciesError'); // 提示用户
                // throw new Error(errorData['error-type'] || `HTTP error ${response.status}`); // 抛出错误会导致后续备用列表逻辑执行
            } else { // 仅当 response.ok 为 true 时继续
                const data = await response.json();
                if (data.result === 'success' && data.conversion_rates) {
                    const currencyList = Object.keys(data.conversion_rates)
                                            .map(code => ({ code: code, name: code })) // API 返回的 name 就是 code
                                            .sort((a, b) => a.code.localeCompare(b.code));
                    
                    Api._memoryCachedSupportedCurrencies = currencyList; // 更新内存缓存
                    // 存储到 chrome.storage
                    await Storage.set({ 
                        [Api.SUPPORTED_CURRENCIES_CACHE_KEY]: { 
                            list: currencyList, 
                            timestamp: Date.now() 
                        } 
                    });
                    console.log("[Api] fetchSupportedCurrencies: Fetched from API and cached.");
                    return currencyList;
                } else {
                    Api._logApiError('fetchSupportedCurrencies - Invalid Data Format', 
                                     data['error-type'] || 'Invalid data format', 
                                     requestUrl, response.status, data);
                    UI.showError('apiDataError');
                    // throw new Error(data['error-type'] || 'Invalid data format for currency list');
                }
            }
        } catch (error) { // 网络错误或上面抛出的错误
            // 避免在 _logApiError 已记录 HTTP 错误时重复记录网络错误
            if (!error.message || !error.message.includes('HTTP error')) {
                 Api._logApiError('fetchSupportedCurrencies - Network/CatchAll', error, requestUrl);
            }
            // UI.showError('apiCurrenciesError'); // 可能已在上面显示
        }

        // 4. 如果所有方法都失败，返回硬编码的备用列表 (作为最后的保障)
        console.warn("[Api] fetchSupportedCurrencies: API fetch failed, using hardcoded fallback list.");
        UI.showError('apiCurrenciesError'); // 确保用户知道这是备用数据
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
        // 使用 Storage.get 获取数据，它返回一个对象，键是 cacheKey
        const cachedResult = await Storage.get(cacheKey);
        const cachedEntry = cachedResult ? cachedResult[cacheKey] : null; // 安全地从结果对象中取值
        
        // --- 修改点 1 应用：使用新的 RATES_CACHE_DURATION_MS ---
        if (cachedEntry && cachedEntry.timestamp && 
            (Date.now() - cachedEntry.timestamp < Api.RATES_CACHE_DURATION_MS)) { // 使用新的常量
            console.log(`[Api] fetchLatestRates: Using cached rates for ${baseCurrency} (valid for ${Api.RATES_CACHE_DURATION_MS / (60*60*1000)}h).`);
            return { ...cachedEntry, isOffline: true };
        }

        console.log(`[Api] fetchLatestRates: Fetching new rates for ${baseCurrency}.`);
        UI.toggleLoading(true);
        const requestUrl = `${Api.BASE_URL}${Api.API_KEY}/latest/${baseCurrency}`;
        try {
            const response = await fetch(requestUrl);
            UI.toggleLoading(false);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: "Failed to parse error JSON" }));
                Api._logApiError('fetchLatestRates - Response Not OK', 
                                 errorData['error-type'] || `HTTP error ${response.status}`, 
                                 requestUrl, response.status, errorData);
                UI.showError(errorData['error-type'] || 'apiFetchError');
                return { rates: null, timestamp: null, isOffline: false, error: errorData['error-type'] || `HTTP error ${response.status}` };
            }
            const data = await response.json();
            if (data.result === 'success' && data.conversion_rates) {
                const ratesData = {
                    rates: data.conversion_rates,
                    timestamp: data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now() // 优先使用 API 的更新时间
                };
                // 使用您 Storage 模块中的 saveRatesCache
                await Storage.saveRatesCache(baseCurrency, ratesData);
                console.log(`[Api] fetchLatestRates: Fetched new rates for ${baseCurrency} and cached.`);
                return { ...ratesData, isOffline: false };
            } else {
                Api._logApiError('fetchLatestRates - Invalid Data Format', 
                                 data['error-type'] || 'Invalid data format', 
                                 requestUrl, response.status, data);
                UI.showError(data['error-type'] || 'apiDataError');
                return { rates: null, timestamp: null, isOffline: false, error: data['error-type'] || 'Invalid data format' };
            }
        } catch (error) {
            UI.toggleLoading(false);
             if (!error.message || !error.message.includes('HTTP error')) {
                 Api._logApiError('fetchLatestRates - Network/CatchAll', error, requestUrl);
            }
            // UI.showError('apiNetworkError'); // 可能已被上面的逻辑显示

            // 如果网络错误，但存在（即使是过期的）缓存，则使用它
            if (cachedEntry) {
                 console.warn(`[Api] fetchLatestRates: Network error, using stale cache for ${baseCurrency}.`);
                 return { ...cachedEntry, isOffline: true, stale: true };
            }
            return { rates: null, timestamp: null, isOffline: false, error: error.message || 'Network error' };
        }
    }
};