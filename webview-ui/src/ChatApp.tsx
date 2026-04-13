import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';

// VS Code API Access
const vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : {
    postMessage: (m: any) => console.log('Mock VS Code postMessage:', m)
};

interface Message {
    id: string;
    sender: 'user' | 'agent' | 'assistant' | 'system' | 'error' | 'technical';
    text: string;
    timestamp: number;
    payload?: string;
}

interface Activity {
    id: string;
    status: 'running' | 'complete' | 'error';
    instruction?: string;
    logs: { text: string; payload?: string; timestamp: number }[];
}

const DebugLogItem: React.FC<{ m: Message | { text: string, payload?: string, id?: string } }> = ({ m }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    
    const copyToClipboard = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!m.payload) return;
        navigator.clipboard.writeText(m.payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getLogType = (text: string) => {
        const t = (text || '').toUpperCase();
        if (t.includes('REQUEST')) return 'request';
        if (t.includes('RESPONSE')) return 'response';
        if (t.includes('TOOL')) return 'tool';
        if (t.includes('ERROR')) return 'error';
        if (t.includes('SUCCESS')) return 'success';
        return 'info';
    };

    const type = getLogType(m.text || '');
    const id = (m as any).id || Math.random().toString(36).substr(2, 9);
    
    const renderIcon = () => {
        switch (type) {
            case 'request': 
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
            case 'response': 
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
            case 'tool': 
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
            case 'error': 
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
            case 'success':
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
            default: 
                return <svg className="debug-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
        }
    };

    return (
        <div className={`debug-log-item ${isExpanded ? 'expanded' : ''}`} key={id}>
            <div className={`debug-line-accent accent-${type}`} />
            
            <div className="debug-header" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="debug-icon-wrapper">
                    {renderIcon()}
                </div>
                <span className="debug-title">{m.text}</span>
                {m.payload && (
                    <svg className="debug-chevron-modern" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </div>

            {isExpanded && m.payload && (
                <div className="debug-expanded-content">
                    <div className="debug-payload-container">
                        <button 
                            className={`debug-modern-copy ${copied ? 'copied' : ''}`}
                            onClick={copyToClipboard}
                        >
                            {copied ? 'COPIED' : 'COPY'}
                        </button>
                        <pre className="debug-payload-pre">
                            {m.payload}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
};

const ChatApp: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [activities, setActivities] = useState<Record<string, Activity>>({});
    const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentProfile, setCurrentProfile] = useState('Select Provider');
    const [profiles, setProfiles] = useState<string[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [isConfirmingClear, setIsConfirmingClear] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Load history and state from VS Code
        window.addEventListener('message', handleExtensionMessage);
        vscode.postMessage({ command: 'loadChat' });
        return () => window.removeEventListener('message', handleExtensionMessage);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleExtensionMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
            case 'updateProfiles':
                setProfiles(message.profiles || []);
                setCurrentProfile(message.current || 'Select Provider');
                break;
            case 'agentActivity': {
                const { id, status, log, payload, instruction, stream } = message;
                
                setActivities(prev => {
                    const existing = prev[id] || { id, status: 'running', logs: [], instruction: instruction || '' };
                    let newLogs = [...existing.logs];
                    
                    if (log) {
                        if (stream && newLogs.length > 0 && !newLogs[newLogs.length - 1].payload) {
                            // Append to last log if it's a stream and doesn't have technical payload
                            const last = newLogs[newLogs.length - 1];
                            newLogs[newLogs.length - 1] = { ...last, text: last.text + log };
                        } else {
                            newLogs.push({ text: log, payload: payload, timestamp: Date.now() });
                        }
                    }

                    return {
                        ...prev,
                        [id]: { 
                            ...existing, 
                            status: status as any, 
                            instruction: instruction || existing.instruction,
                            logs: newLogs 
                        }
                    };
                });

                // Add to message stream if it's the first time we see this activity
                setMessages(prev => {
                    if (prev.find(m => m.id === id)) return prev;
                    const activityMsg: Message = {
                        id: id,
                        sender: 'technical',
                        text: `Worker Task: ${id}`,
                        timestamp: Date.now(),
                        payload: 'ACTIVITY_PLACEHOLDER'
                    };
                    
                    const streamingIdx = prev.findIndex(m => m.id === 'streaming-now');
                    if (streamingIdx !== -1) {
                         const updated = [...prev];
                         updated.splice(streamingIdx, 0, activityMsg);
                         return updated;
                    }
                    return [...prev, activityMsg];
                });
                break;
            }
            case 'addMessage': {
                const newMsg: Message = {
                    id: Math.random().toString(36).substr(2, 9),
                    sender: message.sender.toLowerCase() as any,
                    text: message.message,
                    timestamp: Date.now(),
                    payload: message.payload
                };
                
                setMessages(prev => {
                    const streamingIdx = prev.findIndex(m => m.id === 'streaming-now');
                    if (streamingIdx !== -1) {
                        // If it's an Agent/Assistant message, it's the finalization of the current stream
                        if (newMsg.sender === 'agent' || newMsg.sender === 'assistant' || newMsg.sender === 'error') {
                            const updated = [...prev];
                            updated[streamingIdx] = newMsg;
                            return updated;
                        }
                        // If it's technical, insert BEFORE the streaming bubble so it doesn't "bury" it
                        const updated = [...prev];
                        updated.splice(streamingIdx, 0, newMsg);
                        return updated;
                    }
                    return [...prev, newMsg];
                });
                setIsProcessing(false);
                break;
            }
            case 'streamStart': {
                const streamMsg: Message = {
                    id: 'streaming-now',
                    sender: message.sender.toLowerCase() as any,
                    text: '',
                    timestamp: Date.now()
                };
                setMessages(prev => {
                    // Safety: Remove any existing streaming-now
                    const base = prev.filter(m => m.id !== 'streaming-now');
                    return [...base, streamMsg];
                });
                setIsProcessing(true);
                break;
            }
            case 'streamAppend':
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.id === 'streaming-now') {
                        return [...prev.slice(0, -1), { ...last, text: (last.text || '') + (message.message || '') }];
                    }
                    return prev;
                });
                break;
            case 'clearStreaming':
                setMessages(prev => prev.filter(m => m.id !== 'streaming-now'));
                break;
            case 'setChatHistory':
                setMessages(message.history || []);
                break;
            case 'setProcessing':
                setIsProcessing(message.value);
                break;
        }
    };

    const stopRequest = () => {
        vscode.postMessage({ command: 'cancelRequest' });
        setIsProcessing(false);
    };

    const sendMessage = () => {
        if (!input.trim() || isProcessing) return;
        
        const userMsg: Message = {
            id: Math.random().toString(36).substr(2, 9),
            sender: 'user',
            text: input,
            timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, userMsg]);
        vscode.postMessage({ command: 'processPrompt', text: input });
        setInput('');
        setIsProcessing(true);
    };

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100vh', 
            background: 'var(--vscode-sideBar-background)', 
            color: 'var(--vscode-foreground)', 
            fontFamily: 'var(--vscode-font-family)',
            overflow: 'hidden'
        }}>
            <div className="chat-header" style={{ 
                padding: '8px 12px', 
                borderBottom: '1px solid var(--vscode-divider)',
                background: 'var(--vscode-sideBarSectionHeader-background)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.6, letterSpacing: '0.05em' }}>LLM ORCHESTRATOR</div>
                <button 
                    onClick={() => {
                        if (isConfirmingClear) {
                            setMessages([]);
                            vscode.postMessage({ command: 'clearChat' });
                            setIsConfirmingClear(false);
                        } else {
                            setIsConfirmingClear(true);
                            setTimeout(() => setIsConfirmingClear(false), 3000);
                        }
                    }}
                    style={{
                        background: isConfirmingClear ? 'var(--vscode-errorForeground)' : 'none',
                        border: '1px solid var(--vscode-divider)',
                        color: isConfirmingClear ? ' white' : 'inherit',
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: 0.6,
                        transition: 'all 0.2s'
                    }}
                >
                    {isConfirmingClear ? 'REALLY?' : 'CLEAR'}
                </button>
            </div>

            <div 
                ref={scrollRef}
                className="chat-scroll-container"
                style={{ 
                    flex: '1 1 auto', 
                    overflowY: 'auto', 
                    padding: '12px 12px 60px 12px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'stretch',
                    gap: '12px',
                    scrollBehavior: 'smooth',
                    height: '100%',
                    minHeight: 0
                }}
            >
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '40px', fontSize: '12px' }}>
                        Ready to architect your vision.
                    </div>
                )}
                {messages.filter(m => {
                    if (m.payload === 'ACTIVITY_PLACEHOLDER') return true; // Always show activity cards
                    if (m.sender === 'technical') return showLogs;
                    const msgText = (m.text || '').trim();
                    if (m.sender === 'agent' || m.sender === 'assistant' || m.sender === 'system' || m.sender === 'error') {
                        return msgText.length > 0;
                    }
                    return true;
                }).map((m, i) => {
                    if (m.payload === 'ACTIVITY_PLACEHOLDER') {
                        const activity = activities[m.id];
                        if (!activity) return null;
                        return (
                            <div key={m.id} className="activity-card" style={{
                                margin: '8px 0',
                                padding: '16px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--vscode-divider)',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                animation: 'fadeIn 0.3s ease-out',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                flexShrink: 0
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                                        <div style={{ 
                                            width: '8px', 
                                            height: '8px', 
                                            borderRadius: '50%', 
                                            background: activity.status === 'running' ? '#3498db' : (activity.status === 'error' ? '#e74c3c' : '#2ecc71'),
                                            animation: activity.status === 'running' ? 'pulse 1s infinite' : 'none'
                                        }} />
                                        <span>SUB-AGENT: {m.id}</span>
                                    </div>
                                    <span style={{ fontSize: '9px', opacity: 0.5 }}>{activity.status.toUpperCase()}</span>
                                </div>
                                <div style={{ fontSize: '11px', opacity: 0.8, fontStyle: 'italic', borderLeft: '2px solid var(--vscode-divider)', paddingLeft: '8px' }}>
                                    {activity.instruction || 'Executing specialized directive...'}
                                </div>
                                <button 
                                    onClick={() => setActiveActivityId(m.id)}
                                    style={{
                                        alignSelf: 'flex-start',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid var(--vscode-divider)',
                                        color: 'var(--vscode-foreground)',
                                        fontSize: '10px',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    VIEW PROGRESS
                                </button>
                            </div>
                        );
                    }

                    return m.sender === 'technical' ? (
                        <DebugLogItem key={m.id} m={m} />
                    ) : (
                        <div 
                            key={m.id} 
                            className={`message-group ${m.sender}`}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start',
                                animation: m.id === 'streaming-now' ? 'none' : 'fadeIn 0.2s ease-out',
                                width: '100%',
                                margin: '4px 0'
                            }}
                        >
                            <div 
                                className="message-bubble"
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    borderBottomRightRadius: m.sender === 'user' ? '2px' : '12px',
                                    borderBottomLeftRadius: (m.sender === 'agent' || m.sender === 'system') ? '2px' : '12px',
                                    maxWidth: '90%',
                                    fontSize: '13px',
                                    lineHeight: '1.5',
                                    background: m.sender === 'user' ? 'var(--vscode-button-background)' : 
                                               'var(--vscode-editor-background)',
                                    color: m.sender === 'user' ? 'var(--vscode-button-foreground)' : 'inherit',
                                    border: m.sender === 'user' ? 'none' : '1px solid var(--vscode-divider)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    position: 'relative',
                                } as any}
                            >
                                {m.sender === 'user' || m.sender === 'system' || m.sender === 'error' ? (
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.text || ''}</div>
                                ) : (
                                    <div 
                                        className="markdown-content"
                                        dangerouslySetInnerHTML={{ __html: marked.parse(m.text || '') as string }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
                {isProcessing && (
                    <div style={{ display: 'flex', gap: '4px', padding: '10px', opacity: 0.5 }}>
                        <div className="dot" style={{ width: '4px', height: '4px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                        <div className="dot" style={{ width: '4px', height: '4px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite 0.2s' }}></div>
                        <div className="dot" style={{ width: '4px', height: '4px', background: 'currentColor', borderRadius: '50%', animation: 'pulse 1s infinite 0.4s' }}></div>
                    </div>
                )}
            </div>

            {activeActivityId && activities[activeActivityId] && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '24px',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ fontSize: '14px', margin: 0 }}>WORKER PERSPECTIVE: {activeActivityId}</h2>
                        <button 
                            onClick={() => setActiveActivityId(null)}
                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}
                        >✕</button>
                    </div>
                    
                    <div style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        padding: '16px', 
                        borderRadius: '8px', 
                        marginBottom: '16px',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '8px' }}>DIRECTIVE</div>
                        <div style={{ fontSize: '12px', lineHeight: '1.4' }}>{activities[activeActivityId].instruction}</div>
                    </div>

                    <div style={{ 
                        flex: 1, 
                        overflowY: 'auto', 
                        padding: '12px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {activities[activeActivityId].logs.map((log, idx) => (
                            <DebugLogItem key={idx} m={log} />
                        ))}
                    </div>
                </div>
            )}

            <div className="chat-input-area" style={{ 
                padding: '12px', 
                borderTop: '1px solid var(--vscode-divider)',
                background: 'var(--vscode-sideBar-background)'
            }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--vscode-button-secondaryBackground)', padding: '2px', borderRadius: '4px' }}>
                        </div>
                        <select 
                            value={currentProfile}
                            onChange={(e) => vscode.postMessage({ command: 'switchProfile', profile: e.target.value })}
                            style={{ 
                                background: 'none', 
                                color: 'inherit', 
                                border: '1px solid var(--vscode-divider)', 
                                borderRadius: '4px',
                                fontSize: '10px',
                                padding: '2px 4px',
                                outline: 'none',
                                opacity: 0.7,
                                cursor: 'pointer',
                                maxWidth: '200px',
                                textOverflow: 'ellipsis'
                            }}
                        >
                            {profiles.map(p => <option key={p} value={p} style={{ background: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)' }}>{p}</option>)}
                        </select>
                    </div>
                    <label style={{ fontSize: '10px', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showLogs} onChange={(e) => setShowLogs(e.target.checked)} style={{ width: '10px', height: '10px' }} />
                        DEBUGGING
                    </label>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)', borderRadius: '8px', padding: '4px' }}>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                        placeholder="Type architecture command..."
                        style={{ 
                            flex: 1,
                            minHeight: '32px',
                            maxHeight: '150px',
                            background: 'none',
                            color: 'var(--vscode-input-foreground)',
                            border: 'none',
                            padding: '6px 8px',
                            resize: 'none',
                            outline: 'none',
                            fontSize: '13px',
                            lineHeight: '1.4'
                        }}
                    />
                    <button 
                        onClick={isProcessing ? stopRequest : sendMessage}
                        disabled={!input.trim() && !isProcessing}
                        style={{ 
                            background: (input.trim() || isProcessing) ? 'var(--vscode-button-background)' : 'none',
                            color: (input.trim() || isProcessing) ? 'var(--vscode-button-foreground)' : 'inherit',
                            border: 'none',
                            borderRadius: '4px',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            opacity: (input.trim() || isProcessing) ? 1 : 0.3,
                            transition: 'all 0.2s',
                            marginBottom: '2px',
                            marginRight: '2px'
                        }}
                    >
                        {isProcessing ? '■' : '➤'}
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
                .hover-actions { opacity: 0; height: 0; overflow: hidden; transition: opacity 0.1s ease, margin-top 0.1s ease; }
                .message-bubble:hover .hover-actions { opacity: 1; height: auto; margin-top: 4px; }
                .markdown-content p { margin: 0 0 8px 0; }
                .markdown-content p:last-child { margin-bottom: 0; }
                .markdown-content pre { background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0; }
                .markdown-content code { font-family: var(--vscode-editor-font-family), monospace; background: rgba(255,255,255,0.1); padding: 1px 3px; border-radius: 2px; }
                .markdown-content pre code { background: none; padding: 0; }
                .markdown-content h1, .markdown-content h2, .markdown-content h3 { margin: 12px 0 8px 0; font-size: 1.1em; }
                .markdown-content ul, .markdown-content ol { margin: 8px 0; padding-left: 20px; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
            `}</style>
        </div>
    );
};

export default ChatApp;
