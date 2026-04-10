import React, { useMemo, useEffect, useState, useCallback } from 'react';
import ReactFlow, { 
    Background, 
    Controls, 
    Node, 
    Edge, 
    useNodesState, 
    useEdgesState, 
    Panel, 
    Position, 
    addEdge, 
    Connection 
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

import FeatureNode from './components/FeatureNode';
import SettingsModal from './components/SettingsModal';

const vscodeApi = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : null;

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 220;
const nodeHeight = 300;

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

  // Custom Node Logic for Bi-Directional Authoring
  const onUpdateField = useCallback((nodeId: string, path: string, value: any) => {
    if (vscodeApi) {
        vscodeApi.postMessage({
            command: 'updateBlueprint',
            action: { type: 'UPDATE_FIELD', payload: { nodeId, path, value } }
        });
    }
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (vscodeApi) {
        vscodeApi.postMessage({
            command: 'updateBlueprint',
            action: { type: 'UPDATE_POSITION', payload: { nodeId: node.id, position: node.position } }
        });
    }
  }, []);

  const onConnect = useCallback((params: Connection) => {
    if (vscodeApi && params.source && params.target && params.sourceHandle && params.targetHandle) {
        // targetHandle should be the schema path, e.g. "components.schemas.StoreSection.properties.label"
        vscodeApi.postMessage({
            command: 'updateBlueprint',
            action: { 
                type: 'CREATE_RELATION', 
                payload: { 
                    sourceNodeId: params.source,
                    sourceFieldPath: params.sourceHandle,
                    targetNodeId: params.target,
                    targetFieldPath: params.targetHandle
                } 
            }
        });
    }
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const onLayout = (direction: string) => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      direction
    );

    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
  };

  const nodeTypes = useMemo(() => ({
    feature: (props: any) => <FeatureNode {...props} onUpdateField={onUpdateField} />,
    core: (props: any) => <FeatureNode {...props} onUpdateField={onUpdateField} />,
    edge: (props: any) => <FeatureNode {...props} onUpdateField={onUpdateField} />,
    external: (props: any) => <FeatureNode {...props} onUpdateField={onUpdateField} />
  }), [onUpdateField]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (!message || typeof message !== 'object') return;

        if (message.command === 'setBlueprint') {
            const blueprint = message.data;
            if (blueprint && blueprint.nodes) {
                setNodes(blueprint.nodes);
            }
            if (blueprint && blueprint.edges) {
                setEdges(blueprint.edges);
            }
            
            const loadedConfig = message.config;
            setConfig(loadedConfig);
            if (loadedConfig && loadedConfig.name === "New VisDev Project") {
                setShowSettings(true);
            }
        }
    };
    
    window.addEventListener('message', handleMessage);
    if (vscodeApi) vscodeApi.postMessage({ command: 'loadBlueprint' });
    return () => window.removeEventListener('message', handleMessage);
  }, [setNodes, setEdges]);

  const handleSaveConfig = (newConfig: any) => {
      if (vscodeApi) vscodeApi.postMessage({ command: 'saveVisdevConfig', data: newConfig });
      setConfig(newConfig);
      setShowSettings(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#121212', position: 'relative' }}>
      {showSettings && <SettingsModal currentConfig={config} onSave={handleSaveConfig} onDemo={() => {
          if (vscodeApi) vscodeApi.postMessage({ command: 'createDemoWorkspace' });
          setShowSettings(false);
      }} />}
      {/* Dynamic Island style header */}
      {config && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 18px',
            borderRadius: 24,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            minWidth: 260,
            maxWidth: '70vw'
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px' }}>{config.name}</div>
            {config.description && <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, textAlign: 'center', maxWidth: '60vw' }}>{config.description}</div>}
          </div>
        </div>
      )}

      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        fitView
      >
        <Panel position="top-left" style={{ zIndex: 100 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                <IconButton 
                    icon="+" 
                    label="Add Domain Spec" 
                    onClick={() => { /* TODO: Implement */ }}
                    style={{ backgroundColor: '#2ecc71', color: '#fff' }}
                />

                <IconButton 
                    icon="📐" 
                    label="Auto Layout" 
                    onClick={() => onLayout('TB')}
                    style={{ backgroundColor: '#34495e', color: '#fff' }}
                />
            </div>
        </Panel>
        <Background gap={20} size={1} color="#222" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default App;
