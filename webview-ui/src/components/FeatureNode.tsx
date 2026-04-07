import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export default function FeatureNode({ data, selected }: NodeProps) {
  return (
    <div style={{
      padding: '10px',
      borderRadius: '8px',
      background: selected ? '#3d3d3d' : '#2d2d2d',
      color: '#fff',
      border: `2px solid ${selected ? '#007acc' : '#555'}`,
      minWidth: '150px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      fontFamily: 'sans-serif'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{data.label}</div>
      <div style={{ fontSize: '11px', color: '#aaa' }}>{data.status || 'Draft'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
}
