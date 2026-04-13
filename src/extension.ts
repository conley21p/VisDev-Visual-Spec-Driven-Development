import * as vscode from 'vscode';
import { VisdevManager } from './visdevManager';
import { LlmClient } from './llmClient';

const getDefaultModelId = (context: vscode.ExtensionContext) => 
    context.globalState.get<string>('sdd.defaultModelId', 'nvidia/llama-3.1-8b-instruct');

async function sendBlueprint(panel: vscode.WebviewPanel, visdevManager: VisdevManager) {
    const blueprint = await visdevManager.getBlueprint();
    const config = await visdevManager.getConfig();

    panel.webview.postMessage({
        command: 'setBlueprint',
        data: blueprint,
        config: config
    });
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('VisDev Extension is now active.');

    const visdevManager = new VisdevManager();
    const llmClient = new LlmClient(visdevManager);
    if (visdevManager.isInitialized()) {
        await visdevManager.initializeProject();
    }

    // 1. Check for API key in secure storage
    const defaultModelId = getDefaultModelId(context);
    let profiles = context.globalState.get<string[]>('sdd.apiKeyProfiles', [defaultModelId]);
    let migrated = false;

    // Migration: Rename "Default NVIDIA" to a valid model ID if it exists
    if (profiles.includes('Default NVIDIA')) {
        const key = await context.secrets.get('sdd.apiKey.Default NVIDIA');
        profiles = profiles.map(p => p === 'Default NVIDIA' ? defaultModelId : p);
        if (key) {
            await context.secrets.store(`sdd.apiKey.${defaultModelId}`, key);
            await context.secrets.delete('sdd.apiKey.Default NVIDIA');
        }
        migrated = true;
    }

    if (migrated) {
        await context.globalState.update('sdd.apiKeyProfiles', profiles);
    }

    // 2. Comprehensive Key Check: Only prompt if NO key exists for ANY profile
    let hasAnyKey = false;
    for (const p of profiles) {
        const key = await context.secrets.get(`sdd.apiKey.${p}`);
        if (key) {
            hasAnyKey = true;
            break;
        }
    }

    if (!hasAnyKey) {
        const apiKey = await vscode.window.showInputBox({
            prompt: `Welcome to VisDev IDE! Please enter your API Key for the default model: ${defaultModelId}`,
            ignoreFocusOut: true,
            password: true,
            placeHolder: defaultModelId.startsWith('nvidia') ? 'nvapi-...' : 'Enter your API key'
        });

        if (apiKey) {
            await context.secrets.store(`sdd.apiKey.${defaultModelId}`, apiKey);
            if (!profiles.includes(defaultModelId)) {
                await context.globalState.update('sdd.apiKeyProfiles', [...profiles, defaultModelId]);
            }
            vscode.window.showInformationMessage('API Key saved securely.');
        } else {
            vscode.window.showWarningMessage('API Key is required to use VisDev AI features. Use the "LLM Model" dropdown in the sidebar to add it later.');
        }
    }

    // Initialize the LLM API Key explicitly on startup
    await llmClient.initialize(context, defaultModelId);

    // Register command to show API Key
    context.subscriptions.push(vscode.commands.registerCommand('sdd-ide.showApiKey', async () => {
        const profiles = context.globalState.get<string[]>('sdd.apiKeyProfiles', [getDefaultModelId(context)]);
        const selected = await vscode.window.showQuickPick(profiles, { placeHolder: 'Select a model to view its API key' });
        
        if (selected) {
            const key = await context.secrets.get(`sdd.apiKey.${selected}`);
            if (key) {
                await vscode.window.showInputBox({ 
                    value: key, 
                    prompt: `API Key for profile: ${selected}. You can copy it from here.`,
                    ignoreFocusOut: true
                });
            } else {
                vscode.window.showErrorMessage(`No key found for profile: ${selected}`);
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sdd-ide.renameModel', async () => {
        const currentModels = context.globalState.get<string[]>('sdd.apiKeyProfiles', [getDefaultModelId(context)]);
        const oldName = await vscode.window.showQuickPick(currentModels, { placeHolder: 'Select a model to rename' });
        
        if (oldName) {
            const newName = await vscode.window.showInputBox({ 
                prompt: `Enter a new ID for model: ${oldName}`,
                placeHolder: 'e.g. meta/llama-3.1-405b-instruct',
                value: oldName
            });

            if (newName && newName !== oldName) {
                const updatedList = currentModels.map(m => m === oldName ? newName : m);
                const key = await context.secrets.get(`sdd.apiKey.${oldName}`);
                
                await context.globalState.update('sdd.apiKeyProfiles', updatedList);
                if (key) {
                    await context.secrets.store(`sdd.apiKey.${newName}`, key);
                    await context.secrets.delete(`sdd.apiKey.${oldName}`);
                }
                
                vscode.window.showInformationMessage(`Model "${oldName}" renamed to "${newName}".`);
                provider.refreshProfiles();
            }
        }
    }));

    // Register command to update API Key
    context.subscriptions.push(vscode.commands.registerCommand('sdd-ide.setApiKey', async () => {
        const currentProfiles = context.globalState.get<string[]>('sdd.apiKeyProfiles', [getDefaultModelId(context)]);
        const selected = await vscode.window.showQuickPick([...currentProfiles, '+ Add New Model', '✏️ Rename a Model', '🗑️ Delete a Model'], { placeHolder: 'Manage your LLM Models' });

        if (!selected) return;

        if (selected === '✏️ Rename a Model') {
            vscode.commands.executeCommand('sdd-ide.renameModel');
            return;
        }

        if (selected === '🗑️ Delete a Model') {
            const toDelete = await vscode.window.showQuickPick(currentProfiles.filter(p => p !== getDefaultModelId(context)), { placeHolder: 'Select a model to delete' });
            if (toDelete) {
                const filtered = currentProfiles.filter(p => p !== toDelete);
                await context.globalState.update('sdd.apiKeyProfiles', filtered);
                await context.secrets.delete(`sdd.apiKey.${toDelete}`);
                vscode.window.showInformationMessage(`Model "${toDelete}" removed.`);
                provider.refreshProfiles();
            }
            return;
        }

        if (selected === '⭐ Set Default Model') {
            vscode.commands.executeCommand('sdd-ide.setDefaultModel');
            return;
        }

        let profileName = selected;
        if (selected === '+ Add New Model') {
            const name = await vscode.window.showInputBox({ 
                prompt: 'Enter the exact Model ID (e.g. meta/llama-3.1-405b-instruct)',
                placeHolder: 'nvidia/nemotron-4-340b-instruct'
            });
            if (!name) return;
            profileName = name;
            await context.globalState.update('sdd.apiKeyProfiles', [...currentProfiles, name]);
        }

        const newKey = await vscode.window.showInputBox({
            prompt: `Enter API Key for model: ${profileName}`,
            ignoreFocusOut: true,
            password: true,
            placeHolder: profileName.startsWith('nvidia') ? 'nvapi-...' : 'Enter your API key'
        });

        if (newKey) {
            await context.secrets.store(`sdd.apiKey.${profileName}`, newKey);
            
            await llmClient.initialize(context, getDefaultModelId(context));
            vscode.window.showInformationMessage(`API Key for model "${profileName}" saved.`);
            provider.refreshProfiles();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('sdd-ide.setDefaultModel', async () => {
        const currentModels = context.globalState.get<string[]>('sdd.apiKeyProfiles', [getDefaultModelId(context)]);
        const currentDefault = getDefaultModelId(context);
        
        const selected = await vscode.window.showQuickPick(currentModels, { 
            placeHolder: `Select your preferred default LLM Model (Current: ${currentDefault})` 
        });

        if (selected) {
            await context.globalState.update('sdd.defaultModelId', selected);
            vscode.window.showInformationMessage(`Default LLM Model set to: ${selected}`);
            // Force re-init if the active model was the old default
            if (llmClient.getActiveProfileName() === currentDefault) {
              const key = await context.secrets.get(`sdd.apiKey.${selected}`);
              if (key) {
                llmClient.setApiKey(key, selected);
              }
            }
        }
    }));

    // 2. Register the command to open the Main Webview (Blueprint)
    let disposable = vscode.commands.registerCommand('sdd-ide.openBlueprint', () => {
        // Create and show a new webview
        const panel = vscode.window.createWebviewPanel(
            'visdevBlueprint',
            'VisDev Blueprint',
            vscode.ViewColumn.One,
            {
                enableScripts: true, // Allow React to run
                retainContextWhenHidden: true
            }
        );

        // Set local resource roots to restrict what the webview can access
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'build')]
        };

        // Wire up the Vite/React output
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, 'main');

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                    case 'updateNode':
                        vscode.window.showInformationMessage(`Node updated: ${message.nodeId}`);
                        return;
                    case 'loadBlueprint':
                        if (visdevManager.isInitialized()) {
                            await sendBlueprint(panel, visdevManager);
                        }
                        return;
                    case 'updateBlueprint':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.updateBlueprint(message.action);
                            await sendBlueprint(panel, visdevManager); // Refresh UI
                        }
                        return;
                    case 'saveVisdevConfig':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.saveConfig(message.data);
                            vscode.window.showInformationMessage('VisDev Initialized!');
                        }
                        return;
                    case 'processPrompt':
                        const driftView = provider.getWebviewView();
                        if (driftView) {
                            vscode.commands.executeCommand('sdd-ide.chatView.focus');
                            driftView.webview.postMessage({ type: 'addMessage', sender: 'User', message: message.text });
                            await llmClient.processPrompt(message.text, driftView);
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);

    // 3. Register the Sidebar Chat View
    const provider = new ChatViewProvider(context, llmClient);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sdd-ide.chatView', provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    // 4. Auto-open panels if API key exists (or once entered)
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('sdd-ide.openBlueprint');
            await vscode.commands.executeCommand('sdd-ide.chatView.focus');
        } catch (err) {
            console.log("Startup UI focus deferred: " + err);
        }
    }, 2500);

}

class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext, private readonly llmClient: LlmClient) { }

    public getWebviewView() {
        return this._view;
    }

    public refreshProfiles() {
        if (this._view) {
            const profiles = this._context.globalState.get<string[]>('sdd.apiKeyProfiles', []);
            const currentProfile = this.llmClient.getActiveProfileName();
            this._view.webview.postMessage({
                type: 'updateProfiles',
                profiles: [...profiles, '+ Add New Provider...'],
                current: profiles.length > 0 ? currentProfile : '+ Add New Provider...'
            });
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = { 
            enableScripts: true
        };

        // Important: preserve webview state across view switches
        (webviewView as any).description = "VisDev AI Chat";
        
        webviewView.webview.html = getWebviewContent(webviewView.webview, this._context.extensionUri, 'chat');

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'loadChat':
                    this.refreshProfiles();
                    const history = this.llmClient.getChatHistory();
                    webviewView.webview.postMessage({
                        type: 'setChatHistory',
                        history: history.map((h, i) => {
                            let senderType: 'user' | 'agent' | 'system' | 'technical' = 'system';
                            if (h.role === 'user') senderType = 'user';
                            else if (h.role === 'assistant') senderType = 'agent';
                            else if (h.role === 'tool') senderType = 'technical';
                            else if (h.role === 'system') senderType = 'system';

                            return {
                                id: `h-${i}`,
                                sender: senderType,
                                text: h.content || '',
                                timestamp: Date.now()
                            };
                        })
                    });
                    break;
                case 'processPrompt':
                    await this.llmClient.processPrompt(data.text, webviewView, false, data.rollbackTo);
                    break;
                case 'cancelRequest':
                    this.llmClient.cancelRequest();
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: '🚫 Request stopped by user.' });
                    break;
                case 'ready':
                    this.refreshProfiles();
                    break;
                case 'switchProfile':
                    if (data.profile === '+ Add New Provider...') {
                        vscode.commands.executeCommand('sdd-ide.setApiKey');
                    } else {
                        const profileKey = await this._context.secrets.get(`sdd.apiKey.${data.profile}`);
                        if (profileKey) {
                            this.llmClient.setApiKey(profileKey, data.profile);
                            // ELIMINATED showInformationMessage here as requested by user
                            webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📡 Now using model: ${data.profile}` });
                            this.refreshProfiles();
                        } else {
                            vscode.window.showErrorMessage(`No API key found for profile "${data.profile}". Please use "+ Add New Provider..." to set it.`);
                            webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Failed to switch: No key for "${data.profile}"` });
                        }
                    }
                    break;
                case 'manageKeys':
                    vscode.commands.executeCommand('sdd-ide.setApiKey');
                    break;
                case 'clearChat':
                    await this.llmClient.clearHistory();
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: '🧹 Conversation history cleared.' });
                    break;
            }
        });
    }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, page: 'main' | 'chat') {
    const scriptFilename = page === 'main' ? 'main.js' : 'chat.js';
    const styleFilename = page === 'main' ? 'main.css' : 'index.css';

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', scriptFilename));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', styleFilename));

    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VisDev ${page === 'main' ? 'Blueprint' : 'Chat'}</title>
      <link rel="stylesheet" type="text/css" href="${styleUri}">
      <style>
        body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #1e1e1e;}
      </style>
  </head>
  <body>
      <div id="root"></div>
      <script type="module" src="${scriptUri}"></script>
  </body>
  </html>`;
}

export function deactivate() { }
