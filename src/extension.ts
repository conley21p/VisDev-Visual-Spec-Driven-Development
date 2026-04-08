import * as vscode from 'vscode';
import { VisdevManager } from './visdevManager';
import { LlmClient } from './llmClient';
import { parseSpecInterface } from './specTypes';

const getDefaultModelId = (context: vscode.ExtensionContext) => 
    context.globalState.get<string>('sdd.defaultModelId', 'nvidia/llama-3.1-8b-instruct');

async function sendEnrichedBlueprint(panel: vscode.WebviewPanel, visdevManager: VisdevManager) {
    const blueprint = await visdevManager.getBlueprint();
    const config = await visdevManager.getConfig();
    const syncState = await visdevManager.getSyncState();
    const hasDrift = syncState.driftedFiles && syncState.driftedFiles.length > 0;

    // Enrich each node with its parsed spec interface data
    const enrichedNodes = await Promise.all((blueprint.nodes || []).map(async (n) => {
        try {
            const spec = await visdevManager.getSpecNode(n.id);
            const ifaceData = parseSpecInterface(spec.spec_interface || '');
            return { ...n, data: { ...n.data, interfaceData: ifaceData, executed: spec.executed || false } };
        } catch {
            return n;
        }
    }));

    panel.webview.postMessage({
        command: 'setBlueprint',
        data: { ...blueprint, nodes: enrichedNodes },
        config: config,
        hasDrift
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
            prompt: 'Welcome to VisDev IDE! Please enter your NVIDIA NIM API Key to power Llama, Gemma, and Nemotron models.',
            ignoreFocusOut: true,
            password: true,
            placeHolder: 'e.g. nvapi-...'
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
            placeHolder: 'nvapi-...'
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
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

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
                            await sendEnrichedBlueprint(panel, visdevManager);
                        }
                        return;
                    case 'saveVisdevConfig':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.saveConfig(message.data);
                            vscode.window.showInformationMessage('VisDev Initialized!');
                        }
                        return;
                    case 'getSpec':
                        if (visdevManager.isInitialized()) {
                            const specData = await visdevManager.getSpecNode(message.nodeId);
                            llmClient.setActiveNode(message.nodeId, specData);
                            panel.webview.postMessage({ command: 'setSpecData', nodeId: message.nodeId, data: specData });
                        }
                        return;
                    case 'saveSpec':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.updateSpecNode(message.nodeId, message.data);
                            vscode.window.showInformationMessage(`Spec saved: ${message.nodeId}`);
                        }
                        return;
                    case 'executeNode':
                        if (visdevManager.isInitialized()) {
                            const nodeMeta = await visdevManager.getNodeMeta(message.nodeId);
                            if (nodeMeta.executed) {
                                vscode.window.showWarningMessage(`Node '${message.nodeId}' has already been executed. Update the spec first to re-enable execution.`);
                                panel.webview.postMessage({ command: 'executionComplete', nodeId: message.nodeId });
                                return;
                            }
                            const specData = await visdevManager.getSpecNode(message.nodeId);
                            const blueprint = await visdevManager.getBlueprint();

                            // Discover architectural neighborhood
                            const connections = (blueprint.edges || [])
                                .filter(e => e.source === message.nodeId || e.target === message.nodeId);

                            const enrichedNeighbors = await Promise.all(connections.map(async (e) => {
                                const isSource = e.source === message.nodeId;
                                const neighborId = isSource ? e.target : e.source;
                                const neighborSpec = await visdevManager.getSpecNode(neighborId);
                                return {
                                    id: neighborId,
                                    label: e.label || 'unlabeled',
                                    direction: isSource ? 'outgoing' : 'incoming',
                                    interface: neighborSpec.spec_interface || 'None'
                                };
                            }));

                            const contextBlock = enrichedNeighbors.map(n =>
                                `- Node [${n.id}] is ${n.direction} connected via "${n.label}". Interface: ${typeof n.interface === 'string' ? n.interface : JSON.stringify(n.interface)}`
                            ).join('\n');

                            vscode.commands.executeCommand('sdd-ide.chatView.focus');
                            setTimeout(async () => {
                                const view = provider.getWebviewView();
                                if (view) {
                                    vscode.window.showInformationMessage(`Executing Node: ${message.nodeId}...`);
                                    const executionPrompt = `Node execution triggered for [${message.nodeId}].\n\n` +
                                        `### TARGET SPECIFICATION:\n${JSON.stringify(specData, null, 2)}\n\n` +
                                        `### ARCHITECTURAL CONTEXT:\n${contextBlock || 'No direct connections on blueprint.'}\n\n` +
                                        `Please implement the code based on these constraints and relationships.`;

                                    view.webview.postMessage({ type: 'addMessage', sender: 'User', message: `Execute Node: ${message.nodeId}` });
                                    await llmClient.processPrompt(executionPrompt, "all-powerful", view);

                                    await visdevManager.setNodeExecuted(message.nodeId);
                                    panel.webview.postMessage({ command: 'executionComplete', nodeId: message.nodeId });
                                } else {
                                    vscode.window.showErrorMessage("Agent Sidebar not initialized.");
                                }
                            }, 500);
                        }
                        return;
                    case 'renameNode':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.updateNodeLabel(message.nodeId, message.newLabel);
                            await sendEnrichedBlueprint(panel, visdevManager);
                        }
                        return;
                    case 'createDemoWorkspace':
                        const sideView = provider.getWebviewView();
                        await llmClient.scaffoldDemoProject(sideView);
                        return;
                    case 'addManualNode':
                        if (visdevManager.isInitialized()) {
                            const nodeName = await vscode.window.showInputBox({
                                prompt: "Enter a name for your new Spec Node",
                                placeHolder: "e.g., Payment Gateway"
                            });
                            if (nodeName) {
                                const newNodeId = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                await visdevManager.createSpecNode({
                                    id: newNodeId,
                                    type: 'api',
                                    position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
                                    data: { label: nodeName }
                                }, {
                                    spec_interface: "{\n  \"endpoints\": []\n}",
                                    spec_constraints: "{\n  \"rules\": []\n}",
                                    spec_interactions: "{\n  \"dependencies\": []\n}",
                                    spec_metadata: "Manual Schema"
                                });
                                vscode.window.showInformationMessage(`Manually created Node: ${nodeName}`);
                                // Re-trigger blueprint load (now enriched!)
                                await sendEnrichedBlueprint(panel, visdevManager);
                            }
                        }
                        return;
                    case 'processPrompt':
                        const driftView = provider.getWebviewView();
                        if (driftView) {
                            vscode.commands.executeCommand('sdd-ide.chatView.focus');
                            driftView.webview.postMessage({ type: 'addMessage', sender: 'User', message: message.text });
                            await llmClient.processPrompt(message.text, message.mode || 'all-powerful', driftView);
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
        vscode.window.registerWebviewViewProvider('sdd-ide.chatView', provider)
    );

    // 4. Auto-open panels if API key exists (or once entered)
    // Delay slightly to let the editor settle and internal system providers (like Unleash) to initialize
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('sdd-ide.openBlueprint');
            await vscode.commands.executeCommand('sdd-ide.chatView.focus');
        } catch (err) {
            console.log("Startup UI focus deferred: " + err);
        }
    }, 2500);

    // 5. File System Watcher for Drift Detection
    // Tracks human-made physical changes so AI can evaluate architectural drift
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidChange(async (uri: vscode.Uri) => {
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) return;

        // Never track internal visceral system files, node_modules, or git
        const relativePath = uri.fsPath.replace(rootPath, '');
        if (relativePath.includes('.visdev') || relativePath.includes('node_modules') || relativePath.includes('.git')) {
            return;
        }

        console.log(`Manual Code Modification Detected: ${relativePath}`);
        if (visdevManager.isInitialized()) {
            await visdevManager.addDriftedFile(relativePath);
        }
    });

    // Catch files being added entirely
    watcher.onDidCreate(async (uri: vscode.Uri) => {
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) return;
        const relativePath = uri.fsPath.replace(rootPath, '');
        if (relativePath.includes('.visdev') || relativePath.includes('node_modules') || relativePath.includes('.git')) return;

        if (visdevManager.isInitialized()) {
            await visdevManager.addDriftedFile(relativePath);
        }
    });

    context.subscriptions.push(watcher);
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
        webviewView.webview.options = { enableScripts: true };

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refreshProfiles();
            } else {
                this.llmClient.cancelRequest();
            }
        });

        webviewView.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
                <style>
                    body { font-family: var(--vscode-font-family); padding: 0; color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; margin: 0; background: var(--vscode-sideBar-background); }
                    .header { padding: 10px; border-bottom: 1px solid var(--vscode-divider); background: var(--vscode-sideBarSectionHeader-background); }
                    .profile-selector { width: 100%; padding: 4px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); font-size: 11px; margin-bottom: 8px; }
                    #chatHistory { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
                    .message { padding: 8px 12px; border-radius: 6px; max-width: 90%; font-size: 13px; line-height: 1.4; word-wrap: break-word; }
                    .user-message { align-self: flex-end; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
                    .agent-message { align-self: flex-start; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-divider); color: var(--vscode-editor-foreground); position: relative; }
                    .system-message { align-self: center; font-size: 11px; opacity: 0.7; font-style: italic; background: none; border: none; text-align: center; max-width: 100%; }
                    .log-message { align-self: flex-start; font-family: var(--vscode-editor-font-family); font-size: 11px; background: rgba(0,0,0,0.1); border-left: 2px solid #555; padding: 4px 8px; margin: 4px 0; display: none; width: 100%; box-sizing: border-box; }
                    .error-message { align-self: center; background-color: #fce4e4; color: #cc0000; border: 1px solid #f5c2c2; font-weight: bold; }
                    .input-area { padding: 12px; border-top: 1px solid var(--vscode-divider); background: var(--vscode-sideBar-background); }
                    .input-container { position: relative; border: 1px solid var(--vscode-input-border); border-radius: 8px; background: var(--vscode-input-background); transition: border-color 0.2s; padding: 2px; }
                    .input-container:focus-within { border-color: var(--vscode-focusBorder); }
                    #promptInput { 
                        width: 100%; 
                        min-height: 44px; 
                        max-height: 200px; 
                        padding: 10px 45px 10px 12px; 
                        background: none; 
                        color: var(--vscode-input-foreground); 
                        border: none; 
                        outline: none; 
                        resize: none; 
                        font-family: inherit; 
                        font-size: 13px; 
                        line-height: 1.5; 
                        box-sizing: border-box; 
                        overflow-y: hidden;
                    }
                    .action-btn { 
                        position: absolute; 
                        right: 8px; 
                        bottom: 8px; 
                        width: 28px; 
                        height: 28px; 
                        border-radius: 6px; 
                        border: none; 
                        cursor: pointer; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        transition: all 0.2s ease;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .action-btn:hover { opacity: 0.9; transform: scale(1.05); }
                    .action-btn.stop { background: #e81123; color: white; }
                    .action-btn svg { width: 14px; height: 14px; transition: transform 0.2s; }
                    
                    /* Markdown Styles */
                    .agent-message table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
                    .agent-message th, .agent-message td { border: 1px solid var(--vscode-divider); padding: 6px 8px; text-align: left; }
                    .agent-message th { background: rgba(255,255,255,0.05); font-weight: bold; }
                    .agent-message code { font-family: var(--vscode-editor-font-family); background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-size: 12px; }
                    .agent-message pre { margin: 10px 0; background: #0d1117; border-radius: 6px; padding: 12px; overflow-x: auto; border: 1px solid rgba(255,255,255,0.1); }
                    .agent-message pre code { background: none; padding: 0; color: inherit; }
                    .agent-message ul, .agent-message ol { padding-left: 20px; margin: 8px 0; }
                    .agent-message blockquote { border-left: 3px solid var(--vscode-button-background); margin: 8px 0; padding: 4px 12px; opacity: 0.8; background: rgba(255,255,255,0.02); }
                    .agent-message h1, .agent-message h2, .agent-message h3 { margin: 12px 0 6px 0; font-size: 1.1em; border-bottom: 1px solid var(--vscode-divider); padding-bottom: 4px; }
                    
                    .controls { display: flex; justify-content: space-between; align-items: center; font-size: 11px; opacity: 0.8; margin-bottom: 8px; }
                    .thinking { padding: 10px 15px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-divider); border-radius: 18px; border-bottom-left-radius: 4px; display: none; flex-direction: column; gap: 6px; width: fit-content; margin: 5px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
                    .thinking-dots { display: flex; gap: 4px; align-items: center; }
                    .thinking-status-text { font-size: 10px; opacity: 0.6; font-style: italic; transition: opacity 0.3s; }
                    .dot-pulse { width: 5px; height: 5px; background: var(--vscode-foreground); border-radius: 50%; opacity: 0.4; animation: dance 1.4s infinite ease-in-out; }
                    /* Stream bubble */
                    .stream-bubble { align-self: flex-start; max-width: 85%; padding: 10px 14px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-divider); border-radius: 18px; border-bottom-left-radius: 4px; line-height: 1.5; font-size: 13px; word-wrap: break-word; margin: 2px 10px; }
                    .stream-bubble.live::after { content: '▌'; opacity: 1; animation: blink 0.8s step-end infinite; }
                    @keyframes blink { 50% { opacity: 0; } }
                    .copy-btn { font-size: 10px; padding: 2px 6px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-divider); border-radius: 3px; cursor: pointer; float: right; margin-bottom: 5px; }
                    .copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
                    @keyframes dance { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); opacity: 1; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="font-size: 10px; font-weight: bold; opacity: 0.7; margin-bottom: 4px;">LLM MODEL</div>
                    <select id="profileSelect" class="profile-selector" onchange="switchProfile()">
                        <option value="+ Add New Provider...">+ Add New Provider...</option>
                    </select>
                </div>
                <div id="chatHistory">
                    <div class="message system-message">Ready to architect your vision.</div>
                    <div id="thinking" class="thinking">
                        <div class="thinking-dots">
                            <div class="dot-pulse"></div>
                            <div class="dot-pulse" style="animation-delay: 0.2s"></div>
                            <div class="dot-pulse" style="animation-delay: 0.4s"></div>
                        </div>
                        <div id="thinkingStatus" class="thinking-status-text">Thinking...</div>
                    </div>
                </div>
                <div class="input-area">
                    <div class="controls">
                        <select id="modeSelect" style="background: none; border: none; color: inherit; font-size: 11px; cursor: pointer;">
                            <option value="all-powerful" selected>⚡ Vibe Mode</option>
                        </select>
                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                            <input type="checkbox" id="showLogs" onchange="toggleLogs()"> Technical Logs
                        </label>
                    </div>
                    <div class="input-container">
                        <textarea id="promptInput" rows="1" placeholder="Type a message or describe architecture..." oninput="autoResize()"></textarea>
                        <button id="actionBtn" class="action-btn" onclick="handleAction()">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const input = document.getElementById('promptInput');
                    const profileSelect = document.getElementById('profileSelect');
                    const actionBtn = document.getElementById('actionBtn');
                    let isProcessing = false;

                    function autoResize() {
                        input.style.height = 'auto';
                        const newHeight = Math.min(input.scrollHeight, 200);
                        input.style.height = newHeight + 'px';
                        input.style.overflowY = input.scrollHeight > 200 ? 'auto' : 'hidden';
                    }

                    function updateBtnState(processing) {
                        isProcessing = processing;
                        if (isProcessing) {
                            actionBtn.classList.add('stop');
                            actionBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg>';
                        } else {
                            actionBtn.classList.remove('stop');
                            actionBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>';
                        }
                    }

                    function handleAction() {
                        if (isProcessing) {
                            vscode.postMessage({ command: 'cancelRequest' });
                            updateBtnState(false);
                            return;
                        }
                        sendMessage();
                    }

                    function switchProfile() {
                        const val = profileSelect.value;
                        if (val === '+ Add New Provider...') {
                            vscode.postMessage({ command: 'manageKeys' });
                            return;
                        }
                        vscode.postMessage({
                            command: 'switchProfile',
                            profile: val
                        });
                    }

                    function toggleLogs() {
                        const show = document.getElementById('showLogs').checked;
                        const logs = document.querySelectorAll('.log-message');
                        logs.forEach(log => {
                            log.style.display = show ? 'block' : 'none';
                        });
                    }

                    function sendMessage() {
                        const text = input.value.trim();
                        if (!text) return;
                        const mode = document.getElementById('modeSelect').value;
                        
                        addMessage('You', text, 'user');
                        input.value = '';
                        autoResize();

                        document.getElementById('thinking').style.display = 'flex';
                        updateBtnState(true);

                        vscode.postMessage({
                            command: 'processPrompt',
                            mode: mode,
                            text: text
                        });
                    }

                    function addMessage(sender, text, type, payload) {
                        const history = document.getElementById('chatHistory');
                        const thinking = document.getElementById('thinking');
                        const msgDiv = document.createElement('div');
                        
                        // Hide thinking indicator only on final responses or errors
                        if (type === 'error' || (type !== 'technical' && type !== 'user' && sender !== 'System')) {
                            document.getElementById('thinking').style.display = 'none';
                            updateBtnState(false);
                        }

                        if (type === 'technical') {
                            msgDiv.className = 'log-message';
                            if (document.getElementById('showLogs').checked) {
                                msgDiv.style.display = 'block';
                            }
                        } else if (type === 'error') {
                            msgDiv.className = 'message error-message';
                        } else if (type === 'user') {
                            msgDiv.className = 'message user-message';
                        } else if (sender === 'System') {
                             msgDiv.className = 'message system-message';
                        } else {
                            msgDiv.className = 'message agent-message';
                        }

                        let content = '';
                        // Add copy button for errors or technical logs
                        if (type === 'error' || type === 'technical') {
                            content += '<button class="copy-btn" onclick="copyContent(this)">📋 Copy Debug Info</button>';
                        }

                        if (sender === 'Agent' || type === 'agent') {
                            // High-Fidelity Markdown Pipeline
                            const rawHtml = marked.parse(text);
                            const cleanHtml = DOMPurify.sanitize(rawHtml);
                            content += '<strong>' + sender + ':</strong> <div class="markdown-body">' + cleanHtml + '</div>';
                        } else if (sender === 'You' || type === 'user') {
                            // User messages - no prefix for modern look
                            content += text;
                        } else {
                            content += '<strong>' + sender + ':</strong> ' + text;
                        }

                        if (payload) {
                            content += '<details style="margin-top: 5px; cursor: pointer;">' +
                                '<summary style="font-size: 10px; opacity: 0.8; outline: none;">View Request Payload (JSON)</summary>' +
                                '<pre class="debug-payload" style="font-size: 10px; background: rgba(0,0,0,0.2); padding: 8px; margin-top: 5px; overflow-x: auto; white-space: pre-wrap; border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; user-select: text;">' + payload + '</pre>' +
                            '</details>';
                        }
                        
                        msgDiv.innerHTML = content;
                        history.insertBefore(msgDiv, thinking);
                        
                        // Trigger Syntax Highlighting for any new code blocks
                        if (sender === 'Agent') {
                            msgDiv.querySelectorAll('pre code').forEach((block) => {
                                hljs.highlightElement(block);
                            });
                        }
                        
                        history.scrollTop = history.scrollHeight;
                    }

                    function copyContent(btn) {
                        const container = btn.parentElement;
                        const debugData = container.querySelector('.debug-payload');
                        const textToCopy = debugData ? debugData.textContent : container.innerText;
                        
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            const originalText = btn.innerText;
                            btn.innerText = '✅ Copied!';
                            setTimeout(() => btn.innerText = originalText, 2000);
                        });
                    }

                    // Listen for messages FROM the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'addMessage':
                                addMessage(message.sender, message.message,
                                    message.isTechnical ? 'technical' : (message.sender === 'Error' ? 'error' : 'normal'),
                                    message.payload
                                );
                                break;
                            case 'updateThinkingStatus':
                                document.getElementById('thinkingStatus').textContent = message.status;
                                break;
                            case 'startStreamBubble': {
                                const history = document.getElementById('chatHistory');
                                const thinking = document.getElementById('thinking');
                                document.getElementById('thinkingStatus').textContent = 'Generating...';
                                let bubble = document.getElementById('stream-bubble');
                                if (!bubble) {
                                    bubble = document.createElement('div');
                                    bubble.id = 'stream-bubble';
                                    bubble.className = 'message stream-bubble live';
                                    history.insertBefore(bubble, thinking);
                                }
                                bubble.textContent = message.initialContent || '';
                                history.scrollTop = history.scrollHeight;
                                break;
                            }
                            case 'appendStreamToken': {
                                const bubble = document.getElementById('stream-bubble');
                                if (bubble) {
                                    bubble.textContent += message.token;
                                    document.getElementById('chatHistory').scrollTop = document.getElementById('chatHistory').scrollHeight;
                                }
                                break;
                            }
                            case 'finalizeStreamBubble': {
                                const bubble = document.getElementById('stream-bubble');
                                if (bubble) {
                                    bubble.classList.remove('live');
                                    const raw = bubble.textContent || '';
                                    const rawHtml = marked.parse(raw);
                                    const cleanHtml = DOMPurify.sanitize(rawHtml);
                                    bubble.innerHTML = '<strong>Agent:</strong> <div class="markdown-body agent-message">' + cleanHtml + '</div>';
                                    bubble.removeAttribute('id');
                                    bubble.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                                }
                                document.getElementById('thinking').style.display = 'none';
                                document.getElementById('thinkingStatus').textContent = 'Thinking...';
                                updateBtnState(false);
                                break;
                            }
                            case 'retractStreamBubble': {
                                const bubble = document.getElementById('stream-bubble');
                                if (bubble) bubble.remove();
                                document.getElementById('thinkingStatus').textContent = 'Calling tools...';
                                break;
                            }
                            case 'updateProfiles': {
                                const profileSelect = document.getElementById('profileSelect');
                                profileSelect.innerHTML = '';
                                message.profiles.forEach(p => {
                                    const opt = document.createElement('option');
                                    opt.value = p;
                                    opt.textContent = p;
                                    profileSelect.appendChild(opt);
                                });
                                // Select the active profile, or 'Add New Provider...' if none
                                if (message.current) {
                                    profileSelect.value = message.current;
                                } else {
                                    profileSelect.value = '+ Add New Provider...';
                                }
                                // If current profile wasn't found in list, fall back to first option
                                if (!profileSelect.value) {
                                    profileSelect.selectedIndex = 0;
                                }
                                break;
                            }
                        }
                    });

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });

                    // Signal to extension that we are ready to receive profiles
                    vscode.postMessage({ command: 'ready' });
                </script>
            </body>
            </html>
        `;

        // Handle messages sent from the sidebar
        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'processPrompt':
                    // Map to the LLM backend
                    await this.llmClient.processPrompt(data.text, data.mode, webviewView);
                    break;
                case 'cancelRequest':
                    this.llmClient.cancelRequest();
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: '🚫 Request stopped by user.' });
                    break;
                case 'switchProfile':
                    const profileKey = await this._context.secrets.get(`sdd.apiKey.${data.profile}`);
                    if (profileKey) {
                        this.llmClient.setApiKey(profileKey, data.profile);
                        vscode.window.showInformationMessage(`Active Model switched to: ${data.profile}`);
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📡 Now using model: ${data.profile}` });
                    } else {
                        vscode.window.showErrorMessage(`No API key found for profile "${data.profile}". Please use "+ Add New Provider..." to set it.`);
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Failed to switch: No key for "${data.profile}"` });
                    }
                    break;
                case 'manageKeys':
                    vscode.commands.executeCommand('sdd-ide.setApiKey');
                    break;
                case 'ready':
                    this.refreshProfiles();
                    break;
            }
        });
    }
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', 'index.css'));

    return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VisDev Blueprint</title>
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
