
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xl">A</span>
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900">Assistify</span>
        </div>
        <nav className="flex items-center">
          <a 
            href="/home"
            className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition-all shadow-sm text-sm font-semibold"
          >
            Get Started
          </a>
        </nav>
      </div>
    </header>
  );
};

export default Header;
