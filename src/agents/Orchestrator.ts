import * as vscode from 'vscode';
import { BaseAgent } from './BaseAgent';

export abstract class Orchestrator extends BaseAgent {
    // Factory method to be implemented by concrete classes or provided via dependency injection
    protected abstract createSubAgent(taskId: string): BaseAgent;

    protected async handleSubTask(toolCall: any, webviewView: vscode.WebviewView): Promise<string> {
        const args = JSON.parse(toolCall.function.arguments);
        const taskId = args.task_id || `task-${Math.random().toString(36).substr(2, 5)}`;
        const subAgent = this.createSubAgent(taskId);
        
        webviewView.webview.postMessage({ 
            type: 'agentActivity', 
            id: taskId,
            status: 'running',
            instruction: args.instruction,
            log: `🤖 Spawning specialized sub-agent for task: [${taskId}]` 
        });

        const result = await subAgent.run(args.instruction, webviewView, true, taskId);

        webviewView.webview.postMessage({ 
            type: 'agentActivity', 
            id: taskId,
            status: 'complete',
            log: `✅ Sub-task [${taskId}] complete.`,
            payload: result || undefined
        });

        return `SUCCESS: Sub-task [${taskId}] complete. Result: ${result}`;
    }
}
