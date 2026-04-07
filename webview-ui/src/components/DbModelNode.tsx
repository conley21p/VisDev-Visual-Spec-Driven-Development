import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export default function DbModelNode({ data, selected }: NodeProps) {
  return (
    <div style={{
      padding: '10px',
      borderRadius: '5px', // slightly sharper corners for DB models
      background: selected ? '#1f3c3d' : '#142a2b',
      color: '#4db8ff',
      border: `2px solid ${selected ? '#4db8ff' : '#2b5a5c'}`,
      minWidth: '150px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      fontFamily: 'sans-serif'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#2b5a5c' }} />
      <div style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>🗄️</span> {data.label}
      </div>
      <div style={{ fontSize: '11px', color: '#7eb3b5', marginTop: '4px' }}>{data.schema || '{}'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#2b5a5c' }} />
    </div>
  );
}
