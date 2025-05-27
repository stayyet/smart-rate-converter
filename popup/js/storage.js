// popup/js/storage.js
const Storage = {
    get: (keys) => {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => resolve(result));
        });
    },
    set: (items) => {
        return new Promise((resolve) => {
            chrome.storage.local.set(items, () => resolve());
        });
    },

    // Settings
    saveSetting: async (key, value) => Storage.set({ [key]: value }),
    loadSetting: async (key, defaultValue) => {
        const result = await Storage.get(key);
        return result[key] === undefined ? defaultValue : result[key];
    },

    // Favorites
    getFavorites: async () => (await Storage.get('favorites')).favorites || [],
    saveFavorites: async (favorites) => Storage.set({ favorites }),
    addFavorite: async (pair) => { // pair = {from: 'USD', to: 'EUR'}
        const favorites = await Storage.getFavorites();
        if (!favorites.some(p => p.from === pair.from && p.to === pair.to)) {
            favorites.push(pair);
            await Storage.saveFavorites(favorites);
        }
    },
    removeFavorite: async (pair) => {
        let favorites = await Storage.getFavorites();
        favorites = favorites.filter(p => !(p.from === pair.from && p.to === pair.to));
        await Storage.saveFavorites(favorites);
    },
    isFavorite: async (pair) => {
        const favorites = await Storage.getFavorites();
        return favorites.some(p => p.from === pair.from && p.to === pair.to);
    },

    // History
    getHistory: async () => (await Storage.get('history')).history || [],
    saveHistory: async (history) => Storage.set({ history }),
    addHistoryItem: async (item) => { // item = {from: 'USD', to: 'EUR', amount: 100, result: 85, timestamp: Date.now()}
        let history = await Storage.getHistory();
        history.unshift(item); // Add to the beginning
        if (history.length > 20) history = history.slice(0, 20); // Keep last 20
        await Storage.saveHistory(history);
    },
    clearHistory: async () => Storage.saveHistory([]),

    // Rates Cache
    getRatesCache: async (baseCurrency) => (await Storage.get(`ratesCache_${baseCurrency}`)),
    saveRatesCache: async (baseCurrency, data) => {
        // data should include rates and timestamp: { rates: {...}, timestamp: Date.now() }
        await Storage.set({ [`ratesCache_${baseCurrency}`]: data });
    }
};