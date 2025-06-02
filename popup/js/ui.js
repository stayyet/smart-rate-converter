// popup/js/ui.js
const UI = {
    // DOM Elements - 您的元素声明看起来是完整的
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
    settingsBtn: document.getElementById('settingsBtn'),
    
    _allCurrencies: [], // 将存储从 API 获取的 {code, name} 列表

    initEventListeners: (handlers) => {
        console.log("[UI] initEventListeners - 开始初始化事件监听器。");
        
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
            // App.handlers.handleCopyResult 会调用 UI.showCopyFeedback
            UI.copyResultBtn.addEventListener('click', handlers.handleCopyResult);
        }
        
        if (UI.convertBtn) UI.convertBtn.addEventListener('click', handlers.handleAmountChange);
        if (UI.clearHistoryBtn) UI.clearHistoryBtn.addEventListener('click', handlers.handleClearHistory);
        if (UI.langToggleBtn) UI.langToggleBtn.addEventListener('click', handlers.handleLanguageToggle);

        if (UI.settingsBtn) {
            UI.settingsBtn.addEventListener('click', handlers.handleOpenOptionsPage);
            console.log("[UI] settingsBtn 事件监听器已附加。");
        } else {
            // console.warn("[UI] settingsBtn 元素未在 DOM 中找到。"); // 如果按钮是可选的，这个警告可以不显示
        }

        // 事件委托保持不变
        if (UI.favoritesList) UI.favoritesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-btn')) {
                handlers.handleFavoriteClick(e.target.dataset.from, e.target.dataset.to);
            }
        });
        if (UI.historyList) UI.historyList.addEventListener('click', (e) => {
            const listItem = e.target.closest('li');
            // 修改：确保 listItem.dataset.item 存在且是有效的 JSON
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

        if (!UI.copyResultBtn) return; // 添加元素存在性检查

        if (UI.copyResultBtn.classList.contains('copied-feedback')) return;

        UI.copyResultBtn.classList.add('copied-feedback');
        UI.copyResultBtn.title = I18n.getLocalizedString(copiedTooltipKey);

        setTimeout(() => {
            if (UI.copyResultBtn) { // 再次检查，以防在超时期间元素被移除
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
            // **确保 i18n.js 中有 'noCurrenciesToList' 这个 key**
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
            const currencyFullName = I18n.getCurrencyFullName(currencyCode); // 从 I18n 获取本地化全名

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

        // 同步 inputElementToSync 的值
        if (inputElementToSync) {
            // 如果 select 有有效值 (意味着 selectedCode 匹配了列表中的一项，或列表非空且默认选中第一项)
            // 则用 select 的当前值更新 input
            if (selectElement.value) {
                inputElementToSync.value = selectElement.value;
            } 
            // 如果 select 没有有效值 (例如，列表为空，或 selectedCode 不在列表中导致没有 option 被选中)
            // 但我们有一个期望的 selectedCode (可能来自 App.state)，我们仍然应该设置 input
            else if (selectedCode) {
                inputElementToSync.value = selectedCode.toUpperCase();
            }
            // 如果两者都没有，输入框将保持其先前的值或为空
        }
    },
    
    updateCurrencyDropdownsIfReady: () => {
        console.log("[UI] updateCurrencyDropdownsIfReady 被调用。");
        // 检查 _allCurrencies 是否已定义且非空
        if (UI._allCurrencies && UI._allCurrencies.length > 0) {
            // 优先从 App.state 获取当前选中的货币，因为它是“事实来源”
            const sourceVal = (typeof App !== 'undefined' && App.state && App.state.sourceCurrency)
                              ? App.state.sourceCurrency
                              : (UI.sourceCurrencyInput ? UI.sourceCurrencyInput.value : (UI.sourceCurrencySelect ? UI.sourceCurrencySelect.value : ''));
            
            const targetVal = (typeof App !== 'undefined' && App.state && App.state.targetCurrency)
                              ? App.state.targetCurrency
                              : (UI.targetCurrencyInput ? UI.targetCurrencyInput.value : (UI.targetCurrencySelect ? UI.targetCurrencySelect.value : ''));

            console.log(`[UI] 重新填充下拉列表。源: ${sourceVal}, 目标: ${targetVal}`);

            if (UI.sourceCurrencySelect) {
                UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, UI._allCurrencies, sourceVal);
            }
            if (UI.targetCurrencySelect) {
                UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, UI._allCurrencies, targetVal);
            }
        } else {
            // 如果 _allCurrencies 为空（例如 API 调用失败或正在加载）
            console.warn("[UI] updateCurrencyDropdownsIfReady: _allCurrencies 为空或尚未加载。将显示'无可用货币'。");
            // 使用空数组调用 populateCurrencyDropdown，它会显示 "noCurrenciesToList" 消息
            if (UI.sourceCurrencySelect) UI.populateCurrencyDropdown(UI.sourceCurrencySelect, UI.sourceCurrencyInput, [], null);
            if (UI.targetCurrencySelect) UI.populateCurrencyDropdown(UI.targetCurrencySelect, UI.targetCurrencyInput, [], null);
        }
    },

    setSupportedCurrencies: (currencies, defaultSource, defaultTarget) => {
        console.log("[UI] setSupportedCurrencies - 接收到的货币数量:", currencies ? currencies.length : 0, "默认源:", defaultSource, "默认目标:", defaultTarget);
        UI._allCurrencies = currencies || []; // 确保 _allCurrencies 总是一个数组

        // 设置输入框的初始值 (如果它们存在)
        // App.init 应该已经将 defaultSource/Target 设置到 App.state
        // 而 populateCurrencyDropdown 会根据 selectedCode 同步 inputElementToSync
        // 所以这里的直接设置可能是多余的，但为了保险起见可以保留，或者依赖 populateCurrencyDropdown 的同步逻辑
        if (UI.sourceCurrencyInput) UI.sourceCurrencyInput.value = defaultSource || '';
        if (UI.targetCurrencyInput) UI.targetCurrencyInput.value = defaultTarget || '';

        // 调用 updateCurrencyDropdownsIfReady 来填充下拉列表
        // 它将使用 defaultSource 和 defaultTarget (通过上面从 App.state 获取的逻辑) 来预选选项
        UI.updateCurrencyDropdownsIfReady();
    },

    updateResult: (resultAmount, targetCurrency, sourceAmount, sourceCurrency, rate, isOffline, timestamp, stale) => {
        if (!UI.conversionResultText || !UI.rateInfoText) return; // 检查元素是否存在

        if (resultAmount === null || isNaN(resultAmount)) {
            UI.conversionResultText.textContent = '---';
            UI.rateInfoText.textContent = '';
            // 当结果无效时，如果金额有效，仍显示汇率信息（针对单位1）
            if (Utils.isValidCurrencyCode(sourceCurrency) && Utils.isValidCurrencyCode(targetCurrency) && rate !== undefined) {
                 let rateInfo = `1 ${sourceCurrency} = ${rate !== undefined ? rate.toFixed(4) : 'N/A'} ${targetCurrency}. `;
                 if (isOffline && timestamp) {
                    const timeAgo = Utils.getTimestampDifferenceString(timestamp);
                    rateInfo += stale ? I18n.getLocalizedString('staleCacheUsed', {time: timeAgo}) : I18n.getLocalizedString('offlineRateUsed', { time: timeAgo });
                 } else if (timestamp) {
                     rateInfo += I18n.getLocalizedString('liveRate');
                 }
                 UI.rateInfoText.textContent = rateInfo;
            }
            return;
        }
        const formattedResult = Utils.formatCurrencyWithSymbol(resultAmount, targetCurrency, I18n.currentLang);
        UI.conversionResultText.textContent = formattedResult;

        let rateInfo = '';
        if (rate !== undefined) { // 检查 rate 是否已定义
            rateInfo = `1 ${sourceCurrency} = ${rate.toFixed(4)} ${targetCurrency}. `;
        }
        if (isOffline && timestamp) {
            const timeAgo = Utils.getTimestampDifferenceString(timestamp);
            rateInfo += stale ? I18n.getLocalizedString('staleCacheUsed', {time: timeAgo}) : I18n.getLocalizedString('offlineRateUsed', { time: timeAgo });
        } else if (timestamp) {
            rateInfo += I18n.getLocalizedString('liveRate');
        }
        UI.rateInfoText.textContent = rateInfo;
    },

    renderFavorites: (favorites) => { 
        if (!UI.favoritesList) return;
        UI.favoritesList.innerHTML = '';
        // ... (其余逻辑不变)
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
        // ... (其余逻辑不变)
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
        // ... (其余逻辑不变)
        const message = isKey ? I18n.getLocalizedString(messageKeyOrText) : messageKeyOrText;
        UI.errorMessageText.textContent = message || I18n.getLocalizedString('unknownError');
        UI.errorMessagesContainer.style.display = 'block';
    },
    hideError: () => {
        if (!UI.errorMessagesContainer) return;
        // ... (其余逻辑不变)
        UI.errorMessagesContainer.style.display = 'none';
        UI.errorMessageText.textContent = '';
    },
    toggleLoading: (isLoading) => {
        if (!UI.convertBtn) return;
        // ... (其余逻辑不变)
        UI.convertBtn.disabled = isLoading;
        UI.convertBtn.textContent = isLoading ? I18n.getLocalizedString('convertingButton') : I18n.getLocalizedString('convertButton');
    },
    
    getSelectedSourceCurrency: () => 
        (UI.sourceCurrencyInput ? UI.sourceCurrencyInput.value.trim().toUpperCase() : '') || 
        (UI.sourceCurrencySelect ? UI.sourceCurrencySelect.value : ''),
    getSelectedTargetCurrency: () => 
        (UI.targetCurrencyInput ? UI.targetCurrencyInput.value.trim().toUpperCase() : '') || 
        (UI.targetCurrencySelect ? UI.targetCurrencySelect.value : ''),
    getAmount: () => UI.amountInput ? parseFloat(UI.amountInput.value) : NaN
};