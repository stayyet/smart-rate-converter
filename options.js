// options.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const decimalPlacesSelect = document.getElementById('decimalPlacesSelect');
    const saveBtn = document.getElementById('saveBtn');
    const statusMessage = document.getElementById('statusMessage');

    // --- I18n for Options Page (Simple Version) ---
    // This assumes your _locales files are set up correctly and accessible
    // It doesn't use the full I18n.js from popup to keep options page independent if desired
    // but it means you need to ensure `chrome.i18n.getMessage` works here.
    // Alternatively, you could try to import and use I18n.js if it's structured for that.
    function localizeOptionsPage() {
        document.title = chrome.i18n.getMessage('optionsPageTitle') || 'SmartRate Converter Options';
        document.getElementById('optionsTitle').textContent = chrome.i18n.getMessage('optionsPageTitle') || 'SmartRate Converter Settings';
        document.getElementById('apiKeyLabel').textContent = chrome.i18n.getMessage('optionsApiKeyLabel') || 'API Key:';
        if(apiKeyInput) apiKeyInput.placeholder = chrome.i18n.getMessage('optionsApiKeyPlaceholder') || 'Enter your API key';
        document.getElementById('apiKeyHint').childNodes[0].nodeValue = chrome.i18n.getMessage('optionsApiKeyHint') || 'Get your free API key from '; // Only text part
        
        document.getElementById('decimalPlacesLabel').textContent = chrome.i18n.getMessage('optionsDecimalPlacesLabel') || 'Decimal Places for Result:';
        document.getElementById('decimalOptionAuto').textContent = chrome.i18n.getMessage('optionsDecimalAuto') || 'Auto (default)';
        document.getElementById('decimalPlacesHint').textContent = chrome.i18n.getMessage('optionsDecimalPlacesHint') || 'Affects the displayed conversion result.';

        document.getElementById('saveBtn').textContent = chrome.i18n.getMessage('optionsSaveButton') || 'Save Settings';
        document.getElementById('discordLinkText').textContent = chrome.i18n.getMessage('optionsDiscordLink') || 'Join our Discord Community';
    }
    
    try {
        localizeOptionsPage();
    } catch (e) {
        console.warn("Could not fully localize options page, chrome.i18n.getMessage might not be available or keys missing.", e);
    }


    // Load saved settings when the page opens
    async function loadSettings() {
        if (!Storage) {
            console.error("Storage module not found. Cannot load settings.");
            return;
        }
        // console.log("Loading settings for options page...");
        try {
            const userApiKey = await Storage.loadSetting('userApiKey', '');
            if (apiKeyInput) apiKeyInput.value = userApiKey;

            const decimalPlaces = await Storage.loadSetting('decimalPlaces', 'auto'); // Default to 'auto'
            if (decimalPlacesSelect) decimalPlacesSelect.value = decimalPlaces;
            
            // console.log("Settings loaded:", { userApiKey, decimalPlaces });
        } catch (error) {
            console.error("Error loading settings:", error);
            if (statusMessage) {
                statusMessage.textContent = 'Error loading settings.';
                statusMessage.className = 'status-message error';
                statusMessage.style.display = 'block';
            }
        }
    }

    // Save settings when the button is clicked
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!Storage) {
                console.error("Storage module not found. Cannot save settings.");
                if (statusMessage) {
                    statusMessage.textContent = 'Error: Storage unavailable.';
                    statusMessage.className = 'status-message error';
                    statusMessage.style.display = 'block';
                }
                return;
            }

            const userApiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            const decimalPlaces = decimalPlacesSelect ? decimalPlacesSelect.value : 'auto';

            try {
                await Storage.saveSetting('userApiKey', userApiKey);
                await Storage.saveSetting('decimalPlaces', decimalPlaces);
                
                // console.log("Settings saved:", { userApiKey, decimalPlaces });

                if (statusMessage) {
                    statusMessage.textContent = chrome.i18n.getMessage('optionsSettingsSaved') || 'Settings Saved!';
                    statusMessage.className = 'status-message success'; // Use a specific class for success
                    statusMessage.style.display = 'block';
                    setTimeout(() => {
                        statusMessage.style.display = 'none';
                    }, 3000);
                }
            } catch (error) {
                console.error("Error saving settings:", error);
                if (statusMessage) {
                    statusMessage.textContent = 'Error saving settings.';
                    statusMessage.className = 'status-message error';
                    statusMessage.style.display = 'block';
                }
            }
        });
    }

    // Initial load of settings
    loadSettings();
});