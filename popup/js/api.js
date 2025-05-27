// popup/js/api.js
const Api = {
    API_KEY: 'e0bc454870d02713c8514950', // <-- IMPORTANT: Get your own API key!
    BASE_URL: 'https://v6.exchangerate-api.com/v6/',
    CACHE_DURATION_MS: 4 * 60 * 60 * 1000, // 4 hours

    // To store fetched supported currencies to avoid multiple calls
    _supportedCurrencies: null, 

    fetchSupportedCurrencies: async () => {
        if (Api._supportedCurrencies) {
            return Api._supportedCurrencies;
        }
        // This endpoint might not exist or might be different for your chosen API
        // For ExchangeRate-API, the list of currencies is usually part of any 'latest' request
        // or you might need to fetch it once and store it, or hardcode a list.
        // As a fallback, we'll use the currencies from a CNY base request.
        try {
            const response = await fetch(`${Api.BASE_URL}${Api.API_KEY}/latest/USD`);
            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error fetching currency list:', errorData);
                throw new Error(errorData['error-type'] || 'Failed to fetch currency list');
            }
            const data = await response.json();
            if (data.result === 'success' && data.conversion_rates) {
                // Extract currency codes
                Api._supportedCurrencies = Object.keys(data.conversion_rates).map(code => ({ code, name: code })); // Name is just code here, API might provide full names
                // You might want to sort them alphabetically by code
                Api._supportedCurrencies.sort((a, b) => a.code.localeCompare(b.code));
                return Api._supportedCurrencies;
            } else {
                 throw new Error(data['error-type'] || 'Invalid data format for currency list');
            }
        } catch (error) {
            console.error('Network or API error fetching supported currencies:', error);
            // Fallback to a minimal list if API fails
            UI.showError('apiCurrenciesError');
            Api._supportedCurrencies = [
                { code: 'USD', name: 'US Dollar' },
                { code: 'EUR', name: 'Euro' },
                { code: 'JPY', name: 'Japanese Yen' },
                { code: 'GBP', name: 'British Pound' },
                { code: 'CNY', name: 'Chinese Yuan' },
                { code: 'AUD', name: 'Australian Dollar' },
                { code: 'CAD', name: 'Canadian Dollar' },
            ];
            Api._supportedCurrencies.sort((a, b) => a.code.localeCompare(b.code));
            return Api._supportedCurrencies;
        }
    },

    fetchLatestRates: async (baseCurrency) => {
        if (!Utils.isValidCurrencyCode(baseCurrency)) {
            UI.showError(I18n.getLocalizedString('invalidBaseCurrencyError', {currency: baseCurrency}));
            return { rates: null, timestamp: null, isOffline: false, error: 'Invalid base currency' };
        }

        const cacheKey = `ratesCache_${baseCurrency}`;
        const cachedData = await Storage.get(cacheKey);
        
        if (cachedData[cacheKey] && (Date.now() - cachedData[cacheKey].timestamp < Api.CACHE_DURATION_MS)) {
            console.log(`Using cached rates for ${baseCurrency}`);
            return { ...cachedData[cacheKey], isOffline: true };
        }

        console.log(`Fetching new rates for ${baseCurrency}`);
        UI.toggleLoading(true);
        try {
            const response = await fetch(`${Api.BASE_URL}${Api.API_KEY}/latest/${baseCurrency}`);
            UI.toggleLoading(false);
            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                UI.showError(errorData['error-type'] || 'apiFetchError');
                return { rates: null, timestamp: null, isOffline: false, error: errorData['error-type'] || 'Failed to fetch rates' };
            }
            const data = await response.json();
            if (data.result === 'success') {
                const ratesData = {
                    rates: data.conversion_rates,
                    timestamp: Date.now() // Or use data.time_last_update_unix * 1000 if available
                };
                await Storage.saveRatesCache(baseCurrency, ratesData);
                return { ...ratesData, isOffline: false };
            } else {
                UI.showError(data['error-type'] || 'apiDataError');
                return { rates: null, timestamp: null, isOffline: false, error: data['error-type'] || 'Invalid data format' };
            }
        } catch (error) {
            UI.toggleLoading(false);
            console.error('Network or API error:', error);
            UI.showError('apiNetworkError');
            // Try to return old cache if network fails but cache exists (even if stale)
            if (cachedData[cacheKey]) {
                 console.log(`Network error, using stale cache for ${baseCurrency}`);
                 return { ...cachedData[cacheKey], isOffline: true, stale: true };
            }
            return { rates: null, timestamp: null, isOffline: false, error: 'Network error' };
        }
    }
};