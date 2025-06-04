// popup/js/ui.js
const UI = {
    // DOM Elements
    sourceCurrencyInput: document.getElementById('sourceCurrencyInput'),
    sourceCurrencySelect: document.getElementById('sourceCurrencySelect'),
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
    settingsBtn: document.getElementById('settingsBtn'), // <<<< 新增/确认此行

    _allCurrencies: [], // 将存储从 API 获取的 {code, name} 列表

    initEventListeners: (handlers) => {
        // console.log("[UI] initEventListeners - 开始初始化事件监听器。");
        
        // 为元素存在性添加检查，使其更健壮
        if (UI.sourceCurrencyInput) {
            UI.sourceCurrencyInput.addEventListener('input', (e) => handlers.handleCurrencySearch(e.target, 'source', UI._allCurrencies));
            UI.sourceCurrencyInput.addEventListener('change', handlers.handleSourceCurrencyChange);
        }
        if (UI.sourceCurrencySelect) {
            UI.sourceCurrencySelect.addEventListener('change', handlers.handleSourceCurrencyChange);
        }
        
        if (UI.targetCurrencyInput) {
            UI.targetCurrencyInput.addEventListener('input', (e) => handlers.handleCurrencySearch(e.target, 'target', UI._allCurrencies));
            UI.targetCurrencyInput.addEventListener('change', handlers.handleTargetCurrencyChange);
        }
        if (UI.targetCurrencySelect) {
            UI.targetCurrencySelect.addEventListener('change', handlers.handleTargetCurrencyChange);
        }

        if (UI.amountInput) UI.amountInput.addEventListener('input', Utils.debounce(handlers.handleAmountChange, 300));
        if (UI.swapCurrenciesBtn) UI.swapCurrenciesBtn.addEventListener('click', handlers.handleSwapCurrencies);
        if (UI.addToFavoritesBtn) UI.addToFavoritesBtn.addEventListener('click', handlers.handleToggleFavorite);
        
        if (UI.copyResultBtn) {
            UI.copyResultBtn.addEventListener('click', handlers.handleCopyResult);
        }
        
        if (UI.convertBtn) UI.convertBtn.addEventListener('click', handlers.handleAmountChange);
        if (UI.clearHistoryBtn) UI.clearHistoryBtn.addEventListener('click', handlers.handleClearHistory);
        
        if (UI.langToggleBtn) { // 检查语言切换按钮是否存在
            UI.langToggleBtn.addEventListener('click', handlers.handleLanguageToggle);
        } else {
            console.warn("[UI] langToggleBtn 元素未在 DOM 中找到。");
        }

        // **** 新增/修改：为 settingsBtn 附加事件监听器 ****
        if (UI.settingsBtn) {
            UI.settingsBtn.addEventListener('click', handlers.handleOpenOptionsPage);
            // console.log("[UI] settingsBtn 事件监听器已附加。");
        } else {
            // 如果 HTML 中没有 settingsBtn，这个警告是正常的
            // console.warn("[UI] settingsBtn 元素未在 DOM 中找到。如果您已添加该按钮，请检查 HTML ID。");
        }

        // 事件委托保持不变
        if (UI.favoritesList) UI.favoritesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-btn')) {
                handlers.handleFavoriteClick(e.target.dataset.from, e.target.dataset.to);
            }
        });
        if (UI.historyList) UI.historyList.addEventListener('click', (e) => {
            const listItem = e.target.closest('li');
            if (listItem && listItem.dataset && listItem.dataset.item) {
                 try {
                     handlers.handleHistoryClick(JSON.parse(listItem.dataset.item));
                 } catch (jsonError) {
                     console.error("解析历史记录项数据失败:", jsonError, listItem.dataset.item);
                 }
            }
        });
    },

    showCopyFeedback: () => {
        const originalTitleKey = 'copyResultTooltip';
        const copiedTooltipKey = 'copiedTooltip';

        if (!UI.copyResultBtn) return; 

        if (UI.copyResultBtn.classList.contains('copied-feedback')) return;

        UI.copyResultBtn.classList.add('copied-feedback');
        UI.copyResultBtn.title = I18n.getLocalizedString(copiedTooltipKey);

        setTimeout(() => {
            if (UI.copyResultBtn) { 
                UI.copyResultBtn.classList.remove('copied-feedback');
                UI.copyResultBtn.title = I18n.getLocalizedString(originalTitleKey);
            }
        }, 1500);
    },

    populateCurrencyDropdown: (selectElement, inputElementToSync, currencies, selectedCode) => {
        if (!selectElement) {
            console.error("[UI] populateCurrencyDropdown: selectElement is null or undefined.");
            return;
        }
        selectElement.innerHTML = '';

        if (!currencies || currencies.length === 0) {
            const option = document.createElement('option');
            option.textContent = I18n.getLocalizedString('noCurrenciesToList', 'No currencies');
            option.disabled = true;
            selectElement.appendChild(option);
            return;
        }

        currencies.forEach(currency => {
            if (!currency || !currency.code) {
                console.warn("[UI] populateCurrencyDropdown: 发现无效的货币对象", currency);
                return;
            }
            const option = document.createElement('option');
            option.value = currency.code;

            const currencyCode = currency.code.toUpperCase();
            const currencyFullName = I18n.getCurrencyFullName(currencyCode); 

            if (currencyFullName && currencyFullName.toUpperCase() !== currencyCode) {
                option.textContent = `${currencyCode} - ${currencyFullName}`;
            } else {
                option.textContent = currencyCode;
            }

            if (currencyCode === (selectedCode ? selectedCode.toUpperCase() : null)) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
        
        if (inputElementToSync) {
            if (selectElement.value) { 
                inputElementToSync.value = selectElement.value;
            } else if (selectedCode) { 
                inputElementToSync.value = selectedCode.toUpperCase();
            }
        }
    },
    
    updateCurrencyDropdownsIfReady: () => {
        // console.log("[UI] updateCurrencyDropdownsIfReady 被调用。");
        if (UI._allCurrencies && UI._allCurrencies.length > 0) {
            const sourceVal = (typeof App !== 'undefined' && App.state && App.state.sourceCurrency)
                              ? App.state.sourceCurrency
                              : (UI.sourceCurrencyInput ? UI.sourceCurrencyInput.value : (UI.sourceCurrencySelect ? UI.sourceCurrencySelect.value : ''));
            
            const targetVal = (typeof App !== 'undefined' && App.state && App.state.targetCurrency)
                              ? App.state.targetCurrency
                              : (UI.targetCurrencyInput ? UI.targetCurrencyInput.value : (UI.targetCurrencySelect ? UI.targetCurrencySelect.value : ''));

            // console.log(`[UI] 重新填充下拉列表。源: ${sourceVal}, 目标: ${targetVal}`);

            if (UI.sourceCurrencySelect) {
                UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, UI._allCurrencies, sourceVal);
            }
            if (UI.targetCurrencySelect) {
                UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, UI._allCurrencies, targetVal);
            }
        } else {
            console.warn("[UI] updateCurrencyDropdownsIfReady: _allCurrencies 为空或尚未加载。将显示'无可用货币'。");
            if (UI.sourceCurrencySelect) UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, [], null);
            if (UI.targetCurrencySelect) UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, [], null);
        }
    },

    setSupportedCurrencies: (currencies, defaultSource, defaultTarget) => {
        // console.log("[UI] setSupportedCurrencies - 接收到的货币数量:", currencies ? currencies.length : 0, "默认源:", defaultSource, "默认目标:", defaultTarget);
        UI._allCurrencies = currencies || []; 

        if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = defaultSource || '';
        if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = defaultTarget || '';
        
        UI.updateCurrencyDropdownsIfReady();
    },

    updateResult: (resultAmount, targetCurrency, sourceAmount, sourceCurrency, rate, isOffline, timestamp, stale) => {
        if (!UI.conversionResultText || !UI.rateInfoText) return;

        if (resultAmount === null || isNaN(resultAmount)) {
            UI.conversionResultText.textContent = '---';
            UI.rateInfoText.textContent = '';
            if (Utils.isValidCurrencyCode(sourceCurrency) && Utils.isValidCurrencyCode(targetCurrency) && rate !== undefined) {
                 let rateInfoTextContent = `1 ${sourceCurrency} = ${rate !== undefined ? rate.toFixed(4) : 'N/A'} ${targetCurrency}. `; // Renamed variable to avoid conflict
                 if (isOffline && timestamp) {
                    const timeAgo = Utils.getTimestampDifferenceString(timestamp);
                    rateInfoTextContent += stale ? I18n.getLocalizedString('staleCacheUsed', {time: timeAgo}) : I18n.getLocalizedString('offlineRateUsed', { time: timeAgo });
                 } else if (timestamp) {
                     rateInfoTextContent += I18n.getLocalizedString('liveRate');
                 }
                 UI.rateInfoText.textContent = rateInfoTextContent;
            }
            return;
        }
        const formattedResult = Utils.formatCurrencyWithSymbol(resultAmount, targetCurrency, I18n.currentLang);
        UI.conversionResultText.textContent = formattedResult;

        let rateInfoTextContent = ''; // Renamed variable
        if (rate !== undefined) { 
            rateInfoTextContent = `1 ${sourceCurrency} = ${rate.toFixed(4)} ${targetCurrency}. `;
        }
        if (isOffline && timestamp) {
            const timeAgo = Utils.getTimestampDifferenceString(timestamp);
            rateInfoTextContent += stale ? I18n.getLocalizedString('staleCacheUsed', {time: timeAgo}) : I18n.getLocalizedString('offlineRateUsed', { time: timeAgo });
        } else if (timestamp) {
            rateInfoTextContent += I18n.getLocalizedString('liveRate');
        }
        UI.rateInfoText.textContent = rateInfoTextContent;
    },

    renderFavorites: (favorites) => { 
        if (!UI.favoritesList) return;
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
        if (!UI.addToFavoritesBtn) return;
        UI.addToFavoritesBtn.classList.toggle('favorited', isFav);
        UI.addToFavoritesBtn.innerHTML = isFav ? '★' : '☆';
        UI.addToFavoritesBtn.title = isFav 
            ? I18n.getLocalizedString('removeFromFavoritesTooltip') 
            : I18n.getLocalizedString('addToFavoritesTooltip');
    },

    renderHistory: (historyItems) => { 
        if (!UI.historyList) return;
        UI.historyList.innerHTML = '';
        if (!historyItems || historyItems.length === 0) {
            UI.historyList.innerHTML = `<li><small>${I18n.getLocalizedString('noHistory')}</small></li>`;
            return;
        }
        historyItems.forEach(item => {
            const li = document.createElement('li');
            const langForDate = I18n.currentLang.replace('_', '-');
            const dateStr = new Date(item.timestamp).toLocaleString(langForDate, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const formattedSource = Utils.formatCurrencyWithSymbol(item.amount, item.from, I18n.currentLang);
            const formattedResult = Utils.formatCurrencyWithSymbol(item.result, item.to, I18n.currentLang);
            li.innerHTML = `${formattedSource} → ${formattedResult} <small class="history-date">(${dateStr})</small>`;
            li.dataset.item = JSON.stringify(item);
            UI.historyList.appendChild(li);
        });
    },

    showError: (messageKeyOrText, isKey = true) => {
        if (!UI.errorMessageText || !UI.errorMessagesContainer) return;
        const message = isKey ? I18n.getLocalizedString(messageKeyOrText) : messageKeyOrText;
        UI.errorMessageText.textContent = message || I18n.getLocalizedString('unknownError');
        UI.errorMessagesContainer.style.display = 'block';
    },
    hideError: () => {
        if (!UI.errorMessagesContainer) return;
        UI.errorMessagesContainer.style.display = 'none';
        UI.errorMessageText.textContent = '';
    },
    toggleLoading: (isLoading) => {
        if (!UI.convertBtn) return;
        UI.convertBtn.disabled = isLoading;
        UI.convertBtn.textContent = isLoading ? I18n.getLocalizedString('convertingButton') : I18n.getLocalizedString('convertButton');
    },
    
    getSelectedSourceCurrency: () => 
        (UI.sourceCurrencyInput ? UI.sourceCurrencyInput.value.trim().toUpperCase() : '') || 
        (UI.sourceCurrencySelect ? UI.sourceCurrencySelect.value : ''), // select.value is already uppercase if options are
    getSelectedTargetCurrency: () => 
        (UI.targetCurrencyInput ? UI.targetCurrencyInput.value.trim().toUpperCase() : '') || 
        (UI.targetCurrencySelect ? UI.targetCurrencySelect.value : ''),
    getAmount: () => UI.amountInput ? parseFloat(UI.amountInput.value) : NaN
};