import * as vscode from 'vscode';
import * as path from 'path';

export interface VisdevNode {
    id: string;
    type: string;
    position: { x: number, y: number };
    data: any;
}

export interface VisdevEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    animated?: boolean;
    style?: any;
}

export interface VisdevBlueprint {
    nodes: VisdevNode[];
    edges: VisdevEdge[];
}

export interface VisdevConfig {
    name: string;
    description: string;
    techStack: {
        frontend: string;
        backend: string;
        database: string;
    },
    fileBindings: Record<string, string>;
    memory: any[];
}

export interface VisdevSync {
    driftedFiles: any[];
}

export class VisdevManager {
    private basePath: string | undefined;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.basePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.visdev');
        }
    }

    public isInitialized(): boolean {
        return this.basePath !== undefined;
    }

    private get blueprintPath(): string {
        return path.join(this.basePath!, 'blueprint.json');
    }

    private get configPath(): string {
        return path.join(this.basePath!, 'visdev.json');
    }

    private get syncPath(): string {
        return path.join(this.basePath!, 'visdev_sync.json');
    }

    private get specsPath(): string {
        return path.join(this.basePath!, 'specs');
    }

    public async initializeProject(): Promise<void> {
        if (!this.basePath) {
            throw new Error("No workspace opened.");
        }

        const visdevUri = vscode.Uri.file(this.basePath);
        const specsUri = vscode.Uri.file(this.specsPath);

        // Create directories
        await vscode.workspace.fs.createDirectory(visdevUri);
        await vscode.workspace.fs.createDirectory(specsUri);

        // Initialize blueprint.json
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(this.blueprintPath));
        } catch {
            const emptyBlueprint: VisdevBlueprint = { nodes: [], edges: [] };
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(emptyBlueprint, null, 2)));
        }

        // Initialize visdev.json config
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(this.configPath));
        } catch {
            const emptyConfig: VisdevConfig = {
                name: "New VisDev Project",
                description: "",
                techStack: { frontend: "", backend: "", database: "" },
                fileBindings: {},
                memory: []
            };
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.configPath), Buffer.from(JSON.stringify(emptyConfig, null, 2)));
        }

        // Initialize visdev_sync.json
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(this.syncPath));
        } catch {
            const emptySync: VisdevSync = { driftedFiles: [] };
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.syncPath), Buffer.from(JSON.stringify(emptySync, null, 2)));
        }
    }

    public async getBlueprint(): Promise<VisdevBlueprint> {
        if (!this.basePath) throw new Error("No workspace.");
        try {
            const uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(this.blueprintPath));
            const bp = JSON.parse(new TextDecoder().decode(uint8Array)) as VisdevBlueprint;
            return {
                nodes: bp.nodes || [],
                edges: bp.edges || []
            };
        } catch {
            return { nodes: [], edges: [] };
        }
    }

    public async addEdge(source: string, target: string, label?: string): Promise<void> {
        if (!this.basePath) return;
        const blueprint = await this.getBlueprint();
        const id = `e-${source}-${target}-${Math.random().toString(36).substr(2, 4)}`;
        if (!blueprint.edges) blueprint.edges = [];
        
        blueprint.edges.push({
            id,
            source,
            target,
            label,
            animated: true,
            style: { stroke: '#3498db', strokeWidth: 2 }
        });

        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(blueprint, null, 2)));
    }

    public async updateNodeLabel(nodeId: string, newLabel: string): Promise<void> {
        if (!this.basePath) return;
        const blueprint = await this.getBlueprint();
        const node = blueprint.nodes.find(n => n.id === nodeId);
        if (node) {
            if (!node.data) node.data = {};
            node.data.label = newLabel;
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(blueprint, null, 2)));
        }
    }

    public async removeEdge(edgeId: string): Promise<void> {
        if (!this.basePath) return;
        const blueprint = await this.getBlueprint();
        if (!blueprint.edges) return;
        
        blueprint.edges = blueprint.edges.filter(e => e.id !== edgeId);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(blueprint, null, 2)));
    }
    
    public async getConfig(): Promise<VisdevConfig> {
        if (!this.basePath) throw new Error("No workspace.");
        const uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(this.configPath));
        return JSON.parse(new TextDecoder().decode(uint8Array)) as VisdevConfig;
    }

    public async saveConfig(config: VisdevConfig): Promise<void> {
        if (!this.basePath) throw new Error("No workspace.");
        const content = Buffer.from(JSON.stringify(config, null, 2));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.configPath), content);
    }

    public async getSyncState(): Promise<VisdevSync> {
        if (!this.basePath) throw new Error("No workspace.");
        const uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(this.syncPath));
        return JSON.parse(new TextDecoder().decode(uint8Array)) as VisdevSync;
    }

    public async addDriftedFile(filePath: string): Promise<void> {
        if (!this.basePath) return;
        const syncState = await this.getSyncState();
        if (!syncState.driftedFiles.includes(filePath)) {
            syncState.driftedFiles.push(filePath);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.syncPath), Buffer.from(JSON.stringify(syncState, null, 2)));
        }
    }

    public async clearDrift(): Promise<void> {
        if (!this.basePath) return;
        const syncState = await this.getSyncState();
        syncState.driftedFiles = [];
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.syncPath), Buffer.from(JSON.stringify(syncState, null, 2)));
    }

    public async getSpecNode(nodeId: string): Promise<any> {
        if (!this.basePath) throw new Error("No workspace.");
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${nodeId}.json`));
        try {
            const uint8Array = await vscode.workspace.fs.readFile(specUri);
            return JSON.parse(new TextDecoder().decode(uint8Array));
        } catch {
            return {};
        }
    }

    public async createSpecNode(node: VisdevNode, specData: any): Promise<void> {
        if (!this.basePath) throw new Error("No workspace.");
        const blueprint = await this.getBlueprint();
        
        // Add Node
        blueprint.nodes.push(node);
        
        // Save Blueprint
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(blueprint, null, 2)));

        // Save SDD JSON File
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${node.id}.json`));
        await vscode.workspace.fs.writeFile(specUri, Buffer.from(JSON.stringify(specData, null, 2)));
    }

    public async updateSpecNode(nodeId: string, specDataUpdates: any): Promise<void> {
        if (!this.basePath) throw new Error("No workspace.");
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${nodeId}.json`));
        
        let existingData: any = {};
        try {
            const uint8Array = await vscode.workspace.fs.readFile(specUri);
            existingData = JSON.parse(new TextDecoder().decode(uint8Array));
        } catch {
            console.log("Spec file not found, creating new one.");
        }

        const mergedData = { ...existingData };
        if (specDataUpdates.spec_interface) mergedData.spec_interface = specDataUpdates.spec_interface;
        if (specDataUpdates.spec_constraints) mergedData.spec_constraints = specDataUpdates.spec_constraints;
        if (specDataUpdates.spec_interactions) mergedData.spec_interactions = specDataUpdates.spec_interactions;
        if (specDataUpdates.spec_metadata) mergedData.spec_metadata = specDataUpdates.spec_metadata;

        // Saving spec resets executed lock so re-execution is allowed
        mergedData.executed = false;

        await vscode.workspace.fs.writeFile(specUri, Buffer.from(JSON.stringify(mergedData, null, 2)));
    }

    public async setNodeExecuted(nodeId: string): Promise<void> {
        if (!this.basePath) return;
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${nodeId}.json`));
        try {
            const uint8Array = await vscode.workspace.fs.readFile(specUri);
            const data = JSON.parse(new TextDecoder().decode(uint8Array));
            data.executed = true;
            if (!data.associatedFiles) data.associatedFiles = [];
            await vscode.workspace.fs.writeFile(specUri, Buffer.from(JSON.stringify(data, null, 2)));
        } catch (e) { console.error("setNodeExecuted failed:", e); }
    }

    public async addFileToNode(nodeId: string, relativeFilePath: string): Promise<void> {
        if (!this.basePath) return;
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${nodeId}.json`));
        try {
            const uint8Array = await vscode.workspace.fs.readFile(specUri);
            const data = JSON.parse(new TextDecoder().decode(uint8Array));
            if (!data.associatedFiles) data.associatedFiles = [];
            if (!data.associatedFiles.includes(relativeFilePath)) {
                data.associatedFiles.push(relativeFilePath);
            }
            await vscode.workspace.fs.writeFile(specUri, Buffer.from(JSON.stringify(data, null, 2)));
        } catch (e) { console.error("addFileToNode failed:", e); }
    }

    public async getNodeMeta(nodeId: string): Promise<{ executed: boolean; associatedFiles: string[] }> {
        try {
            const spec = await this.getSpecNode(nodeId);
            return {
                executed: spec.executed === true,
                associatedFiles: spec.associatedFiles || []
            };
        } catch {
            return { executed: false, associatedFiles: [] };
        }
    }

    public async listWorkspaceFiles(maxDepth: number = 4): Promise<string[]> {
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri) return [];
        const results: string[] = [];
        const EXCLUDED = new Set(['.git', 'node_modules', '.visdev', 'dist', 'out', 'build']);

        const walk = async (dirUri: vscode.Uri, depth: number) => {
            if (depth > maxDepth) return;
            try {
                const entries = await vscode.workspace.fs.readDirectory(dirUri);
                for (const [name, type] of entries) {
                    if (EXCLUDED.has(name)) continue;
                    const childUri = vscode.Uri.joinPath(dirUri, name);
                    const rel = childUri.fsPath.replace(rootUri.fsPath, '').replace(/\\/g, '/');
                    if (type === vscode.FileType.Directory) {
                        results.push(rel + '/');
                        await walk(childUri, depth + 1);
                    } else {
                        results.push(rel);
                    }
                }
            } catch {}
        };

        await walk(rootUri, 0);
        return results;
    }

    public async readWorkspaceFile(relativePath: string): Promise<string> {
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri) throw new Error("No workspace.");
        const fileUri = vscode.Uri.joinPath(rootUri, relativePath);
        const stat = await vscode.workspace.fs.stat(fileUri);
        const MAX_BYTES = 50 * 1024; // 50 KB cap
        if (stat.size > MAX_BYTES) {
            throw new Error(`File too large (${Math.round(stat.size/1024)}KB). Max allowed is 50KB.`);
        }
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(bytes);
    }
}

