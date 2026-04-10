import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument, Document, isMap, isScalar, YAMLMap } from 'yaml';

export interface VisdevNode {
    id: string;
    type: string;
    position: { x: number, y: number };
    data: any;
    filePath: string;
}

export interface VisdevEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    animated?: boolean;
    style?: any;
    data?: any;
}

export interface VisdevBlueprint {
    nodes: VisdevNode[];
    edges: VisdevEdge[];
}

export interface VisdevConfig {
    name: string;
    description: string;
    preferredModel?: string;
}

export class VisdevManager {
    private projectRoot: string | undefined;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }

    public isInitialized(): boolean {
        return this.projectRoot !== undefined;
    }

    private get visdevDirPath(): string {
        return path.join(this.projectRoot!, '.visdev');
    }

    private get specsPath(): string {
        return path.join(this.projectRoot!, 'specs');
    }

    private get configPath(): string {
        return path.join(this.visdevDirPath, 'visdev.json');
    }

    private get chatHistoryPath(): string {
        return path.join(this.visdevDirPath, 'chat_history.json');
    }

    public async initializeProject(): Promise<void> {
        if (!this.projectRoot) throw new Error("No workspace opened.");

        const visdevUri = vscode.Uri.file(this.visdevDirPath);
        const specsUri = vscode.Uri.file(this.specsPath);

        await vscode.workspace.fs.createDirectory(visdevUri);
        await vscode.workspace.fs.createDirectory(specsUri);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(this.specsPath, 'domains')));
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(this.specsPath, 'registry')));
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(this.specsPath, 'shared')));

        // Config initialization
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(this.configPath));
        } catch {
            const defaultConfig: VisdevConfig = {
                name: "New VisDev Project",
                description: "Spec-as-Infrastructure Workspace",
                preferredModel: "google/gemini-2.0-flash-001"
            };
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.configPath), Buffer.from(JSON.stringify(defaultConfig, null, 2)));
        }
    }

    public async getBlueprint(): Promise<VisdevBlueprint> {
        if (!this.projectRoot) throw new Error("No workspace.");
        
        const nodes: VisdevNode[] = [];
        const edges: VisdevEdge[] = [];
        
        const files = await this.recursiveListYaml(this.specsPath);
        
        for (const file of files) {
            try {
                const content = await this.readWorkspaceFile(file);
                const doc = parseDocument(content);
                const data = doc.toJS();
                
                const relativePath = file;
                const nodeId = relativePath; // Use relative path as stable ID
                
                const info = data.info || {};
                const position = info['x-visdev-position'] || { x: Math.random() * 500, y: Math.random() * 500 };
                
                nodes.push({
                    id: nodeId,
                    type: info['x-visdev-layer'] || 'core',
                    position: position,
                    filePath: file,
                    data: {
                        label: info.title || path.basename(file),
                        color: info['x-visdev-color'],
                        description: info.description,
                        version: info.version,
                        raw: data // Keep full data for UI
                    }
                });

                // Edge Discovery
                this.discoverEdges(data, nodeId, edges, file);
            } catch (err) {
                console.error(`Error parsing ${file}:`, err);
            }
        }

        return { nodes, edges };
    }

    private discoverEdges(obj: any, sourceId: string, edges: VisdevEdge[], sourceFile: string) {
        const findLinks = (current: any, pth: string = '') => {
            if (!current || typeof current !== 'object') return;

            if (current['x-link-target']) {
                const target = current['x-link-target'];
                // target is usually "../../registry/store-locations.yaml#/components/schemas/StoreSection/properties/label"
                const [targetFileRel, targetInternalPath] = target.split('#');
                const absoluteTargetFile = path.normalize(path.join(path.dirname(path.join(this.projectRoot!, sourceFile)), targetFileRel));
                const targetId = path.relative(this.projectRoot!, absoluteTargetFile).replace(/\\/g, '/');

                edges.push({
                    id: `e-${sourceId}-${targetId}-${pth}`,
                    source: sourceId,
                    target: targetId,
                    label: pth.split('.').pop(),
                    animated: true,
                    data: {
                        sourcePath: pth,
                        targetPath: targetInternalPath,
                        type: 'relational'
                    }
                });
            }

            for (const key in current) {
                findLinks(current[key], pth ? `${pth}.${key}` : key);
            }
        };

        findLinks(obj);
    }

    private async recursiveListYaml(dir: string): Promise<string[]> {
        const results: string[] = [];
        const walk = async (currentPath: string) => {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
            for (const [name, type] of entries) {
                const fullPath = path.join(currentPath, name);
                if (type === vscode.FileType.Directory) {
                    await walk(fullPath);
                } else if (name.endsWith('.yaml') || name.endsWith('.yml')) {
                    results.push(path.relative(this.projectRoot!, fullPath).replace(/\\/g, '/'));
                }
            }
        };
        try {
            await walk(dir);
        } catch {}
        return results;
    }

    public async updateBlueprint(action: { type: string, payload: any }): Promise<void> {
        if (!this.projectRoot) return;

        const { type, payload } = action;

        switch (type) {
            case 'UPDATE_POSITION': {
                const { nodeId, position } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    let info = doc.get('info');
                    if (!info) {
                        doc.set('info', {});
                        info = doc.get('info');
                    }
                    if (isMap(info)) {
                        info.set('x-visdev-position', position);
                    }
                });
                break;
            }
            case 'UPDATE_FIELD': {
                const { nodeId, path: fieldPath, value } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    // fieldPath might be "components.schemas.GroceryItem.properties.name.type"
                    const parts = fieldPath.split('.');
                    doc.setIn(parts, value);
                });
                break;
            }
            case 'CREATE_RELATION': {
                const { sourceNodeId, sourceFieldPath, targetNodeId, targetFieldPath } = payload;
                
                // Calculate relative path from source to target
                const sourceAbs = path.join(this.projectRoot!, sourceNodeId);
                const targetAbs = path.join(this.projectRoot!, targetNodeId);
                const relPath = path.relative(path.dirname(sourceAbs), targetAbs).replace(/\\/g, '/');
                const linkValue = `${relPath}#${targetFieldPath}`;

                await this.transformYaml(sourceNodeId, (doc) => {
                    const parts = sourceFieldPath.split('.');
                    const field = doc.getIn(parts);
                    if (isMap(field)) {
                        field.set('x-link-target', linkValue);
                    } else {
                        // If it's a scalar or doesn't exist, we might need to create it
                        doc.setIn([...parts, 'x-link-target'], linkValue);
                    }
                });
                break;
            }
        }
    }

    private async transformYaml(relativePath: string, transform: (doc: Document) => void) {
        const fullPath = path.join(this.projectRoot!, relativePath);
        const content = await this.readWorkspaceFile(relativePath);
        const doc = parseDocument(content);
        
        transform(doc);
        
        const newContent = doc.toString();
        await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), Buffer.from(newContent));
    }

    public async getConfig(): Promise<VisdevConfig> {
        if (!this.projectRoot) throw new Error("No workspace.");
        try {
            const content = await this.readWorkspaceFile(path.relative(this.projectRoot!, this.configPath));
            return JSON.parse(content);
        } catch {
            return { name: "VisDev Project", description: "" };
        }
    }

    public async saveConfig(config: VisdevConfig): Promise<void> {
        if (!this.projectRoot) return;
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.configPath), Buffer.from(JSON.stringify(config, null, 2)));
    }

    public async readWorkspaceFile(relativePath: string): Promise<string> {
        const fileUri = vscode.Uri.file(path.join(this.projectRoot!, relativePath));
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(bytes);
    }

    public async getChatHistory(): Promise<any[]> {
        if (!this.projectRoot) return [];
        try {
            const content = await this.readWorkspaceFile(path.relative(this.projectRoot!, this.chatHistoryPath));
            return JSON.parse(content);
        } catch {
            return [];
        }
    }

    public async saveChatHistory(history: any[]): Promise<void> {
        if (!this.projectRoot) return;
        await vscode.workspace.fs.writeFile(vscode.Uri.file(this.chatHistoryPath), Buffer.from(JSON.stringify(history, null, 2)));
    }
}
