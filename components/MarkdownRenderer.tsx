import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, MessageCircle, Hammer, FileCode } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onCodeAction?: (action: string, code: string) => void;
}

const CodeBlock = ({ language, children, onCodeAction, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  
  const codeContent = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setMenuOpen(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleAction = (action: string) => {
    if (action === 'copy') {
      handleCopy();
    } else if (onCodeAction) {
      onCodeAction(action, codeContent);
    }
    setMenuOpen(false);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('click', handleClick);
    }
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  return (
    <>
      <div 
        className="rounded-md overflow-hidden my-2 border border-neutral-700 bg-[#1e1e1e] relative group"
        onContextMenu={handleContextMenu}
      >
        <div className="bg-neutral-800 px-3 py-1 text-xs text-neutral-400 font-mono border-b border-neutral-700 flex justify-between items-center select-none">
          <span>{language || 'text'}</span>
          <div className="flex items-center gap-2">
            <span className="text-orange-500 hidden sm:inline text-[10px] uppercase tracking-wider opacity-60">
              Right-Click for Actions
            </span>
            <button 
              onClick={handleCopy} 
              className="p-1 hover:bg-neutral-700 rounded transition-colors text-neutral-400 hover:text-white"
              title="Copy Code"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
          {...props}
        >
          {codeContent}
        </SyntaxHighlighter>
      </div>

      {/* Context Menu Portal/Absolute */}
      {menuOpen && (
        <div 
          ref={menuRef}
          className="fixed z-[100] bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-48 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ top: menuPos.y, left: menuPos.x }}
        >
          <div className="py-1">
            <button 
              onClick={() => handleAction('copy')} 
              className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white flex items-center gap-3 transition-colors"
            >
              <Copy size={14} /> Copy Code
            </button>
            <div className="h-px bg-neutral-700 my-1 mx-2"></div>
            <button 
              onClick={() => handleAction('explain')} 
              className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white flex items-center gap-3 transition-colors"
            >
              <MessageCircle size={14} /> Explain Code
            </button>
            <button 
              onClick={() => handleAction('refactor')} 
              className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white flex items-center gap-3 transition-colors"
            >
              <Hammer size={14} /> Refactor / Fix
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onCodeAction }) => {
  return (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <CodeBlock 
              language={match[1]} 
              children={children} 
              onCodeAction={onCodeAction}
              {...props} 
            />
          ) : (
            <code className={`${className} bg-neutral-800 text-orange-200 px-1 py-0.5 rounded text-sm`} {...props}>
              {children}
            </code>
          );
        },
        h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-orange-500 mb-3 border-b border-neutral-700 pb-2" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-orange-400 mb-2 mt-4" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-lg font-bold text-orange-300 mb-2 mt-3" {...props} />,
        p: ({ node, ...props }) => <p className="mb-2 leading-relaxed text-neutral-300" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-1 text-neutral-300" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-1 text-neutral-300" {...props} />,
        li: ({ node, ...props }) => <li className="ml-2" {...props} />,
        a: ({ node, ...props }) => <a className="text-orange-400 hover:text-orange-300 underline transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-orange-600 pl-4 py-1 my-4 bg-neutral-900/50 italic text-neutral-400" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownRenderer;