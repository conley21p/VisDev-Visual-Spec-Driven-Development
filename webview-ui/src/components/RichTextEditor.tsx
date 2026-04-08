import React, { useRef, useCallback } from 'react';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const toolbarBtn = (label: string, title: string, onClick: () => void) => (
    <button
        key={label}
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        style={{
            padding: '3px 8px',
            fontSize: '12px',
            background: 'var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1))',
            color: 'var(--vscode-button-secondaryForeground, #ccc)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '3px',
            cursor: 'pointer',
            fontFamily: 'monospace'
        }}
    >
        {label}
    </button>
);

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    const exec = useCallback((command: string, arg?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, arg);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    }, [onChange]);

    const insertBlock = useCallback((tag: string) => {
        editorRef.current?.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const node = document.createElement(tag);
        node.innerHTML = '&ZeroWidthSpace;';
        range.deleteContents();
        range.insertNode(node);
        // move caret inside
        const newRange = document.createRange();
        newRange.setStart(node, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    }, [onChange]);

    const handleInput = () => {
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    // Parse value: if it's JSON, render as readable structured text; otherwise treat as HTML
    let renderedContent = value || '';
    try {
        const parsed = JSON.parse(value);
        renderedContent = `<pre style="margin:0;white-space:pre-wrap;font-size:12px;">${JSON.stringify(parsed, null, 2)}</pre>`;
    } catch {
        // Not JSON — use raw as HTML (could be plain text or existing HTML from prior edits)
        if (!value?.includes('<')) {
            renderedContent = `<p>${value}</p>`;
        }
    }

    return (
        <div style={{ border: '1px solid var(--vscode-input-border)', borderRadius: '4px', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', gap: '4px', flexWrap: 'wrap',
                padding: '6px 8px',
                background: 'var(--vscode-editorGroupHeader-tabsBackground, rgba(0,0,0,0.2))',
                borderBottom: '1px solid var(--vscode-input-border)'
            }}>
                {toolbarBtn('B', 'Bold', () => exec('bold'))}
                {toolbarBtn('I', 'Italic', () => exec('italic'))}
                {toolbarBtn('`', 'Inline Code', () => exec('insertHTML', '<code style="background:rgba(0,0,0,0.4);padding:1px 4px;border-radius:3px;font-family:monospace">code</code>'))}
                {toolbarBtn('• List', 'Bullet List', () => exec('insertUnorderedList'))}
                {toolbarBtn('# Heading', 'Insert Heading', () => insertBlock('h4'))}
                {toolbarBtn('⎘ Code Block', 'Insert Code Block', () => exec('insertHTML', '<pre style="background:rgba(0,0,0,0.5);padding:8px;border-radius:4px;font-family:monospace;white-space:pre-wrap;font-size:11px;margin:4px 0">// code here</pre>'))}
                {toolbarBtn('— HR', 'Insert Divider', () => exec('insertHorizontalRule'))}
            </div>

            {/* Editable Area */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                dangerouslySetInnerHTML={{ __html: renderedContent }}
                data-placeholder={placeholder || 'Start typing...'}
                style={{
                    minHeight: '120px',
                    padding: '10px',
                    outline: 'none',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: 'var(--vscode-editor-foreground)',
                    background: 'var(--vscode-input-background)',
                    overflowY: 'auto',
                    fontFamily: 'var(--vscode-editor-font-family, monospace)'
                }}
            />
        </div>
    );
};

export default RichTextEditor;
