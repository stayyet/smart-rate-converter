// popup/js/ui.js
const UI = {
    // DOM Elements
    sourceCurrencyInput: document.getElementById('sourceCurrencyInput'),
    sourceCurrencySelect: document.getElementById('sourceCurrencySelect'), // Keeping select as fallback/alternative
    targetCurrencyInput: document.getElementById('targetCurrencyInput'),
    targetCurrencySelect: document.getElementById('targetCurrencySelect'),
    amountInput: document.getElementById('amountInput'),
    conversionResultText: document.getElementById('conversionResultText'),
    rateInfoText: document.getElementById('rateInfoText'),
    swapCurrenciesBtn: document.getElementById('swapCurrenciesBtn'),
    addToFavoritesBtn: document.getElementById('addToFavoritesBtn'),
    favoritesList: document.getElementById('favoritesList'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    copyResultBtn: document.getElementById('copyResultBtn'),
    convertBtn: document.getElementById('convertBtn'),
    errorMessagesContainer: document.getElementById('errorMessagesContainer'),
    errorMessageText: document.getElementById('errorMessageText'),
    langToggleBtn: document.getElementById('langToggleBtn'),
    
    _allCurrencies: [], // To store fetched currencies {code, name}

    initEventListeners: (handlers) => {
        UI.sourceCurrencyInput.addEventListener('input', (e) => handlers.handleCurrencySearch(e.target, 'source', UI._allCurrencies));
        UI.sourceCurrencyInput.addEventListener('change', handlers.handleSourceCurrencyChange); // Or blur
        UI.sourceCurrencySelect.addEventListener('change', handlers.handleSourceCurrencyChange);
        
        UI.targetCurrencyInput.addEventListener('input', (e) => handlers.handleCurrencySearch(e.target, 'target', UI._allCurrencies));
        UI.targetCurrencyInput.addEventListener('change', handlers.handleTargetCurrencyChange);
        UI.targetCurrencySelect.addEventListener('change', handlers.handleTargetCurrencyChange);

        UI.amountInput.addEventListener('input', Utils.debounce(handlers.handleAmountChange, 300));
        UI.swapCurrenciesBtn.addEventListener('click', handlers.handleSwapCurrencies);
        UI.addToFavoritesBtn.addEventListener('click', handlers.handleToggleFavorite);
        UI.copyResultBtn.addEventListener('click', handlers.handleCopyResult);
        UI.convertBtn.addEventListener('click', handlers.handleAmountChange); // Trigger conversion on click too
        UI.clearHistoryBtn.addEventListener('click', handlers.handleClearHistory);
        UI.langToggleBtn.addEventListener('click', handlers.handleLanguageToggle);

        // Event delegation for dynamically added favorites and history
        UI.favoritesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-btn')) {
                handlers.handleFavoriteClick(e.target.dataset.from, e.target.dataset.to);
            }
        });
        UI.historyList.addEventListener('click', (e) => {
            const listItem = e.target.closest('li');
            if (listItem && listItem.dataset.from) {
                 handlers.handleHistoryClick(JSON.parse(listItem.dataset.item));
            }
        });
    },

    showCopyFeedback: () => {
        const originalTitleKey = 'copyResultTooltip'; // Key for original tooltip
        const copiedTooltipKey = 'copiedTooltip';     // Key for "Copied!" tooltip

        // Prevent re-triggering animation if it's already active
        if (UI.copyResultBtn.classList.contains('copied-feedback')) {
            return;
        }

        UI.copyResultBtn.classList.add('copied-feedback');
        UI.copyResultBtn.title = I18n.getLocalizedString(copiedTooltipKey);

        // Revert after a short delay
        setTimeout(() => {
            UI.copyResultBtn.classList.remove('copied-feedback');
            // Restore original title, considering current language
            UI.copyResultBtn.title = I18n.getLocalizedString(originalTitleKey);
        }, 1500); // 1.5 seconds, same duration
    },

    populateCurrencyDropdown: (selectElement, inputElement, currencies, selectedCode) => {
        selectElement.innerHTML = ''; // Clear existing options
        // Filter/Search logic for inputElement would go here or in main.js handler
        // For now, just populate the select
        currencies.forEach(currency => {
            const option = document.createElement('option');
            option.value = currency.code;
            // Use I18n for currency names if available from API and localized
            option.textContent = `${currency.code} - ${currency.name || currency.code}`;
            if (currency.code === selectedCode) {
                option.selected = true;
                if (inputElement) inputElement.value = currency.code; // Sync input field
            }
            selectElement.appendChild(option);
        });
         if (inputElement && !selectedCode && currencies.length > 0 && !inputElement.value) {
            // If no selected code and input is empty, set input to the first currency's code as a hint
            // inputElement.value = currencies[0].code; 
        }
    },
    
    updateCurrencyDropdownsIfReady: () => {
        if (UI._allCurrencies && UI._allCurrencies.length > 0) {
            // This function might be called by I18n.applyLocale()
            // Re-populate if currency names are localized and language changed
            // Or simply re-set selected values if AppState is available
            const sourceVal = UI.sourceCurrencyInput.value || UI.sourceCurrencySelect.value;
            const targetVal = UI.targetCurrencyInput.value || UI.targetCurrencySelect.value;
            UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, UI._allCurrencies, sourceVal);
            UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, UI._allCurrencies, targetVal);
        }
    },

    setSupportedCurrencies: (currencies, defaultSource, defaultTarget) => {
        UI._allCurrencies = currencies;
        UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, currencies, defaultSource);
        UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, currencies, defaultTarget);
    },

    updateResult: (resultAmount, targetCurrency, sourceAmount, sourceCurrency, rate, isOffline, timestamp, stale) => {
        if (resultAmount === null || isNaN(resultAmount)) {
            UI.conversionResultText.textContent = '---';
            UI.rateInfoText.textContent = '';
            return;
        }
        const formattedResult = Utils.formatCurrencyWithSymbol(resultAmount, targetCurrency, I18n.currentLang);
        UI.conversionResultText.textContent = formattedResult;

        let rateInfo = '';
        if (rate) {
            rateInfo = `1 ${sourceCurrency} = ${rate.toFixed(4)} ${targetCurrency}. `;
        }
        if (isOffline) {
            const timeAgo = Utils.getTimestampDifferenceString(timestamp);
            rateInfo += stale ? I18n.getLocalizedString('staleCacheUsed', {time: timeAgo}) : I18n.getLocalizedString('offlineRateUsed', { time: timeAgo });
        } else if (timestamp) {
            rateInfo += I18n.getLocalizedString('liveRate');
        }
        UI.rateInfoText.textContent = rateInfo;
    },

    renderFavorites: (favorites) => { // favorites = [{from, to}, ...]
        UI.favoritesList.innerHTML = '';
        if (!favorites || favorites.length === 0) {
            UI.favoritesList.innerHTML = `<small>${I18n.getLocalizedString('noFavorites')}</small>`;
            return;
        }
        favorites.forEach(pair => {
            const btn = document.createElement('button');
            btn.classList.add('favorite-btn');
            btn.textContent = `${pair.from} ⇌ ${pair.to}`;
            btn.dataset.from = pair.from;
            btn.dataset.to = pair.to;
            UI.favoritesList.appendChild(btn);
        });
    },
    
    updateFavoriteStar: (isFav) => {
        UI.addToFavoritesBtn.classList.toggle('favorited', isFav);
        UI.addToFavoritesBtn.innerHTML = isFav ? '★' : '☆'; // Solid vs Hollow star
    },

    renderHistory: (historyItems) => { // historyItems = [{from, to, amount, result, timestamp}, ...]
        UI.historyList.innerHTML = '';
        if (!historyItems || historyItems.length === 0) {
            UI.historyList.innerHTML = `<li><small>${I18n.getLocalizedString('noHistory')}</small></li>`;
            return;
        }
        historyItems.forEach(item => {
            const li = document.createElement('li');
            const dateStr = new Date(item.timestamp).toLocaleString(I18n.currentLang.replace('_', '-'), { short: 'numeric', hour: '2-digit', minute: '2-digit' });
            const formattedSource = Utils.formatCurrencyWithSymbol(item.amount, item.from, I18n.currentLang);
            const formattedResult = Utils.formatCurrencyWithSymbol(item.result, item.to, I18n.currentLang);
            li.textContent = `${formattedSource} → ${formattedResult} (${dateStr})`;
            li.dataset.item = JSON.stringify(item); // Store full item data
            UI.historyList.appendChild(li);
        });
    },

    showError: (messageKeyOrText, isKey = true) => {
        const message = isKey ? I18n.getLocalizedString(messageKeyOrText) : messageKeyOrText;
        UI.errorMessageText.textContent = message || I18n.getLocalizedString('unknownError');
        UI.errorMessagesContainer.style.display = 'block';
    },

    hideError: () => {
        UI.errorMessagesContainer.style.display = 'none';
        UI.errorMessageText.textContent = '';
    },

    toggleLoading: (isLoading) => {
        // Add a spinner or change button text, e.g.
        UI.convertBtn.disabled = isLoading;
        UI.convertBtn.textContent = isLoading ? I18n.getLocalizedString('convertingButton') : I18n.getLocalizedString('convertButton');
    },
    
    getSelectedSourceCurrency: () => UI.sourceCurrencyInput.value.toUpperCase() || UI.sourceCurrencySelect.value,
    getSelectedTargetCurrency: () => UI.targetCurrencyInput.value.toUpperCase() || UI.targetCurrencySelect.value,
    getAmount: () => parseFloat(UI.amountInput.value)

};