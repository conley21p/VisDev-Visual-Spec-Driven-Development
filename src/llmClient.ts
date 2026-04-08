import * as vscode from 'vscode';
import { getToolsForMode } from './agentTools';
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

    constructor(visdevManager: VisdevManager) {
        this.visdevManager = visdevManager;
    }

    public cancelRequest() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    public async initialize(context: vscode.ExtensionContext) {
        this.apiKey = await context.secrets.get('sdd.kimiApiKey');
        
        if (this.visdevManager.isInitialized()) {
            try {
                const config = await this.visdevManager.getConfig();
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

    private mapErrorMessage(status: number, rawError: string): string {
        switch (status) {
            case 401:
                return "Unauthorized: Your Kimi API key is invalid or expired. Check your extension settings.";
            case 403:
                return "Forbidden: You don't have permission to access this model. Check your API account status.";
            case 429:
                return "Rate Limit: Too many requests sent too quickly. Please wait a minute and try again.";
            case 500:
                return "Internal Server Error: The model provider is experiencing technical difficulties.";
            case 502:
            case 503:
                return "Service Unavailable: The model endpoint is temporarily down. Try again in a few minutes.";
            case 504:
                return "Gateway Timeout: Nvidia's servers took too long to respond. This usually happens if the model is overloaded or the architectural request is extremely complex.";
            default:
                return `API Error (${status}): ${rawError}`;
        }
    }

    public async processPrompt(prompt: string, mode: string, webviewView: vscode.WebviewView) {
        if (!this.apiKey) {
            webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'API Key missing. Please enter it first.' });
            return;
        }

        const isInitialized = this.visdevManager.isInitialized();
        const syncState = await this.visdevManager.getSyncState();
        const hasActiveDrift = syncState?.driftedFiles?.length > 0;
        const tools = getToolsForMode(mode, hasActiveDrift, isInitialized);

        if (prompt) {
            this.chatHistory.push({ role: "user", content: prompt });
        }

        if (this.chatHistory.length > 25) {
            await this.summarizeHistory(webviewView);
        }

        let driftContext = "";
        if (hasActiveDrift) {
            driftContext = `\n\nURGENT: Active drift detected in files: ${syncState.driftedFiles.join(', ')}. You MUST use resolve_active_drift.`;
        }

        const systemPromptStr = (this.configContext || "Project context not loaded.") + "\n" + (this.activeNodeContext || "") + driftContext;

        const requestBody = {
            model: "moonshotai/kimi-k2.5",
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
            message: 'Calling NVidia Kimi K2.5 API...', 
            isTechnical: true,
            payload: JSON.stringify(requestBody, null, 2)
        });

        this.cancelRequest(); // Abort previous if any
        this.abortController = new AbortController();

        try {
            // NOTE: Using native Node fetch (v18+)
            const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                signal: this.abortController.signal,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                const friendlyMsg = this.mapErrorMessage(response.status, errText);
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: friendlyMsg });
                return;
            }

            const data = await response.json() as any;
            const messageObj = data.choices[0].message;

            if (messageObj.content) {
                this.chatHistory.push({ role: "assistant", content: messageObj.content });
            } else if (messageObj.tool_calls) {
                const toolNames = messageObj.tool_calls.map((t: any) => t.function.name).join(', ');
                this.chatHistory.push({ role: "assistant", content: `[Thinking: Using tools ${toolNames}]` });
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `Agent invoking tools: ${toolNames}`, isTechnical: true });
            }

            if (messageObj.tool_calls) {
                for (const tool_call of messageObj.tool_calls) {
                    try {
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `Executing tool: ${tool_call.function.name}...`, isTechnical: true });
                        await this.executeToolCall(tool_call, webviewView);
                    } catch (err: any) {
                        webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Tool execution failed: ${err.message}` });
                    }
                }
            } else {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: messageObj.content || "Empty response." });
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("LLM Request aborted by user.");
                return;
            }
            webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Request failed: ${error.message}` });
        } finally {
            this.abortController = null;
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

    private async executeToolCall(toolCall: any, webviewView: vscode.WebviewView) {
        const name = toolCall.function.name;
        const args = this.safeParseArguments(toolCall.function.arguments);

        try {
            if (name === 'create_specification_node') {
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
            }
            else if (name === 'connect_nodes') {
                await this.visdevManager.addEdge(args.source_id, args.target_id, args.label);
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔗 Connected ${args.source_id} to ${args.target_id}` });
                vscode.commands.executeCommand('sdd-ide.openBlueprint');
            }
            else if (name === 'remove_connection') {
                await this.visdevManager.removeEdge(args.edge_id);
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✂️ Removed connection: ${args.edge_id}` });
                vscode.commands.executeCommand('sdd-ide.openBlueprint');
            }
            else if (name === 'generate_architecture') {
                for (const nodeArg of args.nodes) {
                    const specData = {
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
                    }, specData);
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `✅ Generated Node: ${nodeArg.label}` });
                }

                if (args.edges && Array.isArray(args.edges)) {
                    for (const edgeArg of args.edges) {
                        await this.visdevManager.addEdge(edgeArg.source, edgeArg.target, edgeArg.label);
                    }
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔗 Generated ${args.edges.length} connections.` });
                }

                vscode.commands.executeCommand('sdd-ide.openBlueprint'); 
            }
            else if (name === 'register_file_to_node') {
                await this.visdevManager.addFileToNode(args.node_id, args.relative_path);
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `📎 Registered file ${args.relative_path} to node ${args.node_id}` });
            }
            else if (name === 'create_visdev_demo_project') {
                await this.scaffoldDemoProject(webviewView);
            }
            else if (name === 'read_blueprint_architecture') {
                const blueprint = await this.visdevManager.getBlueprint();
                const macroGraph = blueprint.nodes ? blueprint.nodes.map((n: any) => ({
                    id: n.id,
                    type: n.type,
                    label: n.data?.label
                })) : [];
                
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: 'Agent fetched the global Blueprint Architecture.' });
                
                const injection = `System context: The current blueprint architecture contains these nodes: ${JSON.stringify(macroGraph)}`;
                this.chatHistory.push({ role: "user", content: injection });
                await this.processPrompt("", "all-powerful", webviewView);
            }
            else if (name === 'update_specification_node') {
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
            }
            else if (name === 'write_code') {
                if (!vscode.workspace.workspaceFolders) return;
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
            }
            else if (name === 'resolve_active_drift') {
                const plan = args.reconciliation_plan;
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `🔍 Drift Reconciliation Plan Proposed: ${plan}` });
                await this.visdevManager.clearDrift();
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `✅ Drift Lock Cleared!` });
            }
            else if (name === 'list_workspace_files') {
                const files = await this.visdevManager.listWorkspaceFiles();
                const injection = `Workspace file tree:\n${files.join('\n')}`;
                this.chatHistory.push({ role: "user", content: injection });
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📂 Agent read workspace file tree (${files.length} entries).` });
                await this.processPrompt("", "all-powerful", webviewView);
            }
            else if (name === 'list_node_files') {
                const meta = await this.visdevManager.getNodeMeta(args.node_id);
                const injection = `Files associated with spec node [${args.node_id}]:\n${meta.associatedFiles.length > 0 ? meta.associatedFiles.join('\n') : '(none registered)'}`;
                this.chatHistory.push({ role: "user", content: injection });
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📎 Agent read file list for node: ${args.node_id}` });
                await this.processPrompt("", "all-powerful", webviewView);
            }
            else if (name === 'read_file') {
                try {
                    const content = await this.visdevManager.readWorkspaceFile(args.relative_path);
                    const injection = `Contents of file [${args.relative_path}]:\n\`\`\`\n${content}\n\`\`\``;
                    this.chatHistory.push({ role: "user", content: injection });
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'System', message: `📄 Agent read file: ${args.relative_path}` });
                    await this.processPrompt("", "all-powerful", webviewView);
                } catch (fileErr: any) {
                    webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `read_file failed: ${fileErr.message}` });
                }
            }
            else {
                webviewView.webview.postMessage({ type: 'addMessage', sender: 'Agent', message: `Tool executed: ${name}` });
            }

        } catch (err: any) {
             webviewView.webview.postMessage({ type: 'addMessage', sender: 'Error', message: `Tool Execution Failed: ${err.message}` });
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
        } catch (e) {}

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
