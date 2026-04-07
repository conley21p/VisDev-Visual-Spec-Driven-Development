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
        const uint8Array = await vscode.workspace.fs.readFile(vscode.Uri.file(this.blueprintPath));
        return JSON.parse(new TextDecoder().decode(uint8Array)) as VisdevBlueprint;
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

    public async createSpecNode(node: VisdevNode, markdownContent: string): Promise<void> {
        if (!this.basePath) throw new Error("No workspace.");
        const blueprint = await this.getBlueprint();
        
        // Add Node
        blueprint.nodes.push(node);
        
        // Save Blueprint
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.blueprintPath), Buffer.from(JSON.stringify(blueprint, null, 2)));

        // Save Markdown File
        const specUri = vscode.Uri.file(path.join(this.specsPath, `${node.id}.md`));
        await vscode.workspace.fs.writeFile(specUri, Buffer.from(markdownContent));
    }
}
