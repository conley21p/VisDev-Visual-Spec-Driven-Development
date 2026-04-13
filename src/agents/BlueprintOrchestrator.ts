import * as vscode from 'vscode';
import * as path from 'path';
import { Orchestrator } from './Orchestrator';
import { BaseAgent } from './BaseAgent';
import { BlueprintSubAgent } from './BlueprintSubAgent';
import { VISDEV_ARCHITECTURAL_STANDARD_PROMPT } from '../sddStandards';

const ORCHESTRATOR_TOOLS = [
    {
        type: "function",
        function: {
            name: "execute_sub_task",
            description: "Spawns a specialized sub-agent (Worker) to manage, build, or update an INDIVIDUAL SPECIFICATION. Use this for deep-dive architectural work on a specific domain file. All Specification blueprint management will occur with this sub task.",
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
            name: "update_spec_info",
            description: "Updates a field in the 'info' section of a specification (title, description, version, etc.).",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    field: { type: "string", description: "The info field to update (title, description, version, etc.)" },
                    value: { type: "any" }
                },
                required: ["nodeId", "field", "value"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_spec_schema",
            description: "Adds or updates a schema in the components/schemas section.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    name: { type: "string", description: "The name of the schema" },
                    schema: { type: "object", description: "The schema definition" }
                },
                required: ["nodeId", "name", "schema"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_spec_endpoint",
            description: "Adds or updates an endpoint in the paths section.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    path: { type: "string" },
                    method: { type: "string", enum: ["get", "post", "put", "delete", "patch"] },
                    spec: { type: "object" }
                },
                required: ["nodeId", "path", "method", "spec"]
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
                    nodeId: { type: "string", description: "The relative path to the YAML file. Note: domain-layer specs are stored in 'specs/domain/'." }
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
1. LAYERED YAML: System specs are stored in 'specs/[layer]/' corresponding to their x-visdev-layer.
2. AST-AWARE AUTHORING: You manipulate YAML files directly via actions. 
3. RELATIONAL INTEGRITY: Create links between schemas using 'x-link-target' metadata.
4. INDIVIDUAL SPEC MANAGEMENT: Use 'execute_sub_task' to delegate the detailed building and updating of specific YAML domain files to specialized sub-agents.

When delegating a sub-task, provide the worker with:
- The specific Spec path and component name.
- Conceptual system context (how this spec fits into the larger architecture).
- Details of required connections to other nodes in the blueprint.

---
${VISDEV_ARCHITECTURAL_STANDARD_PROMPT}`;
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

            case 'update_spec_info': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_INFO',
                    payload: { nodeId: args.nodeId, field: args.field, value: args.value }
                });
                return `SUCCESS: Updated info.${args.field} in ${args.nodeId}`;
            }

            case 'update_spec_schema': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_SCHEMA',
                    payload: { nodeId: args.nodeId, name: args.name, schema: args.schema }
                });
                return `SUCCESS: Updated schema ${args.name} in ${args.nodeId}`;
            }

            case 'update_spec_endpoint': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_ENDPOINT',
                    payload: { nodeId: args.nodeId, path: args.path, method: args.method, spec: args.spec }
                });
                return `SUCCESS: Updated endpoint ${args.method.toUpperCase()} ${args.path} in ${args.nodeId}`;
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
