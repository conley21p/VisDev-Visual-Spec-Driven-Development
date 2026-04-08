import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState, Panel, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

import FeatureNode from './components/FeatureNode';
import SettingsModal from './components/SettingsModal';
import SpecBuilder from './components/SpecBuilder';

const vscodeApi = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : null;

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 150;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes: layoutedNodes, edges };
};

const IconButton: React.FC<{ icon: string, label: string, onClick: () => void, style?: React.CSSProperties }> = ({ icon, label, onClick, style }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: hovered ? '8px' : '0',
                padding: '10px',
                minWidth: '38px',
                maxWidth: hovered ? '180px' : '38px',
                height: '38px',
                borderRadius: '19px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '11px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                ...style
            }}
        >
            <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center' }}>{icon}</span>
            <span style={{ 
                opacity: hovered ? 1 : 0, 
                transition: 'opacity 0.2s',
                pointerEvents: 'none'
            }}>
                {label}
            </span>
        </button>
    );
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>(initialEdges);
  const [config, setConfig] = useState<any>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [activeSpecNode, setActiveSpecNode] = useState<string | null>(null);
  const [activeSpecData, setActiveSpecData] = useState<any>(null);
  const [executingNodes, setExecutingNodes] = useState<Set<string>>(new Set());
  const [hasDrift, setHasDrift] = useState<boolean>(false);

  const onLayout = (direction: string) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      direction
    );

    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
  };

  // Register custom node types
  const nodeTypes = useMemo(() => ({
    feature: FeatureNode,
    api: FeatureNode,
    uiComponent: FeatureNode,
    dbModel: FeatureNode,
    event: FeatureNode,
    worker: FeatureNode,
    logic: FeatureNode,
    gateway: FeatureNode,
    cache: FeatureNode,
    externalService: FeatureNode,
    note: FeatureNode,
    boundary: FeatureNode
  }), []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (!message || typeof message !== 'object') return;

        if (message.command === 'setBlueprint') {
            const blueprint = message.data;
            if (blueprint && blueprint.nodes) {
                const mappedNodes = blueprint.nodes.map((n: Node) => ({
                    ...n,
                    data: { 
                        ...n.data, 
                        isExecuting: false,
                        isExecuted: n.data?.executed === true,
                        onExecute: (id: string) => {
                            if (executingNodes.has(id)) return;
                            setExecutingNodes(prev => new Set(prev).add(id));
                            if (vscodeApi) vscodeApi.postMessage({ command: 'executeNode', nodeId: id });
                            setTimeout(() => setExecutingNodes(prev => { const s = new Set(prev); s.delete(id); return s; }), 15000);
                        },
                        onRename: (id: string, newLabel: string) => {
                            if (vscodeApi) vscodeApi.postMessage({ command: 'renameNode', nodeId: id, newLabel });
                        }
                    }
                }));
                setNodes(mappedNodes);
            }
            if (blueprint.edges) setEdges(blueprint.edges);
            
            const loadedConfig = message.config;
            setConfig(loadedConfig);
            if (loadedConfig && loadedConfig.name === "New VisDev Project") {
                setShowSettings(true);
            }
            if (typeof message.hasDrift === 'boolean') {
                setHasDrift(message.hasDrift);
            }
        } else if (message.command === 'setSpecData') {
            setActiveSpecData(message.data);
            setActiveSpecNode(message.nodeId);
        } else if (message.command === 'executionComplete') {
            setExecutingNodes(prev => { const s = new Set(prev); s.delete(message.nodeId); return s; });
        }
    };
    
    window.addEventListener('message', handleMessage);
    if (vscodeApi) vscodeApi.postMessage({ command: 'loadBlueprint' });
    return () => window.removeEventListener('message', handleMessage);
  }, [executingNodes]);

  const handleSaveConfig = (newConfig: any) => {
      if (vscodeApi) vscodeApi.postMessage({ command: 'saveVisdevConfig', data: newConfig });
      setConfig(newConfig);
      setShowSettings(false);
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    if (vscodeApi) vscodeApi.postMessage({ command: 'getSpec', nodeId: node.id });
  };

  const handleSaveSpec = (nodeId: string, updatedData: any) => {
      if (vscodeApi) vscodeApi.postMessage({ command: 'saveSpec', nodeId, data: updatedData });
      setActiveSpecNode(null);
  };

  const pendingNodeCount = nodes.filter((n: any) => n.data?.isExecuted === false).length;

  const handleExecuteAll = () => {
    const unexecuted = nodes.filter((n: any) => n.data?.isExecuted === false);
    unexecuted.forEach((n: any) => {
        if (executingNodes.has(n.id)) return;
        setExecutingNodes(prev => new Set(prev).add(n.id));
        if (vscodeApi) vscodeApi.postMessage({ command: 'executeNode', nodeId: n.id });
        setTimeout(() => setExecutingNodes(prev => { const s = new Set(prev); s.delete(n.id); return s; }), 15000);
    });
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1e1e1e', position: 'relative' }}>
      {showSettings && <SettingsModal currentConfig={config} onSave={handleSaveConfig} onDemo={() => {
          if (vscodeApi) vscodeApi.postMessage({ command: 'createDemoWorkspace' });
          setShowSettings(false);
      }} />}
      {activeSpecNode && activeSpecData && (
          <SpecBuilder 
              key={activeSpecNode}
              nodeId={activeSpecNode} 
              initialData={activeSpecData} 
              onSave={handleSaveSpec} 
              onClose={() => setActiveSpecNode(null)} 
          />
      )}
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Panel position="top-left" style={{ zIndex: 100 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                <IconButton 
                    icon="+" 
                    label="Add Spec Node" 
                    onClick={() => { if (vscodeApi) vscodeApi.postMessage({ command: 'addManualNode' }); }}
                    style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                />

                <IconButton 
                    icon="📐" 
                    label="Auto Layout" 
                    onClick={() => onLayout('TB')}
                    style={{ backgroundColor: '#34495e', color: '#fff' }}
                />

                {pendingNodeCount > 0 && (
                    <IconButton 
                        icon="🚀" 
                        label={`Execute All (${pendingNodeCount})`} 
                        onClick={handleExecuteAll}
                        style={{ background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)', color: '#fff' }}
                    />
                )}

                {hasDrift && (
                    <IconButton 
                        icon="⚠" 
                        label="Resolve Drift" 
                        onClick={() => {
                            if (vscodeApi) vscodeApi.postMessage({ command: 'processPrompt', mode: 'all-powerful', text: 'There is active drift in the project. Please use the resolve_active_drift tool to reconcile the architectural drift.' });
                        }}
                        style={{ backgroundColor: '#c0392b', color: '#fff', animation: 'pulse 1.5s infinite' }}
                    />
                )}
            </div>
        </Panel>
        <Background gap={20} size={1} color="#333" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default App;
