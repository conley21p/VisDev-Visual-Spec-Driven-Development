import * as vscode from 'vscode';
import { VisdevManager } from './visdevManager';
import { LlmClient } from './llmClient';
import { parseSpecInterface } from './specTypes';

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
    let apiKey = await context.secrets.get('sdd.kimiApiKey');
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: 'Welcome to SDD IDE! Please enter your Kimi K2.5 API Key to continue.',
            ignoreFocusOut: true,
            password: true,
            placeHolder: 'e.g. nvapi-...'
        });

        if (apiKey) {
            await context.secrets.store('sdd.kimiApiKey', apiKey);
            vscode.window.showInformationMessage('API Key saved securely.');
        } else {
            vscode.window.showWarningMessage('API Key is required to use SDD AI features. Please add it from extension settings later.');
        }
    }

    // Initialize the LLM API Key explicitly on startup
    await llmClient.initialize(context);

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

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        webviewView.onDidChangeVisibility(() => {
            if (!webviewView.visible) {
                this.llmClient.cancelRequest();
            }
        });

        webviewView.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; margin: 0; }
                    .header { font-size: 14px; font-weight: bold; margin-bottom: 10px; flex-shrink: 0; }
                    select, input, button { width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 6px; 
                        background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); flex-shrink: 0; }
                    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    .chat-box { flex-grow: 1; border: 1px solid var(--vscode-editorGroup-border); margin-bottom: 10px; padding: 5px; overflow-y: auto; background: var(--vscode-sideBar-background); }
                    .message { margin-bottom: 8px; font-size: 13px; padding: 8px; border-radius: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
                    .log-message { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); opacity: 0.8; border: none; background: none; margin-bottom: 4px; padding: 2px 8px; display: none; }
                    .error-message { border-left: 2px solid var(--vscode-errorForeground); background: rgba(255,0,0,0.1); }
                    .footer { font-size: 11px; opacity: 0.7; display: flex; align-items: center; gap: 5px; flex-shrink: 0; padding-bottom: 10px; }
                    .footer input { width: auto; margin: 0; }
                </style>
            </head>
            <body>
                <div class="header">Agent Mode</div>
                <select id="agentMode">
                    <option value="all-powerful">Mode 1: All Powerful Agent</option>
                    <option value="add-spec">Mode 2: Add Spec</option>
                    <option value="update-spec">Mode 3: Update Spec</option>
                </select>

                <div class="header">History</div>
                <div id="chatHistory" class="chat-box">
                    <div class="message"><strong>Agent:</strong> I am ready. Select a mode above and tell me what node to work on.</div>
                </div>

                <div class="footer">
                    <input type="checkbox" id="showLogs" onchange="toggleLogs()" />
                    <label for="showLogs">Show Technical Logs</label>
                </div>

                <input type="text" id="userInput" placeholder="Vibe here... (e.g. Add Auth to the app)" />
                <button onclick="sendCommand()">Send command</button>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function toggleLogs() {
                        const show = document.getElementById('showLogs').checked;
                        const logs = document.querySelectorAll('.log-message');
                        logs.forEach(l => l.style.display = show ? 'block' : 'none');
                    }

                    function sendCommand() {
                        const input = document.getElementById('userInput');
                        const mode = document.getElementById('agentMode').value;
                        const text = input.value;
                        if (!text) return;

                        addMessage('You', text, 'user');
                        input.value = '';

                        vscode.postMessage({
                            command: 'processPrompt',
                            mode: mode,
                            text: text
                        });
                    }

                    function addMessage(sender, text, type, payload) {
                        const history = document.getElementById('chatHistory');
                        const msgDiv = document.createElement('div');
                        
                        if (type === 'technical') {
                            msgDiv.className = 'log-message';
                            if (document.getElementById('showLogs').checked) {
                                msgDiv.style.display = 'block';
                            }
                        } else if (type === 'error') {
                            msgDiv.className = 'message error-message';
                        } else {
                            msgDiv.className = 'message';
                        }

                        let content = '<strong>' + sender + ':</strong> ' + text;
                        if (payload) {
                            content += '<details style="margin-top: 5px; cursor: pointer;">' +
                                '<summary style="font-size: 10px; opacity: 0.8; outline: none;">View Request Payload (JSON)</summary>' +
                                '<pre style="font-size: 10px; background: rgba(0,0,0,0.2); padding: 8px; margin-top: 5px; overflow-x: auto; white-space: pre-wrap; border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; user-select: text;">' + payload + '</pre>' +
                            '</details>';
                        }
                        
                        msgDiv.innerHTML = content;
                        history.appendChild(msgDiv);
                        history.scrollTop = history.scrollHeight;
                    }

                    // Listen for messages FROM the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'addMessage') {
                            addMessage(message.sender, message.message, 
                                message.isTechnical ? 'technical' : (message.sender === 'Error' ? 'error' : 'normal'),
                                message.payload
                            );
                        }
                    });
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

export function deactivate() {}
