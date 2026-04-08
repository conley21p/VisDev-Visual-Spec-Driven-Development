import * as vscode from 'vscode';
import { getToolsForMode, ToolGroupsMetadata, AgentToolsSchema, BlueprintTools, WorkspaceTools, SystemTools } from './agentTools';
import { VisdevManager } from './visdevManager';
import * as path from 'path';
import { DEMO_NODES } from './demoTemplate';
import { VISDEV_ARCHITECTURAL_STANDARD_PROMPT } from './sddStandards';

export class LlmClient {
    private apiKey: string | undefined;
    private visdevManager: VisdevManager;
    private configContext: string = "";
    private activeNodeContext: string = "";
    private chatHistory: { role: string, content: string }[] = [];
    private abortController: AbortController | null = null;
    private unlockedTools: string[] = [];
    private userCancelledFlag: boolean = false;

    private preferredModel: string = "moonshotai/kimi-k2.5";
    private activeProfileName: string = "Kimi K2.5";

    constructor(visdevManager: VisdevManager) {
        this.visdevManager = visdevManager;
    }

    public setApiKey(key: string, profileName: string) {
        this.apiKey = key;
        this.activeProfileName = profileName;
    }

    public getActiveProfileName(): string {
        return this.activeProfileName;
    }

    private getFriendlyModelName(): string {
        switch (this.preferredModel) {
            case 'moonshotai/kimi-k2.5': return 'Kimi K2.5';
            case 'google/gemma-4-31b-it': return 'Gemma 4 31B IT';
            case 'nvidia/nemotron-3-super-120b-a12b': return 'Nemotron-3 Super 120B';
            default: return this.preferredModel;
        }
    }

    public cancelRequest() {
        if (this.abortController) {
            this.userCancelledFlag = true;
            this.abortController.abort();
            this.abortController = null;
        }
    }

    public async initialize(context: vscode.ExtensionContext, defaultModelId: string) {
        const profiles = context.globalState.get<string[]>('sdd.apiKeyProfiles', [defaultModelId]);
        this.activeProfileName = profiles[0] || defaultModelId;
        this.apiKey = await context.secrets.get(`sdd.apiKey.${this.activeProfileName}`);

        if (this.visdevManager.isInitialized()) {
            try {
                const config = await this.visdevManager.getConfig();
                this.preferredModel = config.preferredModel || "moonshotai/kimi-k2.5";
                this.configContext = `You are developing '${config.name}', a project with the following description: ${config.description}. Technical Stack constraints: Frontend (${config.techStack.frontend}), Backend (${config.techStack.backend}), Database (${config.techStack.database}).\n\nCORE RULE: You are an SDD Architect. You MUST validate the architecture against the Four Pillars of Specification-Driven Development before generating execution code:\n1. Interface Definitions (The Contract)\n2. Constraints and Validation Rules\n3. Interaction Patterns\n4. Metadata and Documentation\n\n${VISDEV_ARCHITECTURAL_STANDARD_PROMPT}\n\nNote: Always respect active architectural boundaries.`;
            } catch (err) {
                console.error("Failed to load visdev config for prompt", err);
            }
        }
    }

    public setActiveNode(nodeId: string, specData: any) {
        let serialized = JSON.stringify(specData);
        if (serialized.length > 2000) {
            serialized = serialized.slice(0, 2000) + "... (truncated)";
        }
        this.activeNodeContext = `\n\nCurrently Selected Blueprint Node: [${nodeId}]\nActive Schema Data: ${serialized}`;
    }

    private mapErrorMessage(status: number, text: string): string {
        try {
            const body = JSON.parse(text);
            if (body.detail) return body.detail;
            if (body.message) return body.message;
        } catch { }

        switch (status) {
            case 401: return "Unauthorized: Your API key is invalid or has expired.";
            case 403: return "Forbidden: You do not have permission to use this model.";
            case 404: return "Not Found: The selected model is currently unavailable on this provider.";
            case 429: return "Rate Limit: Too many requests. Please wait a moment and try again.";
            case 500: return "Internal Server Error: The LLM provider is experiencing issues.";
            case 502: return "Bad Gateway: The provider is overloaded.";
            case 503: return "Service Unavailable: The provider is down for maintenance.";
            case 504: return "Gateway Timeout: The reasoning task was too complex for the provider's current capacity.";
            default: return `Unexpected Error (${status}): ${text.slice(0, 100)}`;
        }
    }

    public async processPrompt(prompt: string, mode: string, webviewView: vscode.WebviewView): Promise<void> {
        try {
            if (!this.apiKey) {
                webviewView.webview.postMessage({
                    type: 'addMessage',
                    sender: 'Error',
                    message: `No API key found for the active LLM Model profile: "${this.activeProfileName}". Please select "+ Add New Provider..." in the dropdown to configure it.`
                });
                return;
            }

            const isInitialized = this.visdevManager.isInitialized();
            const syncState = isInitialized ? await this.visdevManager.getSyncState() : { driftedFiles: [] };
            const hasActiveDrift = syncState?.driftedFiles?.length > 0;
            const tools = getToolsForMode(mode, hasActiveDrift, isInitialized, this.unlockedTools);

            // Validation Guard for NVIDIA NIM Model IDs
            if (this.activeProfileName.includes(' ') || !this.activeProfileName.includes('/')) {
                webviewView.webview.postMessage({
                    type: 'addMessage',
                    sender: 'System',
                    message: `⚠️ **Warning**: "${this.activeProfileName}" looks like a friendly name, not a Technical Model ID. If you see a "Not Found" error, please rename this model to a valid NIM ID (e.g., \`nvidia/llama-3.1-8b-instruct\`).`,
                    isTechnical: false
                });
            }

            if (prompt) {
                this.chatHistory.push({ role: "user", content: prompt });
            }

            if (this.chatHistory.length > 12) {
                await this.summarizeHistory(webviewView);
            }

            let driftContext = "";
            if (hasActiveDrift) {
                driftContext = `\n\nURGENT: Active drift detected in files: ${syncState.driftedFiles.join(', ')}. You MUST use resolve_active_drift.`;
            }

            const systemPromptStr = (this.configContext || "Project context not loaded.") + "\n" + (this.activeNodeContext || "") + driftContext;

            const requestBody = {
                model: this.activeProfileName,
                messages: [
                    { role: "system", content: systemPromptStr },
                    ...this.chatHistory
                ],
                tools: tools,
                tool_choice: "auto"
            };

            webviewView.webview.postMessage({
                type: 'addMessage',
                sender: 'System',
                message: `${this.activeProfileName} is thinking...`,
                isTechnical: true,
                payload: JSON.stringify(requestBody, null, 2)
            });

            console.log(`[LLM Request] Using Model: ${this.activeProfileName}`);
            console.log(`[LLM Request] Payload:`, JSON.stringify(requestBody, null, 2));

            this.cancelRequest(); // Abort any previous request
            this.abortController = new AbortController();

            // 15s timeout for first-chunk establishment only.
            const firstChunkTimeoutId = setTimeout(() => {
                if (!firstChunkReceived) { this.abortController?.abort(); }
            }, 15000);
            let firstChunkReceived = false;

            // 2-minute full-stream timeout — fires if the stream stalls mid-generation.
            let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;
            let userCancelled = this.userCancelledFlag;
            this.userCancelledFlag = false; // Reset for next request

            // Hoist state vars above try so catch block (AbortError handler) can access them
            type StreamState = 'THINKING' | 'STREAMING' | 'TOOL_CALLING';
            let state: StreamState = 'THINKING';
            let contentBuffer = "";
            const toolCallAccumulator: Record<number, any> = {};

            try {
                const response = await this.fetchWithRetry("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    signal: this.abortController.signal,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({ ...requestBody, stream: true })
                }, webviewView);

                clearTimeout(firstChunkTimeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[LLM Response Status ${response.status}] Error Body:`, errText);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: this.mapErrorMessage(response.status, errText) });
                    return;
                }

                // --- SSE Stream Reader ---
                const reader = response.body!.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                // Start the 2-minute stream timeout now that data is flowing
                streamTimeoutId = setTimeout(() => {
                    this.abortController?.abort();
                }, 120000);

                let contentTokenCount = 0;
                const DETECTION_THRESHOLD = 5;

                // toolCallAccumulator is hoisted above try so AbortError handler can inspect it
                let finalFinishReason: string | null = null;

                // Reconstructed response for technical log
                let logModel = this.activeProfileName;
                let logUsage: any = null;

                const processChunk = (line: string) => {
                    if (!line.startsWith("data: ")) return;
                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") return;

                    try {
                        const chunk = JSON.parse(payload);
                        firstChunkReceived = true;

                        if (chunk.model) logModel = chunk.model;
                        if (chunk.usage) logUsage = chunk.usage;

                        const choice = chunk.choices?.[0];
                        if (!choice) return;

                        const delta = choice.delta || {};
                        const finishReason = choice.finish_reason;
                        if (finishReason) finalFinishReason = finishReason;

                        // --- Tool call fragment accumulation ---
                        if (delta.tool_calls) {
                            // If we were streaming content, retract the bubble
                            if (state === 'STREAMING') {
                                webviewView.webview.postMessage({ type: 'retractStreamBubble' });
                            }
                            state = 'TOOL_CALLING';
                            webviewView.webview.postMessage({ type: 'updateThinkingStatus', status: 'Calling tools...' });

                            for (const tcChunk of delta.tool_calls) {
                                const idx = tcChunk.index ?? 0;
                                if (!toolCallAccumulator[idx]) {
                                    toolCallAccumulator[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                }
                                if (tcChunk.id) toolCallAccumulator[idx].id = tcChunk.id;
                                if (tcChunk.function?.name) toolCallAccumulator[idx].function.name += tcChunk.function.name;
                                if (tcChunk.function?.arguments) toolCallAccumulator[idx].function.arguments += tcChunk.function.arguments;
                            }
                        }

                        // --- Content streaming ---
                        // Ignore delta.reasoning (chain-of-thought from models like Kimi, DeepSeek-R1)
                        if (delta.content && state !== 'TOOL_CALLING') {
                            contentBuffer += delta.content;
                            contentTokenCount++;

                            if (state === 'THINKING' && contentTokenCount >= DETECTION_THRESHOLD) {
                                // No tool_calls seen yet — assume final response, start live display
                                state = 'STREAMING';
                                webviewView.webview.postMessage({ type: 'startStreamBubble', initialContent: contentBuffer });
                            } else if (state === 'STREAMING') {
                                webviewView.webview.postMessage({ type: 'appendStreamToken', token: delta.content });
                            }
                        }
                    } catch (e) {
                        // Malformed chunk — skip silently
                    }
                };

                // Read the stream
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer
                    for (const line of lines) {
                        if (line.trim()) processChunk(line);
                    }
                }
                // Process any remaining buffer
                if (buffer.trim()) processChunk(buffer);

                // --- Stream complete: act on finish_reason ---
                // Log reconstructed response to technical channel
                const reconstructedLog = {
                    model: logModel,
                    finish_reason: finalFinishReason,
                    content_length: contentBuffer.length,
                    tool_calls: Object.values(toolCallAccumulator),
                    usage: logUsage
                };
                webviewView.webview.postMessage({
                    type: 'addMessage',
                    sender: 'System',
                    message: `Stream complete from ${this.activeProfileName}`,
                    isTechnical: true,
                    payload: JSON.stringify(reconstructedLog, null, 2)
                });

                if (finalFinishReason === 'tool_calls' || Object.keys(toolCallAccumulator).length > 0) {
                    // --- TOOL_CALLING branch ---
                    const assembledMessage: any = {
                        role: 'assistant',
                        content: contentBuffer || null,
                        tool_calls: Object.values(toolCallAccumulator)
                    };
                    this.chatHistory.push(assembledMessage);

                    for (const tool_call of assembledMessage.tool_calls) {
                        try {
                            webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `Executing tool: ${tool_call.function.name}...`, isTechnical: true });
                            const result = await this.executeToolCall(tool_call, webviewView);
                            this.chatHistory.push({ role: "tool", tool_call_id: tool_call.id, content: result } as any);
                        } catch (err: any) {
                            webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Tool execution failed: ${err.message}` });
                            this.chatHistory.push({ role: "tool", tool_call_id: tool_call.id, content: `Error: ${err.message}` } as any);
                        }
                    }
                    return this.processPrompt("", mode, webviewView);

                } else {
                    // --- STREAMING / final response branch ---
                    // If we never crossed the detection threshold (very short response), display now
                    if (state === 'THINKING' && contentBuffer) {
                        webviewView.webview.postMessage({ type: 'startStreamBubble', initialContent: contentBuffer });
                    }
                    // Trigger Markdown render on the completed bubble
                    webviewView.webview.postMessage({ type: 'finalizeStreamBubble' });
                    this.chatHistory.push({ role: "assistant", content: contentBuffer || "Empty response." });
                }

            } catch (error: any) {
                clearTimeout(firstChunkTimeoutId);
                if (streamTimeoutId) clearTimeout(streamTimeoutId);

                if (error.name === 'AbortError') {
                    if (userCancelled) {
                        // User clicked Stop — finalize whatever was streaming cleanly
                        if (contentBuffer) {
                            webviewView.webview.postMessage({ type: 'finalizeStreamBubble' });
                            this.chatHistory.push({ role: "assistant", content: contentBuffer });
                        }
                        return;
                    }

                    // Timeout abort — surface debug context
                    const partialTools = Object.values(toolCallAccumulator);
                    const debugPayload = JSON.stringify({
                        streamed_content_length: contentBuffer.length,
                        streamed_content_preview: contentBuffer.slice(0, 500) + (contentBuffer.length > 500 ? '...' : ''),
                        partial_tool_calls: partialTools,
                        stream_state_at_abort: state
                    }, null, 2);

                    // Retract any live bubble before showing error
                    webviewView.webview.postMessage({ type: 'retractStreamBubble' });
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'Stream was aborted.', isTechnical: true });
                    webviewView.webview.postMessage({
                        type: 'addMessage',
                        sender: 'Error',
                        message: `⌛ **Stream Timeout** (2 min): The model was generating but did not complete. Stream state at abort: **${state}**. See debug payload for partial content and any incomplete tool calls.`,
                        payload: debugPayload
                    });
                    return;
                }
                console.error("LLM Stream Error:", error);
                webviewView.webview.postMessage({
                    type: 'addMessage',
                    sender: 'Error',
                    message: `Stream Error: ${error.message}. Please verify your API profile configuration.`
                });
            } finally {
                this.abortController = null;
                clearTimeout(firstChunkTimeoutId);
                if (streamTimeoutId) clearTimeout(streamTimeoutId);
            }
        } catch (globalError: any) {
            console.error("Global LLM Client Error:", globalError);
            webviewView.webview.postMessage({
                type: 'addMessage',
                sender: 'Error',
                message: `Internal reasoning engine error: ${globalError.message}`
            });
        }
    }

    private async fetchWithRetry(url: string, options: any, webviewView: vscode.WebviewView, retries = 2, backoff = 1500): Promise<Response> {
        try {
            const res = await fetch(url, options);
            if (res.status === 504 || res.status === 429 || res.status === 502 || res.status === 503) {
                if (retries > 0) {
                    console.warn(`[LLM Retry] Status ${res.status}. Retrying in ${backoff}ms... (${retries} attempts left)`);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `⚠️ API busy (${res.status}). Retrying in ${backoff}ms...`, isTechnical: true });
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    return this.fetchWithRetry(url, options, webviewView, retries - 1, backoff * 2);
                }
            }
            return res;
        } catch (err: any) {
            if (err.name === 'AbortError') throw err;
            console.error(`[LLM Network Error] ${err.message}`);
            if (retries > 0) {
                console.warn(`[LLM Retry] Network error. Retrying in ${backoff}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.fetchWithRetry(url, options, webviewView, retries - 1, backoff * 2);
            }
            throw err;
        }
    }

    private safeParseArguments(argumentsStr: string): any {
        let clean = argumentsStr.trim();
        // Remove markdown code block wrappers if present
        if (clean.startsWith('```')) {
            clean = clean.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        try {
            return JSON.parse(clean);
        } catch (e: any) {
            // Throw instead of console.error to avoid host-side clutter. Handler catches this.
            throw new Error(`Invalid JSON in tool arguments: ${e.message}. Raw: ${clean.slice(0, 100)}...`);
        }
    }

    private safeParseInnerJSON(data: any): any[] {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [];
        }
    }

    private async executeToolCall(toolCall: any, webviewView: vscode.WebviewView): Promise<string> {
        const name = toolCall.function.name;
        const args = this.safeParseArguments(toolCall.function.arguments);

        try {
            switch (name) {
                case 'list_tool_groups':
                    return JSON.stringify(ToolGroupsMetadata, null, 2);

                case 'get_tools_in_group':
                    const groupId = args.group_id;
                    let toolsToUnlock: string[] = [];
                    if (groupId === 'blueprint_ops') toolsToUnlock = BlueprintTools;
                    else if (groupId === 'workspace_io') toolsToUnlock = WorkspaceTools;
                    else if (groupId === 'system_meta') toolsToUnlock = SystemTools;

                    // Update session-level unlocked tools
                    toolsToUnlock.forEach(t => {
                        if (!this.unlockedTools.includes(t)) {
                            this.unlockedTools.push(t);
                        }
                    });

                    // Return a lightweight confirmation — schemas are already in the 'tools' array,
                    // so re-sending full JSON here would duplicate ~1200 tokens of dead context.
                    const confirmation = `SUCCESS: Unlocked ${toolsToUnlock.length} tools in group '${groupId}': [${toolsToUnlock.join(', ')}]. These tools are now active in your tools context — use them directly.`;

                    // Prune the discovery scaffolding from chatHistory immediately.
                    // list_tool_groups / get_tools_in_group are one-time setup calls;
                    // keeping them in history wastes ~1500 tokens on every subsequent turn.
                    this.chatHistory = this.chatHistory.filter((msg: any) => {
                        if (msg.role === 'tool') {
                            // Remove tool responses for discovery calls
                            return !(msg.tool_call_id?.includes('list_tool_groups') ||
                                msg.tool_call_id?.includes('get_tools_in_group'));
                        }
                        if (msg.role === 'assistant' && msg.tool_calls) {
                            // Remove assistant turns whose only purpose was issuing discovery calls
                            const isDiscoveryOnly = msg.tool_calls.every((tc: any) =>
                                tc.function.name === 'list_tool_groups' ||
                                tc.function.name === 'get_tools_in_group'
                            );
                            return !isDiscoveryOnly;
                        }
                        return true;
                    });

                    return confirmation;

                case 'create_specification_node':
                    const specData = {
                        spec_interface: {
                            raw: args.spec_interface_raw || '',
                            structured: this.safeParseInnerJSON(args.spec_interface_structured)
                        },
                        spec_constraints: args.spec_constraints,
                        spec_interactions: args.spec_interactions,
                        spec_metadata: args.spec_metadata
                    };

                    await this.visdevManager.createSpecNode({
                        id: args.id,
                        type: args.type,
                        position: { x: Math.random() * 200, y: Math.random() * 200 },
                        data: { label: args.label }
                    }, specData);

                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Created Spec Node: ${args.label}` });
                    vscode.commands.executeCommand('sdd-ide.openBlueprint');
                    return `SUCCESS: Created architectural node '${args.label}' (${args.id}) of type '${args.type}'.`;

                case 'connect_nodes':
                    await this.visdevManager.addEdge(args.source_id, args.target_id, args.label);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔗 Connected ${args.source_id} to ${args.target_id}` });
                    vscode.commands.executeCommand('sdd-ide.openBlueprint');
                    return `SUCCESS: Created edge from ${args.source_id} to ${args.target_id} with label '${args.label}'.`;

                case 'remove_connection':
                    await this.visdevManager.removeEdge(args.edge_id);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✂️ Removed connection: ${args.edge_id}` });
                    vscode.commands.executeCommand('sdd-ide.openBlueprint');
                    return `SUCCESS: Removed connection '${args.edge_id}'.`;

                case 'generate_architecture':
                    for (const nodeArg of args.nodes) {
                        const sData = {
                            spec_interface: {
                                raw: nodeArg.spec_interface_raw || '',
                                structured: this.safeParseInnerJSON(nodeArg.spec_interface_structured)
                            },
                            spec_constraints: nodeArg.spec_constraints,
                            spec_interactions: nodeArg.spec_interactions,
                            spec_metadata: nodeArg.spec_metadata
                        };
                        await this.visdevManager.createSpecNode({
                            id: nodeArg.id,
                            type: nodeArg.type,
                            position: { x: Math.random() * 600, y: Math.random() * 600 },
                            data: { label: nodeArg.label }
                        }, sData);
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Generated Node: ${nodeArg.label}` });
                    }

                    if (args.edges && Array.isArray(args.edges)) {
                        for (const edgeArg of args.edges) {
                            await this.visdevManager.addEdge(edgeArg.source, edgeArg.target, edgeArg.label);
                        }
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔗 Generated ${args.edges.length} connections.` });
                    }
                    vscode.commands.executeCommand('sdd-ide.openBlueprint');
                    return `SUCCESS: Generated ${args.nodes.length} nodes and ${(args.edges || []).length} edges in the current blueprint.`;

                case 'register_file_to_node':
                    await this.visdevManager.addFileToNode(args.node_id, args.relative_path);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `📎 Registered file ${args.relative_path} to node ${args.node_id}` });
                    return `SUCCESS: Linked file ${args.relative_path} to architectural node ${args.node_id}.`;

                case 'create_visdev_demo_project':
                    await this.scaffoldDemoProject(webviewView);
                    return `SUCCESS: Scaffolded VisDev demo project into current workspace context.`;

                case 'read_blueprint_architecture':
                    const blueprint = await this.visdevManager.getBlueprint();
                    const macroGraph = blueprint.nodes ? blueprint.nodes.map((n: any) => ({
                        id: n.id,
                        type: n.type,
                        label: n.data?.label
                    })) : [];
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'Agent fetched the global Blueprint Architecture.' });
                    return JSON.stringify(macroGraph, null, 2);

                case 'update_specification_node':
                    const specDataUpdates: any = {};
                    if (args.spec_interface_raw || args.spec_interface_structured) {
                        try {
                            const existing = await this.visdevManager.getSpecNode(args.id);
                            const dual = typeof existing.spec_interface === 'object' ? existing.spec_interface : { raw: '', structured: [] };
                            specDataUpdates.spec_interface = {
                                raw: args.spec_interface_raw !== undefined ? args.spec_interface_raw : dual.raw,
                                structured: args.spec_interface_structured !== undefined ? this.safeParseInnerJSON(args.spec_interface_structured) : dual.structured
                            };
                        } catch {
                            specDataUpdates.spec_interface = {
                                raw: args.spec_interface_raw || '',
                                structured: this.safeParseInnerJSON(args.spec_interface_structured)
                            };
                        }
                    }
                    if (args.spec_constraints) specDataUpdates.spec_constraints = args.spec_constraints;
                    if (args.spec_interactions) specDataUpdates.spec_interactions = args.spec_interactions;
                    if (args.spec_metadata) specDataUpdates.spec_metadata = args.spec_metadata;
                    await this.visdevManager.updateSpecNode(args.id, specDataUpdates);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Updated Spec Node: ${args.id}` });
                    return `SUCCESS: Updated specification node ${args.id}.`;

                case 'write_code':
                    if (!vscode.workspace.workspaceFolders) throw new Error("No workspace folders found.");
                    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    const fileUri = vscode.Uri.file(path.join(root, args.file_path));
                    const contentData = new TextEncoder().encode(args.content);
                    await vscode.workspace.fs.writeFile(fileUri, contentData);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Wrote code to ${args.file_path}` });
                    // Track file against the active node if set
                    if (this.activeNodeContext) {
                        const nodeIdMatch = this.activeNodeContext.match(/\[([^\]]+)\]/);
                        if (nodeIdMatch) {
                            await this.visdevManager.addFileToNode(nodeIdMatch[1], args.file_path);
                        }
                    }
                    return `SUCCESS: Wrote ${args.content.length} characters to ${args.file_path}.`;

                case 'resolve_active_drift':
                    const pl = args.reconciliation_plan;
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔍 Drift Reconciliation Plan Proposed: ${pl}` });
                    await this.visdevManager.clearDrift();
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `✅ Drift Lock Cleared!` });
                    return `SUCCESS: Applied drift reconciliation plan and cleared architectural boundary lock.`;

                case 'list_workspace_files':
                    const files = await this.visdevManager.listWorkspaceFiles();
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📂 Agent read workspace file tree (${files.length} entries).` });
                    return files.join('\n');

                case 'list_node_files':
                    const meta = await this.visdevManager.getNodeMeta(args.node_id);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📎 Agent read file list for node: ${args.node_id}` });
                    return meta.associatedFiles.length > 0 ? meta.associatedFiles.join('\n') : '(none registered)';

                case 'read_file':
                    const c = await this.visdevManager.readWorkspaceFile(args.relative_path);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📄 Agent read file: ${args.relative_path}` });
                    return c;

                default:
                    return `ERROR: Tool '${name}' not implemented or recognized by this system handler.`;
            }

        } catch (err: any) {
            webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Tool Execution Failed: ${err.message}` });
            return `ERROR: ${err.message}`;
        }
    }

    public async scaffoldDemoProject(webviewView?: vscode.WebviewView) {
        if (this.visdevManager.isInitialized()) {
            webviewView?.webview.postMessage({ type: 'addMessage', sender: 'Error', message: 'Demo Template aborted: .visdev project already exists.' });
            vscode.window.showErrorMessage("Workspace already initialized.");
            return;
        }

        const rootPath = vscode.workspace.workspaceFolders?.[0].uri;
        if (!rootPath) {
            vscode.window.showErrorMessage("No workspace found to scaffold into.");
            return;
        }

        try {
            const children = await vscode.workspace.fs.readDirectory(rootPath);
            const userFiles = children.filter(([name]: [string, vscode.FileType]) => {
                return !name.startsWith('.') && name !== 'node_modules';
            });

            if (userFiles.length > 0) {
                webviewView?.webview.postMessage({ type: 'addMessage', sender: 'Error', message: 'Demo Template aborted: Workspace must be empty of code files.' });
                vscode.window.showErrorMessage("Demo Project can only be scaffolded in an empty directory. Please delete existing files.");
                return;
            }
        } catch (e) { }

        const config = {
            name: "Mock Authentication App",
            description: "A simple demo setup showing how UI endpoints connect to Database schemas securely.",
            techStack: {
                frontend: "React/TypeScript",
                backend: "Node.js Express API",
                database: "PostgreSQL"
            },
            fileBindings: {},
            memory: []
        };

        if (!this.visdevManager.isInitialized()) {
            await this.visdevManager.saveConfig(config);
        }

        for (const node of DEMO_NODES) {
            const specData = {
                spec_interface: node.spec_interface,
                spec_constraints: node.spec_constraints,
                spec_interactions: node.spec_interactions,
                spec_metadata: node.spec_metadata
            };

            await this.visdevManager.createSpecNode({
                id: node.id,
                type: node.type,
                position: node.position,
                data: { label: node.label }
            }, specData);

            webviewView?.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Scaffolded Demo Node: ${node.label}` });
        }

        vscode.commands.executeCommand('sdd-ide.openBlueprint');
        vscode.window.showInformationMessage("Demo Project successfully scaffolded!");
    }

    private async summarizeHistory(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: '🔄 Summarizing older conversation to optimize context...' });

        const chunkToSummarize = this.chatHistory.slice(0, 15);
        const remainingHistory = this.chatHistory.slice(15);

        const prompt = `Please summarize the following architectural discussion and progress concisely. 
Focus on:
1. Significant architectural decisions made.
2. Nodes/features created or updated.
3. Current technical state and constraints identified.

Conversation to summarize:
${JSON.stringify(chunkToSummarize, null, 2)}`;

        try {
            const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "moonshotai/kimi-k2.5",
                    messages: [
                        { role: "system", content: "You are a concise architectural summarizer. Output ONLY the summary text." },
                        { role: "user", content: prompt }
                    ]
                })
            });

            if (response.ok) {
                const data = await response.json() as any;
                const summary = data.choices[0].message.content;

                // Replace the summarized chunk with a single summary message
                this.chatHistory = [
                    { role: "assistant", content: `[SYSTEM: Summary of previous architectural context: ${summary}]` },
                    ...remainingHistory
                ];

                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: '✅ Context compressed.' });
            }
        } catch (error) {
            console.error("Failed to summarize history:", error);
            // Fallback: just slice if summary fails
            this.chatHistory = this.chatHistory.slice(-10);
        }
    }
}
