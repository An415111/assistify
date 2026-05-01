
import React, { useState, useRef, useEffect } from 'react';

const conversationScript = [
  { role: 'user', text: "Hi! How can Assistify help my retail business?" },
  { role: 'bot', text: "Hello! Assistify automates your customer support on Telegram, handling FAQs, order tracking, and lead capture 24/7." },
  { role: 'user', text: "Does it support automated order updates?" },
  { role: 'bot', text: "Yes! We can integrate with your database to send real-time shipping notifications and status updates directly to your customers' Telegram." },
  { role: 'user', text: "That sounds great. Is it hard to set up?" },
  { role: 'bot', text: "Not at all. Our drag-and-drop builder and Gemini AI engine make it easy to go live in hours, not weeks." }
];

const ChatbotSimulator: React.FC = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([]);
  const [scriptIndex, setScriptIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  
  const sectionRef = useRef<HTMLElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Track mouse for the "slow dragging" effect (mostly for desktop)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!sectionRef.current) return;
    const { clientX, clientY } = e;
    const { left, top, width, height } = sectionRef.current.getBoundingClientRect();
    
    const x = (clientX - left) / width - 0.5;
    const y = (clientY - top) / height - 0.5;
    
    setMouseOffset({ x, y });
  };

  const resetMouseOffset = () => {
    setMouseOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (isInView && scriptIndex < conversationScript.length) {
      const nextMsg = conversationScript[scriptIndex];
      const delay = scriptIndex === 0 ? 800 : 2000;
      
      const timer = setTimeout(() => {
        if (nextMsg.role === 'bot') {
          setIsTyping(true);
          setTimeout(() => {
            setMessages(prev => [...prev, nextMsg]);
            setIsTyping(false);
            setScriptIndex(prev => prev + 1);
          }, 1500);
        } else {
          setMessages(prev => [...prev, nextMsg]);
          setScriptIndex(prev => prev + 1);
        }
      }, delay);

      return () => clearTimeout(timer);
    } else if (isInView && scriptIndex >= conversationScript.length) {
      const resetTimer = setTimeout(() => {
        setMessages([]);
        setScriptIndex(0);
      }, 6000);
      return () => clearTimeout(resetTimer);
    }
  }, [scriptIndex, isInView]);

  return (
    <section 
      ref={sectionRef} 
      id="demo" 
      onMouseMove={handleMouseMove}
      onMouseLeave={resetMouseOffset}
      className="py-16 md:py-24 bg-gray-50 border-t border-gray-100 overflow-hidden perspective-1000"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="relative z-10 order-2 lg:order-1 text-center lg:text-left">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 uppercase tracking-tight">Interactive Demonstration</h2>
            <p className="text-base md:text-lg text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0">
              Experience how Assistify handles real-time customer inquiries with precision and intelligence.
            </p>
          </div>

          <div className="relative min-h-[500px] md:min-h-[700px] flex items-center justify-center order-1 lg:order-2">
            <div 
              className="absolute w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-400/10 blur-[80px] md:blur-[120px] rounded-full transition-transform duration-1000 ease-out pointer-events-none"
              style={{
                transform: `translate(${mouseOffset.x * 100}px, ${mouseOffset.y * 100}px)`
              }}
            ></div>
            
            <div 
              className="relative w-full max-w-[280px] xs:max-w-[320px] sm:max-w-[360px]"
              style={{
                transform: `
                  translate3d(${mouseOffset.x * 30}px, ${mouseOffset.y * 30}px, 0) 
                  rotateY(${mouseOffset.x * 8}deg) 
                  rotateX(${mouseOffset.y * -8}deg)
                `,
                transition: 'transform 1.2s cubic-bezier(0.23, 1, 0.32, 1)',
                transformStyle: 'preserve-3d'
              }}
            >
              <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.12)] border-[6px] md:border-[8px] border-gray-900 overflow-hidden w-full h-[500px] md:h-[600px] flex flex-col relative">
                
                <div className="bg-gray-900 h-6 flex justify-between items-center px-6 pt-2">
                  <span className="text-[10px] text-white font-medium">9:41</span>
                  <div className="flex gap-1 items-center">
                    <div className="w-3 h-2 bg-white/40 rounded-sm"></div>
                    <div className="w-2 h-2 bg-white/80 rounded-full"></div>
                    <div className="w-4 h-2 bg-green-400 rounded-sm"></div>
                  </div>
                </div>

                <div className="bg-[#242f3d] p-3 md:p-4 flex items-center gap-3 shadow-md z-10">
                  <div className="relative">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-base md:text-lg">
                      A
                    </div>
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 border-2 border-[#242f3d] rounded-full"></div>
                  </div>
                  <div>
                    <h5 className="text-white font-bold text-xs md:text-sm uppercase tracking-tight leading-tight">Assistify AI</h5>
                    <span className="text-blue-300 text-[9px] md:text-[10px]">bot • live automation</span>
                  </div>
                </div>

                <div 
                  ref={chatContainerRef}
                  className="flex-grow p-3 md:p-4 overflow-y-auto space-y-3 md:space-y-4 bg-[#0e1621] scrollbar-hide"
                >
                  {!isInView && (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-500 text-[10px] md:text-xs font-medium italic">Scroll down to see the magic</p>
                    </div>
                  )}
                  {isInView && messages.length === 0 && !isTyping && (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-500 text-[10px] md:text-xs font-medium animate-pulse">Engaging bot...</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-message`}>
                      <div className={`max-w-[85%] p-2.5 md:p-3 rounded-xl md:rounded-2xl text-[12px] md:text-sm shadow-sm leading-relaxed ${
                        m.role === 'user' 
                          ? 'bg-[#2b5278] text-white rounded-br-none' 
                          : 'bg-[#182533] text-gray-200 rounded-bl-none border border-gray-800/50'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-[#182533] text-blue-300 px-3 md:px-4 py-2 md:py-3 rounded-xl md:rounded-2xl rounded-bl-none border border-gray-800/50 flex items-center gap-1.5 md:gap-2">
                        <span className="flex gap-1">
                           <span className="w-1 md:w-1.5 h-1 md:h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                           <span className="w-1 md:w-1.5 h-1 md:h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                           <span className="w-1 md:w-1.5 h-1 md:h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 md:p-4 bg-[#17212b] border-t border-gray-800/50">
                  <div className="w-full bg-[#0e1621] border border-gray-800 rounded-full px-3 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs text-gray-500 flex justify-between items-center italic">
                    <span className="truncate mr-2">{isInView ? 'Demo in progress...' : 'Demo idle'}</span>
                    {isInView && (
                      <button 
                        onClick={() => { setMessages([]); setScriptIndex(0); }} 
                        className="text-blue-400 font-bold not-italic hover:text-blue-300 transition-colors shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="absolute top-[10%] left-[2%] w-[1.5%] h-[60%] bg-white/10 rounded-full blur-[3px] pointer-events-none"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChatbotSimulator;
