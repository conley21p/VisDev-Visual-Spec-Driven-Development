import * as vscode from 'vscode';
import { VisdevManager } from '../visdevManager';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
}

export abstract class BaseAgent {
    protected chatHistory: ChatMessage[] = [];
    protected abortController: AbortController | null = null;
    protected userCancelledFlag: boolean = false;
    protected isProcessing: boolean = false;

    constructor(
        protected visdevManager: VisdevManager,
        protected apiKey: string,
        protected model: string
    ) {}

    public getHistory() {
        return this.chatHistory;
    }

    public setHistory(history: ChatMessage[]) {
        this.chatHistory = history;
    }

    public cancel() {
        if (this.abortController) {
            this.userCancelledFlag = true;
            this.abortController.abort();
            this.abortController = null;
        }
    }

    protected abstract getSystemPrompt(): string;
    protected abstract getTools(): any[];
    protected abstract executeToolCall(toolCall: any, webviewView: vscode.WebviewView): Promise<string>;

    public async run(
        userPrompt: string, 
        webviewView: vscode.WebviewView,
        isWorker: boolean = false,
        taskId?: string
    ): Promise<string | void> {
        this.isProcessing = true;
        try {
            if (userPrompt) {
                this.chatHistory.push({ role: "user", content: userPrompt });
                if (!isWorker) await this.visdevManager.saveChatHistory(this.chatHistory);
            }

            const systemPromptStr = this.getSystemPrompt();
            const tools = this.getTools();

            const requestBody = {
                model: this.model,
                messages: [{ role: "system", content: systemPromptStr }, ...this.chatHistory],
                tools: tools.length > 0 ? tools : undefined,
                tool_choice: tools.length > 0 ? "auto" : undefined,
                parallel_tool_calls: false
            };

            // Technical log through the webview
            if (isWorker && taskId) {
                webviewView.webview.postMessage({
                    type: 'agentActivity',
                    id: taskId,
                    status: 'running',
                    log: `API REQUEST [${this.model}]`,
                    payload: JSON.stringify(requestBody, null, 2)
                });
            } else {
                webviewView.webview.postMessage({ 
                    type: 'addMessage', 
                    sender: 'Technical', 
                    message: `API REQUEST [${this.model}]`,
                    payload: JSON.stringify(requestBody, null, 2)
                });
            }

            this.abortController = new AbortController();
            let contentBuffer = "";
            const toolCallAccumulator: Record<number, any> = {};
            
            if (!isWorker) {
                webviewView.webview.postMessage({ type: 'streamStart', sender: 'Agent' });
            }

            const { url, headers } = this.getApiConfiguration();

            const response = await fetch(url, {
                method: "POST",
                signal: this.abortController.signal,
                headers: headers,
                body: JSON.stringify({ ...requestBody, stream: true })
            });

            if (!response.ok) {
                const errText = await response.text();
                const errorMsg = `Error (${response.status}): ${errText.slice(0, 150)}`;
                if (isWorker && taskId) {
                    webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'error', log: errorMsg });
                } else {
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: errorMsg });
                }
                return;
            }

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") break;
                    try {
                        const chunk = JSON.parse(payload);
                        const choice = chunk.choices?.[0];
                        if (!choice) continue;
                        const delta = choice.delta;

                        if (delta.tool_calls) {
                            for (const tcChunk of delta.tool_calls) {
                                const idx = tcChunk.index ?? 0;
                                if (!toolCallAccumulator[idx]) toolCallAccumulator[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                if (tcChunk.id) toolCallAccumulator[idx].id = tcChunk.id;
                                if (tcChunk.function?.name) toolCallAccumulator[idx].function.name += tcChunk.function.name;
                                if (tcChunk.function?.arguments) toolCallAccumulator[idx].function.arguments += tcChunk.function.arguments;
                            }
                        }
                        if (delta.content) {
                            contentBuffer += delta.content;
                            if (isWorker && taskId) {
                                webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'running', log: delta.content, stream: true });
                            } else {
                                webviewView.webview.postMessage({ type: 'streamAppend', message: delta.content });
                            }
                        }
                    } catch {}
                }
            }

            const responseLog = contentBuffer.trim() || '[Tool Calls Only]';
            if (isWorker && taskId) {
                webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'running', log: `API RESPONSE`, payload: responseLog });
            } else {
                webviewView.webview.postMessage({ 
                    type: 'addMessage', 
                    sender: 'Technical', 
                    message: `API RESPONSE`,
                    payload: responseLog
                });
            }

            if (Object.keys(toolCallAccumulator).length > 0) {
                const assembledMessage: ChatMessage = { role: 'assistant', content: contentBuffer || null, tool_calls: Object.values(toolCallAccumulator) };
                this.chatHistory.push(assembledMessage);

                // Finalize the current streaming bubble before starting tool execution logs
                if (!isWorker) {
                    webviewView.webview.postMessage({ 
                        type: 'addMessage', 
                        sender: 'Agent', 
                        message: contentBuffer 
                    });
                }

                for (const tool_call of assembledMessage.tool_calls!) {
                    const toolCallMsg = `Tool Call: ${tool_call.function.name}`;
                    if (isWorker && taskId) {
                        webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'running', log: toolCallMsg, payload: tool_call.function.arguments });
                    } else {
                        webviewView.webview.postMessage({ 
                            type: 'addMessage', 
                            sender: 'Technical', 
                            message: toolCallMsg,
                            payload: tool_call.function.arguments 
                        });
                    }

                    const result = await this.executeToolCall(tool_call, webviewView);

                    const toolRespMsg = `Tool Response: ${tool_call.function.name}`;
                    if (isWorker && taskId) {
                        webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'running', log: toolRespMsg, payload: result });
                    } else {
                        webviewView.webview.postMessage({ 
                            type: 'addMessage', 
                            sender: 'Technical', 
                            message: toolRespMsg,
                            payload: result 
                        });
                    }

                    this.chatHistory.push({ role: "tool", tool_call_id: tool_call.id, content: result });
                }
                return this.run("", webviewView, isWorker, taskId);
            } else {
                if (contentBuffer.trim().length > 0) {
                    this.chatHistory.push({ role: "assistant", content: contentBuffer });
                    if (!isWorker) {
                        await this.visdevManager.saveChatHistory(this.chatHistory);
                        webviewView.webview.postMessage({ 
                            type: 'addMessage', 
                            sender: 'Agent', 
                            message: contentBuffer 
                        });
                    }
                }
                return contentBuffer;
            }

        } catch (error: any) {
            if (error.name === 'AbortError' && this.userCancelledFlag) return;
            const errorMsg = `Agent error: ${error.message}`;
            if (isWorker && taskId) {
                webviewView.webview.postMessage({ type: 'agentActivity', id: taskId, status: 'error', log: errorMsg });
            } else {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: errorMsg });
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    protected getApiConfiguration(): { url: string, headers: Record<string, string> } {
        const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
        const GOOGLE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

        let url = NVIDIA_URL;
        const lowModel = this.model.toLowerCase();
        if (lowModel.startsWith('gemini') || lowModel.includes('google') || lowModel.includes('vertex')) {
            url = GOOGLE_URL;
        }

        return {
            url,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            }
        };
    }

    protected normalizeArguments(name: string, args: any): any {
        const normalized = { ...args };
        if (name === 'create_specification_node' || name === 'upsert_node' || name === 'update_specification_node') {
            if (!normalized.id && (normalized.title || normalized.name)) {
                normalized.id = (normalized.title || normalized.name).toLowerCase().replace(/\s+/g, '-');
            }
            if (!normalized.label && (normalized.title || normalized.name)) {
                normalized.label = normalized.title || normalized.name;
            }
            if (!normalized.type && normalized.node_type) normalized.type = normalized.node_type;
        }
        return normalized;
    }
}
