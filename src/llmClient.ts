import * as vscode from 'vscode';
import { getToolsForMode } from './agentTools';
import { VisdevManager } from './visdevManager';
import * as path from 'path';

export class LlmClient {
    private apiKey: string | undefined;
    private visdevManager: VisdevManager;
    private configContext: string = "";

    constructor(visdevManager: VisdevManager) {
        this.visdevManager = visdevManager;
    }

    public async initialize(context: vscode.ExtensionContext) {
        this.apiKey = await context.secrets.get('sdd.kimiApiKey');
        
        if (this.visdevManager.isInitialized()) {
            try {
                const config = await this.visdevManager.getConfig();
                this.configContext = `You are developing '${config.name}', a project with the following description: ${config.description}. Technical Stack constraints: Frontend (${config.techStack.frontend}), Backend (${config.techStack.backend}), Database (${config.techStack.database}).`;
            } catch (err) {
                console.error("Failed to load visdev config for prompt", err);
            }
        }
    }

    public async processPrompt(prompt: string, mode: string, webviewView: vscode.WebviewView): Promise<void> {
        if (!this.apiKey) {
            webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'API Key missing.' });
            return;
        }

        const tools = getToolsForMode(mode);
        
        webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'Calling NVidia Kimi K2.5 API...' });

        try {
            // NOTE: Using native Node fetch (v18+)
            const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "moonshotai/kimi-k2.5",
                    messages: [
                        { role: "system", content: `You are the VisDev IDE architectural agent. ${this.configContext} Use the provided tools.` },
                        { role: "user", content: prompt }
                    ],
                    tools: tools,
                    tool_choice: "auto"
                })
            });

            if (!response.ok) {
                const err = await response.text();
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `API Error: ${response.status} ${err}` });
                return;
            }

            const data = await response.json() as any;
            const messageObj = data.choices[0].message;

            if (messageObj.tool_calls) {
                for (const tool_call of messageObj.tool_calls) {
                    await this.executeToolCall(tool_call, webviewView);
                }
            } else {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: messageObj.content || "Empty response." });
            }
        } catch (error: any) {
            webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Request failed: ${error.message}` });
        }
    }

    private async executeToolCall(toolCall: any, webviewView: vscode.WebviewView) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        try {
            if (name === 'create_specification_node') {
                await this.visdevManager.createSpecNode({
                    id: args.id,
                    type: args.type,
                    // Basic auto-layout logic could go here; just dropping it near center for now
                    position: { x: Math.random() * 200, y: Math.random() * 200 }, 
                    data: { label: args.label }
                }, args.markdown_content);
                
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Created Spec Node: ${args.label}` });

                // Tell the frontend to reload blueprint
                const blueprint = await this.visdevManager.getBlueprint();
                // We actually need to broadcast this to the main blueprint webview, 
                // but for mock purposes we'll rely on the manual file system watcher or user reload.
                vscode.commands.executeCommand('sdd-ide.openBlueprint'); 
            }
            else if (name === 'write_code') {
                if (!vscode.workspace.workspaceFolders) return;
                const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const fileUri = vscode.Uri.file(path.join(root, args.file_path));
                const contentData = new TextEncoder().encode(args.content);
                await vscode.workspace.fs.writeFile(fileUri, contentData);
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Wrote code to ${args.file_path}` });
            }
            else {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `Tool executed: ${name}` });
            }
        } catch (err: any) {
             webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Tool Execution Failed: ${err.message}` });
        }
    }
}
