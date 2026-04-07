import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';

import FeatureNode from './components/FeatureNode';
import DbModelNode from './components/DbModelNode';
import SettingsModal from './components/SettingsModal';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>(initialEdges);
  const [config, setConfig] = useState<any>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Register custom node types
  const nodeTypes = useMemo(() => ({
    feature: FeatureNode,
    dbModel: DbModelNode
  }), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.command === 'setBlueprint') {
            const blueprint = message.data;
            if (blueprint.nodes) setNodes(blueprint.nodes);
            if (blueprint.edges) setEdges(blueprint.edges);
            
            const loadedConfig = message.config;
            setConfig(loadedConfig);
            if (loadedConfig && loadedConfig.name === "New VisDev Project") {
                setShowSettings(true);
            }
        }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Request initial data
    const vscode = (window as any).acquireVsCodeApi && (window as any).acquireVsCodeApi();
    if (vscode) {
        vscode.postMessage({ command: 'loadBlueprint' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveConfig = (newConfig: any) => {
      const vscode = (window as any).acquireVsCodeApi && (window as any).acquireVsCodeApi();
      if (vscode) {
          vscode.postMessage({ command: 'saveVisdevConfig', data: newConfig });
      }
      setConfig(newConfig);
      setShowSettings(false);
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    // Basic VS Code message passing setup
    const vscode = (window as any).acquireVsCodeApi && (window as any).acquireVsCodeApi();
    if (vscode) {
        vscode.postMessage({
            command: 'alert',
            text: `Selected Spec Node: ${node.data.label}`
        });
    } else {
        console.log("Mock message passed: ", node.data.label);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e1e1e', position: 'relative' }}>
      {showSettings && <SettingsModal currentConfig={config} onSave={handleSaveConfig} />}
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background gap={20} size={1} color="#333" />
        <Controls style={{ background: '#222', fill: '#fff', border: '1px solid #444' }} />
      </ReactFlow>
    </div>
  );
}

export default App;
