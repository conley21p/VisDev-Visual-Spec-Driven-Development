import * as vscode from 'vscode';
import { VisdevManager } from './visdevManager';
import { LlmClient } from './llmClient';

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
                            const blueprint = await visdevManager.getBlueprint();
                            const config = await visdevManager.getConfig();
                            panel.webview.postMessage({ command: 'setBlueprint', data: blueprint, config: config });
                        }
                        return;
                    case 'saveVisdevConfig':
                        if (visdevManager.isInitialized()) {
                            await visdevManager.saveConfig(message.data);
                            vscode.window.showInformationMessage('VisDev Initialized!');
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
    // Delay slightly to let the editor settle
    setTimeout(() => {
        vscode.commands.executeCommand('sdd-ide.openBlueprint');
        vscode.commands.executeCommand('sdd-ide-sidebar.focus');
    }, 1000);

    // 5. File System Watcher for Drift Detection
    // This watches the workspace for changes to track manual user edits vs AI generated code.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidChange((uri: vscode.Uri) => {
        // In the future: diff against last AI generated state
        console.log(`Code modified manually: ${uri.fsPath}`);
    });
    context.subscriptions.push(watcher);
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _context: vscode.ExtensionContext, private readonly llmClient: LlmClient) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                    .header { font-size: 14px; font-weight: bold; margin-bottom: 10px; }
                    select, input, button { width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 6px; 
                        background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    .chat-box { height: 300px; border: 1px solid var(--vscode-editorGroup-border); margin-bottom: 10px; padding: 5px; overflow-y: auto; }
                    .message { margin-bottom: 8px; font-size: 13px; padding: 8px; border-radius: 4px; background: rgba(0,0,0,0.1); }
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
                <div class="chat-box" id="chatHistory">
                    <div class="message"><strong>Agent:</strong> I am ready. Select a mode above and tell me what node to work on.</div>
                </div>

                <input type="text" id="userInput" placeholder="Vibe here... (e.g. Add Auth to the app)" />
                <button onclick="sendCommand()">Send command</button>

                <script>
                    const vscode = acquireVsCodeApi();
                    function sendCommand() {
                        const input = document.getElementById('userInput');
                        const mode = document.getElementById('agentMode').value;
                        const text = input.value;
                        if (!text) return;

                        // Add to UI
                        document.getElementById('chatHistory').innerHTML += '<div class=\\'message\\'><strong>You:</strong> ' + text + '</div>';
                        input.value = '';

                        // Send back to extension
                        vscode.postMessage({
                            command: 'processPrompt',
                            mode: mode,
                            text: text
                        });
                    }

                    // Listen for messages FROM the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'addMessage') {
                            document.getElementById('chatHistory').innerHTML += '<div class=\\'message\\'><strong>' + message.sender + ':</strong> ' + message.message + '</div>';
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
