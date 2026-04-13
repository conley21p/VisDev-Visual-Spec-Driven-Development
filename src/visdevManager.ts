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
    sourceHandle?: string;
    targetHandle?: string;
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
        // Initial sync best effort, but will be refined by ensureProjectRoot
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }

    private async ensureProjectRoot(): Promise<string> {
        // If we haven't searched yet, or we're in a multi-folder workspace, we search for the .visdev boundary
        const configFiles = await vscode.workspace.findFiles('**/.visdev/visdev.json', '**/node_modules/**', 1);
        if (configFiles.length > 0) {
            this.projectRoot = path.dirname(path.dirname(configFiles[0].fsPath));
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        
        if (!this.projectRoot) {
            throw new Error("No workspace or VisDev project found.");
        }
        return this.projectRoot;
    }

    public isInitialized(): boolean {
        return this.projectRoot !== undefined;
    }

    private async getVisdevDirPath(): Promise<string> {
        const root = await this.ensureProjectRoot();
        return path.join(root, '.visdev');
    }

    private async getSpecsPath(): Promise<string> {
        const root = await this.ensureProjectRoot();
        return path.join(root, 'specs');
    }

    private async getConfigPath(): Promise<string> {
        const dir = await this.getVisdevDirPath();
        return path.join(dir, 'visdev.json');
    }

    private async getChatHistoryPath(): Promise<string> {
        const dir = await this.getVisdevDirPath();
        return path.join(dir, 'chat_history.json');
    }

    public async initializeProject(): Promise<void> {
        const root = await this.ensureProjectRoot();
        const visdevPath = await this.getVisdevDirPath();
        const specsPath = await this.getSpecsPath();

        const visdevUri = vscode.Uri.file(visdevPath);
        const specsUri = vscode.Uri.file(specsPath);

        await vscode.workspace.fs.createDirectory(visdevUri);
        await vscode.workspace.fs.createDirectory(specsUri);

        const layers = ['domain', 'ui', 'external', 'data', 'infra', 'worker'];
        for (const layer of layers) {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(specsPath, layer)));
        }

        // Config initialization
        const configPath = await this.getConfigPath();
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
        } catch {
            const defaultConfig: VisdevConfig = {
                name: "New VisDev Project",
                description: "Spec-as-Infrastructure Workspace",
                preferredModel: "google/gemini-2.0-flash-001"
            };
            await vscode.workspace.fs.writeFile(vscode.Uri.file(configPath), Buffer.from(JSON.stringify(defaultConfig, null, 2)));
        }
    }

    public async getBlueprint(): Promise<VisdevBlueprint> {
        const root = await this.ensureProjectRoot();
        const specsPath = await this.getSpecsPath();
        
        const nodes: VisdevNode[] = [];
        const edges: VisdevEdge[] = [];
        
        const files = await this.recursiveListYaml(specsPath);
        
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

    private normalizePath(rawPath: string): string {
        if (!rawPath) return '';
        // Strip leading # or #/ or /
        let normalized = rawPath.replace(/^#\/?/, '').replace(/^\//, '');
        // Convert / to .
        normalized = normalized.replace(/\//g, '.');
        return normalized;
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

                const sourceHandle = this.normalizePath(pth);
                const targetHandle = this.normalizePath(targetInternalPath);

                edges.push({
                    id: `e-${sourceId}-${targetId}-${pth}`,
                    source: sourceId,
                    target: targetId,
                    sourceHandle,
                    targetHandle,
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
        const root = await this.ensureProjectRoot();

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
                    const parts = fieldPath.split('.');
                    const parsedValue = this.tryParseObject(value);
                    doc.setIn(parts, parsedValue);
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
            case 'CREATE_SPEC': {
                const { nodeId, layer, title } = payload;
                const fullPath = path.join(this.projectRoot!, nodeId);
                const dir = path.dirname(fullPath);
                
                try {
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
                } catch {}

                const doc = new Document({
                    openapi: "3.0.0",
                    info: {
                        title: title || path.basename(nodeId, '.yaml'),
                        version: "1.0.0",
                        'x-visdev-layer': layer || 'core',
                        'x-visdev-position': { x: Math.random() * 200, y: Math.random() * 200 }
                    },
                    paths: {},
                    components: { schemas: {} }
                });
                
                await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), Buffer.from(doc.toString()));
                break;
            }
            case 'DELETE_SPEC': {
                const { nodeId } = payload;
                const fullPath = path.join(this.projectRoot!, nodeId);
                await vscode.workspace.fs.delete(vscode.Uri.file(fullPath), { recursive: true, useTrash: true });
                break;
            }
            case 'DELETE_FIELD': {
                const { nodeId, path: fieldPath } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    const parts = fieldPath.split('.');
                    doc.deleteIn(parts);
                });
                break;
            }
            case 'UPDATE_INFO': {
                const { nodeId, field, value } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    doc.setIn(['info', field], value);
                });
                break;
            }
            case 'UPDATE_SCHEMA': {
                const { nodeId, name, schema } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    const parsedSchema = this.tryParseObject(schema);
                    doc.setIn(['components', 'schemas', name], parsedSchema);
                });
                break;
            }
            case 'UPDATE_ENDPOINT': {
                const { nodeId, path: endpointPath, method, spec } = payload;
                await this.transformYaml(nodeId, (doc) => {
                    const parsedSpec = this.tryParseObject(spec);
                    // Use array pathing to ensure dots in URL paths (e.g. v1.1) are handled correctly
                    doc.setIn(['paths', endpointPath, method.toLowerCase()], parsedSpec);
                });
                break;
            }
        }
    }

    private tryParseObject(value: any): any {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                return value;
            }
        }
        return value;
    }

    private async transformYaml(relativePath: string, transform: (doc: Document) => void) {
        const root = await this.ensureProjectRoot();
        const fullPath = path.join(root, relativePath);
        const content = await this.readWorkspaceFile(relativePath);
        const doc = parseDocument(content);
        
        transform(doc);
        
        const newContent = doc.toString();
        await vscode.workspace.fs.writeFile(vscode.Uri.file(fullPath), Buffer.from(newContent));
    }

    public async getConfig(): Promise<VisdevConfig> {
        const root = await this.ensureProjectRoot();
        const configPath = await this.getConfigPath();
        try {
            const content = await this.readWorkspaceFile(path.relative(root, configPath));
            return JSON.parse(content);
        } catch {
            return { name: "VisDev Project", description: "" };
        }
    }

    public async saveConfig(config: VisdevConfig): Promise<void> {
        const root = await this.ensureProjectRoot();
        const configPath = await this.getConfigPath();
        await vscode.workspace.fs.writeFile(vscode.Uri.file(configPath), Buffer.from(JSON.stringify(config, null, 2)));
    }

    public async readWorkspaceFile(relativePath: string): Promise<string> {
        const root = await this.ensureProjectRoot();
        const fileUri = vscode.Uri.file(path.join(root, relativePath));
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        return new TextDecoder().decode(bytes);
    }

    public async getChatHistory(): Promise<any[]> {
        const root = await this.ensureProjectRoot();
        const chatHistoryPath = await this.getChatHistoryPath();
        try {
            const content = await this.readWorkspaceFile(path.relative(root, chatHistoryPath));
            return JSON.parse(content);
        } catch {
            return [];
        }
    }

    public async saveChatHistory(history: any[]): Promise<void> {
        const root = await this.ensureProjectRoot();
        const chatHistoryPath = await this.getChatHistoryPath();
        await vscode.workspace.fs.writeFile(vscode.Uri.file(chatHistoryPath), Buffer.from(JSON.stringify(history, null, 2)));
    }
}
