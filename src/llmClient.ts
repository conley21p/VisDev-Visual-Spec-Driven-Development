import * as vscode from 'vscode';
import { VisdevManager } from './visdevManager';
import { BlueprintOrchestrator } from './agents/BlueprintOrchestrator';
import { ChatMessage } from './agents/BaseAgent';

export class LlmClient {
    private apiKey: string | undefined;
    private visdevManager: VisdevManager;
    private activeProfileName: string = "nvidia/llama-3.1-405b-instruct";
    private orchestrator: BlueprintOrchestrator | undefined;

    constructor(visdevManager: VisdevManager) {
        this.visdevManager = visdevManager;
    }

    public setApiKey(key: string, profileName: string) {
        this.apiKey = key;
        this.activeProfileName = profileName;
        if (this.orchestrator) {
            // Re-initialize orchestrator if API key or model changes
            this.orchestrator = new BlueprintOrchestrator(this.visdevManager, key, profileName);
        }
    }

    public getChatHistory(): ChatMessage[] {
        return this.orchestrator?.getHistory() || [];
    }

    public getActiveProfileName(): string {
        return this.activeProfileName;
    }

    public async clearHistory() {
        if (this.orchestrator) {
            this.orchestrator.setHistory([]);
        }
        if (this.visdevManager.isInitialized()) {
            await this.visdevManager.saveChatHistory([]);
        }
    }

    public cancelRequest() {
        this.orchestrator?.cancel();
    }

    public async initialize(context: vscode.ExtensionContext, defaultModelId: string) {
        const profiles = context.globalState.get<string[]>('sdd.apiKeyProfiles', [defaultModelId]);
        this.activeProfileName = profiles[0] || defaultModelId;
        this.apiKey = await context.secrets.get(`sdd.apiKey.${this.activeProfileName}`);

        if (this.apiKey) {
            this.orchestrator = new BlueprintOrchestrator(this.visdevManager, this.apiKey, this.activeProfileName);
            
            if (this.visdevManager.isInitialized()) {
                const history = await this.visdevManager.getChatHistory();
                this.orchestrator.setHistory(history);
            }
        }
    }

    public setActiveNode(nodeId: string, specData: any) {
        // This context injection logic could be moved into the Orchestrator later
        // For now, we'll let the orchestrator handle its own prompt construction
    }

    public async processPrompt(
        userPrompt: string, 
        webviewView: vscode.WebviewView,
        isWorker: boolean = false,
        rollbackTo?: number
    ): Promise<string | void> {
        if (!this.orchestrator) {
            if (!this.apiKey) {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: 'API Key missing.' });
                return;
            }
            this.orchestrator = new BlueprintOrchestrator(this.visdevManager, this.apiKey, this.activeProfileName);
        }

        if (rollbackTo !== undefined) {
             const history = this.orchestrator.getHistory();
             if (rollbackTo >= 0 && rollbackTo < history.length) {
                 const newHistory = history.slice(0, rollbackTo + 1);
                 this.orchestrator.setHistory(newHistory);
                 await this.visdevManager.saveChatHistory(newHistory);
             }
        }

        // PROACTIVE CLEANUP: Clear any residual "Thinking" bubbles
        webviewView.webview.postMessage({ type: 'clearStreaming' });

        return await this.orchestrator.run(userPrompt, webviewView, isWorker);
    }
}
