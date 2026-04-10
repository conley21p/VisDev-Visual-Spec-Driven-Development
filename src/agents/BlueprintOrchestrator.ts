import * as vscode from 'vscode';
import * as path from 'path';
import { Orchestrator } from './Orchestrator';
import { BaseAgent } from './BaseAgent';
import { BlueprintSubAgent } from './BlueprintSubAgent';

const ORCHESTRATOR_TOOLS = [
    {
        type: "function",
        function: {
            name: "execute_sub_task",
            description: "Spawns a specialized sub-agent (Worker) to manage, build, or update an INDIVIDUAL SPECIFICATION. Use this for deep-dive architectural work on a specific domain file. This is a BLOCKING call.",
            parameters: {
                type: "object",
                properties: {
                    task_id: { type: "string" },
                    instruction: { type: "string", description: "Detailed directive for the sub-agent, including targeted spec, conceptual context, and required connections." }
                },
                required: ["task_id", "instruction"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_domain_spec",
            description: "Creates a new domain specification file in specs/domains/.",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "e.g., payments.yaml" },
                    title: { type: "string" },
                    description: { type: "string" },
                    initial_layer: { type: "string", enum: ["core", "edge", "external"] }
                },
                required: ["filename", "title", "description"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_spec_field",
            description: "Updates a specific field in a YAML specification using dotted path notation.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "The relative path to the YAML file, e.g. 'specs/domains/items.yaml'" },
                    path: { type: "string", description: "Dotted path, e.g. 'components.schemas.User.properties.email.type'" },
                    value: { type: "any" }
                },
                required: ["nodeId", "path", "value"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "connect_nodes",
            description: "Creates a relational link between two schema properties across different spec files using x-link-target.",
            parameters: {
                type: "object",
                properties: {
                    sourceNodeId: { type: "string" },
                    sourceFieldPath: { type: "string", description: "Property path in source, e.g. 'components.schemas.Order.properties.userId'" },
                    targetNodeId: { type: "string" },
                    targetFieldPath: { type: "string", description: "Property path in target, e.g. 'components.schemas.User.properties.id'" }
                },
                required: ["sourceNodeId", "sourceFieldPath", "targetNodeId", "targetFieldPath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_spec_content",
            description: "Reads the raw YAML content of a specific specification file.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "The relative path to the YAML file, e.g. 'specs/domains/items.yaml'" }
                },
                required: ["nodeId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_blueprint_architecture",
            description: "Reads the entire global VisDev node blueprint and all relational links.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    }
];

export class BlueprintOrchestrator extends Orchestrator {
    protected getSystemPrompt(): string {
        return `You are the VisDev Blueprint Architect. You build system architectures using Spec-as-Infrastructure.
        
CORE PRINCIPLES:
1. MODULAR YAML: System specs are stored in 'specs/domains/' (Core logic) and 'specs/registry/' (Reference data).
2. AST-AWARE AUTHORING: You manipulate YAML files directly via actions. 
3. RELATIONAL INTEGRITY: Create links between schemas using 'x-link-target' metadata.
4. INDIVIDUAL SPEC MANAGEMENT: Use 'execute_sub_task' to delegate the detailed building and updating of specific YAML domain files to specialized sub-agents.

When delegating a sub-task, provide the worker with:
- The specific Spec path and component name.
- Conceptual system context (how this spec fits into the larger architecture).
- Details of required connections to other nodes in the blueprint.`;
    }

    protected getTools(): any[] {
        return ORCHESTRATOR_TOOLS;
    }

    protected createSubAgent(taskId: string): BaseAgent {
        return new BlueprintSubAgent(this.visdevManager, this.apiKey, this.model);
    }

    protected async executeToolCall(toolCall: any, webviewView: vscode.WebviewView): Promise<string> {
        const name = toolCall.function.name;
        const args = this.normalizeArguments(name, JSON.parse(toolCall.function.arguments));

        switch (name) {
            case 'execute_sub_task':
                return await this.handleSubTask(toolCall, webviewView);

            case 'create_domain_spec': {
                const relativePath = `specs/domains/${args.filename}`;
                const initialContent = `openapi: 3.1.0\ninfo:\n  title: ${args.title}\n  version: 1.0.0\n  description: ${args.description}\n  x-visdev-layer: ${args.initial_layer || 'core'}\n\npaths: {}\ncomponents:\n  schemas: {}\n`;

                const projectRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (!projectRoot) return "ERROR: No workspace.";

                const fullPath = vscode.Uri.file(path.join(projectRoot, relativePath));
                await vscode.workspace.fs.writeFile(fullPath, Buffer.from(initialContent));

                return `SUCCESS: Created new domain spec at ${relativePath}`;
            }

            case 'update_spec_field': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_FIELD',
                    payload: {
                        nodeId: args.nodeId,
                        path: args.path,
                        value: args.value
                    }
                });
                return `SUCCESS: Updated ${args.path} in ${args.nodeId}`;
            }

            case 'connect_nodes': {
                await this.visdevManager.updateBlueprint({
                    type: 'CREATE_RELATION',
                    payload: {
                        sourceNodeId: args.sourceNodeId,
                        sourceFieldPath: args.sourceFieldPath,
                        targetNodeId: args.targetNodeId,
                        targetFieldPath: args.targetFieldPath
                    }
                });
                return `SUCCESS: Created relational link between ${args.sourceNodeId} and ${args.targetNodeId}`;
            }

            case 'read_spec_content':
                return await this.visdevManager.readWorkspaceFile(args.nodeId);

            case 'read_blueprint_architecture':
                return JSON.stringify(await this.visdevManager.getBlueprint());

            default:
                return `ERROR: Tool ${name} not implemented in Orchestrator.`;
        }
    }
}
